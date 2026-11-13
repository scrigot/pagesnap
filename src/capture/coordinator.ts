/**
 * Capture coordination: drives the scroll-and-capture loop against an
 * abstract driver, then hands frames to a stitcher. Browser specifics live in
 * the driver (background/driver.ts) and stitcher (capture/stitch.ts), which
 * keeps this loop unit-testable with fakes.
 */
import type { AgentPrepareOptions, AgentScrollOptions } from '../shared/messages';
import type { Settings } from '../shared/settings';
import type { CapturedFrame, CaptureSummary, PageMetrics } from '../shared/types';
import {
  FRAME_OVERLAP_CSS,
  captureHeightLimit,
  estimateFrameCount,
  nextAxisPosition,
  planOutput,
  type OutputPlan,
} from './geometry';
import type { RateLimiter } from './rate-limit';

export interface CaptureDriver {
  prepare(options: AgentPrepareOptions): Promise<{ metrics: PageMetrics; title: string }>;
  scrollTo(options: AgentScrollOptions): Promise<PageMetrics>;
  restore(): Promise<void>;
  /** Returns a PNG data URL of the visible viewport. */
  captureVisible(): Promise<string>;
}

export type Stitcher = (frames: CapturedFrame[], plan: OutputPlan) => Promise<Blob>;

export class CancelledError extends Error {
  constructor() {
    super('Capture cancelled');
    this.name = 'CancelledError';
  }
}

export interface RunCaptureParams {
  sessionId: string;
  driver: CaptureDriver;
  stitch: Stitcher;
  settings: Settings;
  limiter: RateLimiter;
  signal?: AbortSignal;
  onProgress?: (frame: number, totalEstimate: number) => void;
  onStitch?: (frames: number) => void;
  now?: () => number;
}

export interface RunCaptureResult {
  blob: Blob;
  summary: CaptureSummary;
}

export async function runCapture(p: RunCaptureParams): Promise<RunCaptureResult> {
  const now = p.now ?? (() => Date.now());
  const t0 = now();
  const check = () => {
    if (p.signal?.aborted) throw new CancelledError();
  };

  const frames: CapturedFrame[] = [];
  const warnings: string[] = [];
  const prepared = await p.driver.prepare({ flattenSticky: p.settings.flattenSticky });
  const title = prepared.title;
  let last: PageMetrics = prepared.metrics;
  const limitH = captureHeightLimit(
    last.contentSize.width,
    last.devicePixelRatio,
    p.settings.maxCaptureHeight,
    p.settings.oversizeStrategy,
  );
  try {
    let y: number | null = null;
    let lastActualY = -1;
    rows: for (;;) {
      const contentH = Math.min(last.contentSize.height, limitH);
      y = nextAxisPosition(y, contentH, last.clientRect.height, FRAME_OVERLAP_CSS);
      if (y === null) break;
      let x: number | null = null;
      let rowActualY = y;
      for (;;) {
        x = nextAxisPosition(x, last.contentSize.width, last.clientRect.width, FRAME_OVERLAP_CSS);
        if (x === null) break;
        check();
        last = await p.driver.scrollTo({
          x,
          y,
          frameIndex: frames.length,
          delayMs: p.settings.captureDelayMs,
          hideFixed: p.settings.hideFixedAfterFirst && frames.length > 0,
        });
        await p.limiter.wait();
        check();
        const dataUrl = await p.driver.captureVisible();
        frames.push({ index: frames.length, scroll: { ...last.scroll }, metrics: last, dataUrl });
        rowActualY = last.scroll.y;
        const est = Math.max(
          frames.length,
          estimateFrameCount(
            { width: last.contentSize.width, height: Math.min(last.contentSize.height, limitH) },
            { width: last.clientRect.width, height: last.clientRect.height },
          ),
        );
        p.onProgress?.(frames.length, est);
      }
      if (rowActualY <= lastActualY + 0.5) {
        warnings.push(
          'The page stopped scrolling before its reported end; the capture may be shorter than the page.',
        );
        break rows;
      }
      lastActualY = rowActualY;
      // Continue from where the page actually scrolled to (scroll snapping, clamping).
      y = rowActualY;
    }
  } finally {
    await p.driver.restore().catch(() => undefined);
  }
  check();

  // What the frames actually cover, never more than the content.
  let coveredW = 0;
  let coveredH = 0;
  for (const f of frames) {
    coveredW = Math.max(coveredW, f.scroll.x + f.metrics.clientRect.width);
    coveredH = Math.max(coveredH, f.scroll.y + f.metrics.clientRect.height);
  }
  const width = Math.min(coveredW, last.contentSize.width);
  const height = Math.min(coveredH, last.contentSize.height);

  if (last.contentSize.height > height + 1 && !warnings.length) {
    const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
    const why =
      limitH < last.contentSize.height
        ? limitH < p.settings.maxCaptureHeight
          ? 'browser canvas limit'
          : 'Settings > Maximum capture height'
        : 'page stopped scrolling';
    warnings.push(
      `Captured the first ${fmt(height)} of ${fmt(last.contentSize.height)} px (${why}).`,
    );
  }

  const plan = planOutput({
    content: { width, height },
    scale: last.devicePixelRatio,
    maxCaptureHeight: Number.POSITIVE_INFINITY,
    strategy: 'downscale',
  });
  warnings.push(...plan.warnings);
  if (last.targetKind === 'element')
    warnings.push(
      'Captured the main scrolling panel of this page (the page itself does not scroll).',
    );

  p.onStitch?.(frames.length);
  const blob = await p.stitch(frames, plan);

  return {
    blob,
    summary: {
      sessionId: p.sessionId,
      width: plan.width,
      height: plan.height,
      bytes: blob.size,
      frames: frames.length,
      durationMs: now() - t0,
      outputScale: plan.drawScale,
      warnings,
      title,
      createdAt: now(),
    },
  };
}
