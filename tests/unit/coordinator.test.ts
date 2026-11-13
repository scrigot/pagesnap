import { describe, expect, it, vi } from 'vitest';
import {
  CancelledError,
  runCapture,
  type CaptureDriver,
  type Stitcher,
} from '../../src/capture/coordinator';
import { PageSnapError } from '../../src/shared/errors';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/settings';
import type { PageMetrics } from '../../src/shared/types';

interface FakePage {
  width: number;
  height: number;
  vw: number;
  vh: number;
  dpr?: number;
  /** Grow content by this much each time we scroll near the bottom (lazy loading). */
  growBy?: number;
  growUntil?: number;
  /** Page refuses to scroll past this offset. */
  stuckAt?: number;
  failCaptureAt?: number;
}

function fakeDriver(page: FakePage) {
  let scrollX = 0;
  let scrollY = 0;
  let height = page.height;
  const calls: { x: number; y: number; hideFixed: boolean }[] = [];
  const metrics = (): PageMetrics => ({
    targetKind: 'document',
    viewport: { width: page.vw, height: page.vh },
    clientRect: { left: 0, top: 0, width: page.vw, height: page.vh },
    contentSize: { width: page.width, height },
    scroll: { x: scrollX, y: scrollY },
    devicePixelRatio: page.dpr ?? 1,
  });
  let captures = 0;
  const driver: CaptureDriver & { restored: number } = {
    restored: 0,
    prepare: vi.fn(async () => ({ metrics: metrics(), title: 'Fake' })),
    scrollTo: vi.fn(async (o) => {
      calls.push({ x: o.x, y: o.y, hideFixed: o.hideFixed });
      scrollX = Math.min(o.x, Math.max(0, page.width - page.vw));
      scrollY = Math.min(o.y, Math.max(0, height - page.vh), page.stuckAt ?? Infinity);
      if (page.growBy && scrollY + page.vh >= height - 1 && height < (page.growUntil ?? Infinity))
        height += page.growBy;
      return metrics();
    }),
    restore: vi.fn(async () => {
      driver.restored++;
    }),
    captureVisible: vi.fn(async () => {
      if (page.failCaptureAt === captures) throw new PageSnapError('CAPTURE_FAILED', 'boom');
      captures++;
      return 'data:image/png;base64,';
    }),
  };
  return { driver, calls };
}

const stitch: Stitcher = async (_frames, plan) =>
  new Blob([new Uint8Array(plan.width % 7)], { type: 'image/png' });
const limiter = { wait: async () => undefined };
const settings = (p: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...p });

describe('runCapture', () => {
  it('captures a long page top to bottom with a clamped final frame', async () => {
    const { driver, calls } = fakeDriver({ width: 1000, height: 2500, vw: 1000, vh: 1000 });
    const res = await runCapture({ sessionId: 's', driver, stitch, settings: settings(), limiter });
    // 1 CSS px overlap between frames absorbs Chrome's device-pixel scroll snapping.
    expect(calls.map((c) => c.y)).toEqual([0, 999, 1500]);
    expect(res.summary).toMatchObject({ width: 1000, height: 2500, frames: 3, warnings: [] });
    expect(driver.restored).toBe(1);
  });

  it('shows fixed elements only in the first frame', async () => {
    const { driver, calls } = fakeDriver({ width: 800, height: 2500, vw: 800, vh: 1000 });
    await runCapture({ sessionId: 's', driver, stitch, settings: settings(), limiter });
    expect(calls.map((c) => c.hideFixed)).toEqual([false, true, true]);
  });

  it('captures a short page in one frame', async () => {
    const { driver, calls } = fakeDriver({ width: 800, height: 600, vw: 800, vh: 900 });
    const res = await runCapture({ sessionId: 's', driver, stitch, settings: settings(), limiter });
    expect(calls).toHaveLength(1);
    expect(res.summary).toMatchObject({ width: 800, height: 600 });
  });

  it('scales output by device pixel ratio', async () => {
    const { driver } = fakeDriver({ width: 1280, height: 4000, vw: 1280, vh: 800, dpr: 2 });
    const res = await runCapture({ sessionId: 's', driver, stitch, settings: settings(), limiter });
    expect(res.summary).toMatchObject({ width: 2560, height: 8000, outputScale: 2 });
  });

  it('follows content that grows while scrolling (lazy loading)', async () => {
    const { driver } = fakeDriver({
      width: 800,
      height: 2000,
      vw: 800,
      vh: 1000,
      growBy: 1000,
      growUntil: 5000,
    });
    const res = await runCapture({ sessionId: 's', driver, stitch, settings: settings(), limiter });
    expect(res.summary.height).toBe(5000);
  });

  it('stops infinite scroll at maxCaptureHeight and warns', async () => {
    const { driver } = fakeDriver({ width: 800, height: 2000, vw: 800, vh: 1000, growBy: 1000 });
    const res = await runCapture({
      sessionId: 's',
      driver,
      stitch,
      settings: settings({ maxCaptureHeight: 6000 }),
      limiter,
    });
    expect(res.summary.height).toBe(6000);
    expect(res.summary.warnings.join(' ')).toMatch(/Maximum capture height/);
  });

  it('detects a page that stops scrolling and warns instead of looping', async () => {
    const { driver, calls } = fakeDriver({
      width: 800,
      height: 5000,
      vw: 800,
      vh: 1000,
      stuckAt: 1000,
    });
    const res = await runCapture({ sessionId: 's', driver, stitch, settings: settings(), limiter });
    expect(calls.length).toBeLessThan(5);
    expect(res.summary.height).toBe(2000);
    expect(res.summary.warnings.join(' ')).toMatch(/stopped scrolling/);
  });

  it('restores the page when capture fails', async () => {
    const { driver } = fakeDriver({
      width: 800,
      height: 5000,
      vw: 800,
      vh: 1000,
      failCaptureAt: 2,
    });
    await expect(
      runCapture({ sessionId: 's', driver, stitch, settings: settings(), limiter }),
    ).rejects.toMatchObject({
      code: 'CAPTURE_FAILED',
    });
    expect(driver.restored).toBe(1);
  });

  it('cancels between frames and restores the page', async () => {
    const ctl = new AbortController();
    const { driver } = fakeDriver({ width: 800, height: 5000, vw: 800, vh: 1000 });
    const p = runCapture({
      sessionId: 's',
      driver,
      stitch,
      settings: settings(),
      limiter,
      signal: ctl.signal,
      onProgress: (f) => f === 2 && ctl.abort(),
    });
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(driver.restored).toBe(1);
    expect(driver.captureVisible).toHaveBeenCalledTimes(2);
  });

  it('captures horizontally overflowing pages as a grid', async () => {
    const { driver, calls } = fakeDriver({ width: 1500, height: 1500, vw: 1000, vh: 1000 });
    const res = await runCapture({ sessionId: 's', driver, stitch, settings: settings(), limiter });
    expect(calls.map((c) => [c.x, c.y])).toEqual([
      [0, 0],
      [500, 0],
      [0, 500],
      [500, 500],
    ]);
    expect(res.summary).toMatchObject({ width: 1500, height: 1500 });
  });

  it('respects the rate limiter between captures', async () => {
    const { driver } = fakeDriver({ width: 800, height: 2500, vw: 800, vh: 1000 });
    const wait = vi.fn(async () => undefined);
    await runCapture({ sessionId: 's', driver, stitch, settings: settings(), limiter: { wait } });
    expect(wait).toHaveBeenCalledTimes(3);
  });
});
