/**
 * Pure geometry for scroll-and-stitch capture. No browser APIs here so every
 * rule is unit-testable. Units are CSS pixels unless a name says otherwise.
 */
import type { OversizeStrategy } from '../shared/settings';
import type { Point, Rect, Size } from '../shared/types';

/**
 * Conservative canvas limits for Chromium. Chrome rejects canvases above
 * 32767 px per side or ~268M px area; allocating near the area limit also
 * needs ~1 GB of RAM, so stay at or below it.
 */
export const CANVAS_LIMITS = { maxSide: 32767, maxArea: 16384 * 16384 } as const;

/**
 * Consecutive frames overlap by this many CSS px. Chrome snaps scroll offsets
 * to device pixels, so stepping by exactly one viewport can leave a sub-pixel
 * gap (seen as a 1 px white seam at 150% zoom). Overlapping regions are
 * overwritten with identical pixels, so the overlap is invisible.
 */
export const FRAME_OVERLAP_CSS = 1;

/** Chrome allows MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND = 2. */
export const CAPTURE_MIN_INTERVAL_MS = 510;

/**
 * Next scroll offset along one axis, or null when the axis is fully covered.
 * The last step is clamped to `content - view` so it overlaps the previous
 * frame instead of scrolling past the end; the overlap is overwritten with
 * identical pixels during stitching.
 */
export function nextAxisPosition(
  prev: number | null,
  content: number,
  view: number,
  overlap = 0,
): number | null {
  const maxScroll = Math.max(0, content - view);
  if (prev === null) return 0;
  if (view <= 0) return null;
  if (prev >= maxScroll - 0.5) return null;
  const step = view > overlap * 4 ? view - overlap : view;
  return Math.min(prev + step, maxScroll);
}

/** All scroll offsets needed to cover `content` with windows of size `view`. */
export function axisPositions(content: number, view: number, overlap = 0): number[] {
  const out: number[] = [];
  let p: number | null = null;
  // Upper bound guards against pathological inputs (view rounding to ~0).
  for (let i = 0; i < 100000; i++) {
    p = nextAxisPosition(p, content, view, overlap);
    if (p === null) break;
    out.push(p);
  }
  return out;
}

/** Row-major grid of scroll positions covering a 2-D content area. */
export function gridPositions(content: Size, view: Size): Point[] {
  const xs = axisPositions(content.width, view.width);
  const ys = axisPositions(content.height, view.height);
  const out: Point[] = [];
  for (const y of ys) for (const x of xs) out.push({ x, y });
  return out;
}

export function estimateFrameCount(content: Size, view: Size): number {
  return (
    axisPositions(content.width, view.width).length *
    axisPositions(content.height, view.height).length
  );
}

/** Image pixels per CSS pixel for one captured frame (folds in DPR and browser zoom). */
export function frameScale(imageWidth: number, viewportWidth: number): number {
  if (viewportWidth <= 0) return 1;
  return imageWidth / viewportWidth;
}

/**
 * Tallest CSS height that can be captured: the user's cap, and for the
 * 'truncate' strategy also the canvas limit at full device resolution.
 * Independent of current content height so pages that grow while scrolling
 * are still bounded correctly.
 */
export function captureHeightLimit(
  contentWidth: number,
  scale: number,
  maxCaptureHeight: number,
  strategy: OversizeStrategy,
  limits: { maxSide: number; maxArea: number } = CANVAS_LIMITS,
): number {
  if (strategy !== 'truncate') return maxCaptureHeight;
  const outW = Math.round(Math.max(1, contentWidth) * scale);
  if (outW > limits.maxSide) return maxCaptureHeight; // width forces downscale anyway
  const canvasH = Math.floor(Math.min(limits.maxSide / scale, limits.maxArea / (outW * scale)));
  return Math.min(maxCaptureHeight, canvasH);
}

export interface OutputPlan {
  /** Output canvas size in pixels. */
  width: number;
  height: number;
  /** Output pixels per CSS pixel. Equals the device scale unless downscaled. */
  drawScale: number;
  /** CSS height that will be captured (may be less than the page). */
  captureHeight: number;
  captureWidth: number;
  downscaled: boolean;
  truncated: boolean;
  warnings: string[];
}

