/**
 * Canvas stitching. Runs in the service worker (OffscreenCanvas +
 * createImageBitmap are available there). Frames are decoded one at a time
 * and released immediately, so peak memory is one output canvas plus one frame.
 */
import { PageSnapError } from '../shared/errors';
import type { CapturedFrame } from '../shared/types';
import { frameDrawRect, frameScale, type OutputPlan } from './geometry';

export async function stitchFrames(frames: CapturedFrame[], plan: OutputPlan): Promise<Blob> {
  let canvas: OffscreenCanvas;
  let ctx: OffscreenCanvasRenderingContext2D | null;
  try {
    canvas = new OffscreenCanvas(plan.width, plan.height);
    ctx = canvas.getContext('2d', { alpha: false });
  } catch (e) {
    throw new PageSnapError(
      'STITCH_FAILED',
      `Could not allocate ${plan.width}x${plan.height} canvas: ${String(e)}`,
    );
  }
  if (!ctx)
    throw new PageSnapError(
      'STITCH_FAILED',
      `Could not allocate ${plan.width}x${plan.height} canvas`,
    );

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, plan.width, plan.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (const frame of frames) {
    const blob = await (await fetch(frame.dataUrl)).blob();
    const bmp = await createImageBitmap(blob);
    try {
      const s = frameScale(bmp.width, frame.metrics.viewport.width);
      const r = frameDrawRect(frame.scroll, frame.metrics.clientRect, s, plan.drawScale);
      ctx.drawImage(bmp, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
    } finally {
      bmp.close();
    }
    frame.dataUrl = ''; // release the encoded frame early
  }

  try {
    return await canvas.convertToBlob({ type: 'image/png' });
  } catch (e) {
    throw new PageSnapError('STITCH_FAILED', `PNG encoding failed: ${String(e)}`);
  }
}
