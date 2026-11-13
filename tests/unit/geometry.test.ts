import { describe, expect, it } from 'vitest';
import {
  CANVAS_LIMITS,
  axisPositions,
  captureHeightLimit,
  estimateFrameCount,
  frameDrawRect,
  frameScale,
  gridPositions,
  nextAxisPosition,
  planOutput,
} from '../../src/capture/geometry';

describe('scroll position generation', () => {
  it('captures a short page in one frame', () => {
    expect(axisPositions(500, 800)).toEqual([0]);
    expect(axisPositions(800, 800)).toEqual([0]);
  });

  it('steps by viewport for exact multiples', () => {
    expect(axisPositions(3000, 1000)).toEqual([0, 1000, 2000]);
  });

  it('clamps the last frame to the end so it overlaps instead of overscrolling', () => {
    expect(axisPositions(2500, 1000)).toEqual([0, 1000, 1500]);
  });

  it('covers every pixel exactly: union of windows equals content', () => {
    for (const [content, view] of [
      [10000, 937],
      [1234, 1233],
      [7777, 100],
      [999.5, 400],
    ] as const) {
      const ps = axisPositions(content, view);
      expect(ps[0]).toBe(0);
      expect(ps.at(-1)! + view).toBeCloseTo(Math.max(content, view), 5);
      for (let i = 1; i < ps.length; i++) expect(ps[i]! - ps[i - 1]!).toBeLessThanOrEqual(view);
    }
  });

  it('overlaps frames by the requested amount but never overscrolls', () => {
    expect(axisPositions(3000, 1000, 1)).toEqual([0, 999, 1998, 2000]);
    expect(axisPositions(500, 800, 1)).toEqual([0]);
  });

  it('returns null once covered and guards zero-size views', () => {
    expect(nextAxisPosition(null, 100, 0)).toBe(0);
    expect(nextAxisPosition(0, 100, 0)).toBeNull();
    expect(nextAxisPosition(1500, 2500, 1000)).toBeNull();
  });

  it('builds a row-major grid for wide pages', () => {
    expect(gridPositions({ width: 1500, height: 1500 }, { width: 1000, height: 1000 })).toEqual([
      { x: 0, y: 0 },
      { x: 500, y: 0 },
      { x: 0, y: 500 },
      { x: 500, y: 500 },
    ]);
    expect(estimateFrameCount({ width: 1500, height: 1500 }, { width: 1000, height: 1000 })).toBe(
      4,
    );
  });
});

describe('device pixel ratio and zoom', () => {
  it('derives image scale from the captured bitmap, not assumptions', () => {
    expect(frameScale(2560, 1280)).toBe(2); // DPR 2
    expect(frameScale(1920, 1280)).toBe(1.5); // 150% zoom at DPR 1
    expect(frameScale(100, 0)).toBe(1);
  });
});

describe('stitch coordinates', () => {
  const rect = { left: 0, top: 0, width: 1280, height: 720 };

  it('maps a frame to its scroll offset at device scale', () => {
    expect(frameDrawRect({ x: 0, y: 720 }, rect, 2, 2)).toEqual({
      sx: 0,
      sy: 0,
      sw: 2560,
      sh: 1440,
      dx: 0,
      dy: 1440,
      dw: 2560,
      dh: 1440,
    });
  });

  it('leaves no seams or gaps with fractional scroll offsets', () => {
    const scale = 1.25;
    const view = 719.2;
    const ys = axisPositions(5000.4, view);
    const rects = ys.map((y) =>
      frameDrawRect({ x: 0, y }, { ...rect, height: view }, scale, scale),
    );
    for (let i = 1; i < rects.length - 1; i++) {
      expect(rects[i]!.dy).toBe(rects[i - 1]!.dy + rects[i - 1]!.dh);
    }
    const last = rects.at(-1)!;
    expect(last.dy + last.dh).toBe(Math.round(5000.4 * scale));
  });

  it('crops an inner scroller out of the screenshot', () => {
    const r = frameDrawRect(
      { x: 0, y: 300 },
      { left: 240, top: 56, width: 800, height: 600 },
      2,
      2,
    );
    expect(r).toMatchObject({ sx: 480, sy: 112, sw: 1600, sh: 1200, dx: 0, dy: 600 });
  });

  it('applies output downscale to destination only', () => {
    const r = frameDrawRect({ x: 0, y: 1000 }, rect, 2, 0.5);
    expect(r).toMatchObject({ sw: 2560, sh: 1440, dy: 500, dw: 640, dh: 360 });
  });
});

describe('output planning and size limits', () => {
  it('keeps full device resolution when within limits', () => {
    const p = planOutput({
      content: { width: 1280, height: 8000 },
      scale: 2,
      maxCaptureHeight: 30000,
      strategy: 'downscale',
    });
    expect(p).toMatchObject({
      width: 2560,
      height: 16000,
      drawScale: 2,
      downscaled: false,
      truncated: false,
    });
    expect(p.warnings).toEqual([]);
  });

  it('truncates at maxCaptureHeight and says so', () => {
    const p = planOutput({
      content: { width: 1000, height: 50000 },
      scale: 1,
      maxCaptureHeight: 20000,
      strategy: 'downscale',
    });
    expect(p.height).toBe(20000);
    expect(p.truncated).toBe(true);
    expect(p.warnings[0]).toMatch(/first 20,000 px/);
  });

  it('downscales to fit the canvas side limit and says so', () => {
    const p = planOutput({
      content: { width: 1280, height: 25000 },
      scale: 2,
      maxCaptureHeight: 30000,
      strategy: 'downscale',
    });
    expect(p.height).toBeLessThanOrEqual(CANVAS_LIMITS.maxSide);
    expect(p.width * p.height).toBeLessThanOrEqual(CANVAS_LIMITS.maxArea);
    expect(p.downscaled).toBe(true);
    expect(p.warnings.join(' ')).toMatch(/downscaled to \d+%/);
  });

  it('downscales to fit the canvas area limit', () => {
    const limits = { maxSide: 100000, maxArea: 1_000_000 };
    const p = planOutput({
      content: { width: 1000, height: 2000 },
      scale: 1,
      maxCaptureHeight: 1e9,
      strategy: 'downscale',
      limits,
    });
    expect(p.width * p.height).toBeLessThanOrEqual(limits.maxArea);
  });

  it('truncate strategy keeps resolution and cuts height', () => {
    const p = planOutput({
      content: { width: 1280, height: 25000 },
      scale: 2,
      maxCaptureHeight: 30000,
      strategy: 'truncate',
    });
    expect(p.drawScale).toBe(2);
    expect(p.height).toBeLessThanOrEqual(CANVAS_LIMITS.maxSide);
    expect(p.truncated).toBe(true);
  });

  it('captureHeightLimit bounds growing pages for truncate only', () => {
    expect(captureHeightLimit(1280, 2, 30000, 'downscale')).toBe(30000);
    const t = captureHeightLimit(1280, 2, 30000, 'truncate');
    expect(t * 2).toBeLessThanOrEqual(CANVAS_LIMITS.maxSide);
    expect(t).toBeGreaterThan(10000);
  });
});