export interface PlanInput {
  content: Size;
  /** Device scale (image px per CSS px) measured from the first frame or DPR. */
  scale: number;
  maxCaptureHeight: number;
  strategy: OversizeStrategy;
  limits?: { maxSide: number; maxArea: number };
}

/**
 * Decide the output size. Never silently shrinks or crops: every reduction
 * adds a human-readable warning that the UI must show.
 */
export function planOutput(input: PlanInput): OutputPlan {
  const limits = input.limits ?? CANVAS_LIMITS;
  const warnings: string[] = [];
  const cssW = Math.max(1, Math.ceil(input.content.width));
  let cssH = Math.max(1, Math.ceil(input.content.height));
  let truncated = false;

  if (cssH > input.maxCaptureHeight) {
    warnings.push(
      `Page is ${cssH.toLocaleString('en-US')} px tall; captured the first ${input.maxCaptureHeight.toLocaleString('en-US')} px (Settings > Maximum capture height).`,
    );
    cssH = input.maxCaptureHeight;
    truncated = true;
  }

  let scale = input.scale;
  const fits = (s: number, h: number) =>
    Math.round(cssW * s) <= limits.maxSide &&
    Math.round(h * s) <= limits.maxSide &&
    Math.round(cssW * s) * Math.round(h * s) <= limits.maxArea;

  let downscaled = false;
  if (!fits(scale, cssH)) {
    if (input.strategy === 'truncate') {
      // Keep full resolution, crop height to what the canvas can hold.
      const byWidthSide = Math.round(cssW * scale) <= limits.maxSide;
      if (byWidthSide) {
        const maxH = Math.floor(
          Math.min(limits.maxSide / scale, limits.maxArea / (Math.round(cssW * scale) * scale)),
        );
        if (maxH < cssH) {
          warnings.push(
            `Output exceeded browser canvas limits; captured the first ${maxH.toLocaleString('en-US')} px at full resolution.`,
          );
          cssH = maxH;
          truncated = true;
        }
      }
    }
    if (!fits(scale, cssH)) {
      const sSide = Math.min(limits.maxSide / cssW, limits.maxSide / cssH);
      const sArea = Math.sqrt(limits.maxArea / (cssW * cssH));
      const s = Math.min(sSide, sArea) * 0.999;
      warnings.push(
        `Output exceeded browser canvas limits; downscaled to ${Math.round((s / input.scale) * 100)}% of device resolution.`,
      );
      scale = s;
      downscaled = true;
    }
  }

  return {
    width: Math.max(1, Math.round(cssW * scale)),
    height: Math.max(1, Math.round(cssH * scale)),
    drawScale: scale,
    captureHeight: cssH,
    captureWidth: cssW,
    downscaled,
    truncated,
    warnings,
  };
}

export interface DrawRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * Where to copy one frame. Source is the target's client rect inside the
 * screenshot (excludes scrollbars and, for inner scrollers, the surrounding
 * chrome). Destination edges are rounded independently so adjacent frames
 * share edges exactly: no 1 px seams or gaps from fractional scroll offsets.
 */
export function frameDrawRect(
  scroll: Point,
  clientRect: Rect,
  imageScale: number,
  drawScale: number,
): DrawRect {
  const sx = Math.round(clientRect.left * imageScale);
  const sy = Math.round(clientRect.top * imageScale);
  const sw = Math.max(1, Math.round(clientRect.width * imageScale));
  const sh = Math.max(1, Math.round(clientRect.height * imageScale));
  const dx = Math.round(scroll.x * drawScale);
  const dy = Math.round(scroll.y * drawScale);
  const dx2 = Math.round((scroll.x + clientRect.width) * drawScale);
  const dy2 = Math.round((scroll.y + clientRect.height) * drawScale);
  return { sx, sy, sw, sh, dx, dy, dw: dx2 - dx, dh: dy2 - dy };
}
