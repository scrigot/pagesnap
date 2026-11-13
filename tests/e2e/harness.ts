/**
 * Real-Chromium harness: loads the E2E build of the extension (dist-e2e),
 * serves fixtures over HTTP, drives captures through the service worker's
 * test hook, and decodes results inside the browser for pixel assertions.
 */
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { CaptureState } from '../../src/shared/types';

const ROOT = resolve(import.meta.dirname, '../..');
const EXT = resolve(ROOT, 'dist-e2e');
const FIXTURES = resolve(ROOT, 'tests/fixtures');
export const OUT = resolve(ROOT, 'test-results/captures');

/** Shape of the service-worker test hook compiled into the E2E build only. */
interface Hooked {
  __pagesnapTest: {
    start(tabId: number): Promise<void>;
    cancel(): void;
    getState(): CaptureState;
    getResult(): Promise<{ blob: Blob } | undefined>;
  };
}

export interface HarnessOptions {
  /** Passed as --force-device-scale-factor (not Playwright's emulated DPR). */
  dsf: number;
}

interface Fixtures {
  context: BrowserContext;
  sw: Worker;
  extensionId: string;
  baseUrl: string;
  snap: Snapper;
}

function startServer(): Promise<Server> {
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.svg': 'image/svg+xml',
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/slow-image.svg') {
      await new Promise((r) => setTimeout(r, 300));
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
      res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#10b981"/></svg>',
      );
      return;
    }
    try {
      const body = await readFile(resolve(FIXTURES, `.${url.pathname}`));
      res.writeHead(200, {
        'content-type': types[extname(url.pathname)] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}
export interface Run {
  y0: number;
  y1: number;
  c: RGB;
}

export interface SnapResult {
  state: Extract<CaptureState, { phase: 'success' }>;
  png: Buffer;
  /** Run-length encoded column of the output at fraction `x` of its width. */
  column(xFrac: number): Promise<Run[]>;
  sample(points: [number, number][]): Promise<RGB[]>;
}

export class Snapper {
  private tabIds = new WeakMap<Page, number>();
  constructor(
    private sw: Worker,
    private context: BrowserContext,
    private baseUrl: string,
  ) {}

  /**
   * Opens a fixture in a real browser window. Window size is set through
   * chrome.windows (no CDP viewport emulation, which would fake DPR).
   */
  async open(fixture: string, windowSize?: { width: number; height: number }): Promise<Page> {
    const page = await this.context.newPage();
    await page.goto(`${this.baseUrl}/${fixture}`);
    await page.bringToFront();
    const url = page.url();
    this.tabIds.set(
      page,
      await this.sw.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]!.id!, url),
    );
    if (windowSize) {
      const id = await this.tabId(page);
      await this.sw.evaluate(
        async ([tid, w, h]) => {
          const t = await chrome.tabs.get(tid!);
          await chrome.windows.update(t.windowId, { width: w, height: h });
        },
        [id, windowSize.width, windowSize.height] as const,
      );
      await page.waitForFunction((w) => Math.abs(window.innerWidth - w) < 40, windowSize.width);
    }
    return page;
  }

  async tabId(page: Page): Promise<number> {
    const id = this.tabIds.get(page);
    if (id === undefined) throw new Error('page was not opened with snap.open()');
    return id;
  }

  async state(): Promise<CaptureState> {
    return this.sw.evaluate(() => (globalThis as unknown as Hooked).__pagesnapTest.getState());
  }

  async waitFor(pred: (s: CaptureState) => boolean, timeout = 60_000): Promise<CaptureState> {
    const t0 = Date.now();
    for (;;) {
      const s = await this.state();
      if (pred(s)) return s;
      if (Date.now() - t0 > timeout) throw new Error(`timeout; last state ${JSON.stringify(s)}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  /** Start a capture through the SW hook (no popup attached). Resolves once the new session exists. */
  async start(page: Page): Promise<void> {
    await page.bringToFront();
    const id = await this.tabId(page);
    const before = await this.state();
    const prev = 'sessionId' in before ? before.sessionId : '';
    const busy = ['capturing', 'stitching', 'copying'].includes(before.phase);
    await this.sw.evaluate((tid) => {
      void (globalThis as unknown as Hooked).__pagesnapTest.start(tid);
    }, id);
    if (!busy) await this.waitFor((s) => 'sessionId' in s && s.sessionId !== prev);
  }

  async cancel(): Promise<void> {
    await this.sw.evaluate(() => (globalThis as unknown as Hooked).__pagesnapTest.cancel());
  }

  async capture(page: Page, name: string): Promise<SnapResult> {
    await this.start(page);
    const s = await this.waitFor(
      (x) => x.phase === 'success' || x.phase === 'failure' || x.phase === 'cancelled',
    );
    if (s.phase !== 'success') throw new Error(`capture ended in ${s.phase}: ${JSON.stringify(s)}`);
    return this.result(s, name);
  }

  async result(
    state: Extract<CaptureState, { phase: 'success' }>,
    name: string,
  ): Promise<SnapResult> {
    const b64 = await this.sw.evaluate(async () => {
      const r = (await (globalThis as unknown as Hooked).__pagesnapTest.getResult())!;
      const bytes = new Uint8Array(await r.blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    });
    const png = Buffer.from(b64, 'base64');
    await mkdir(OUT, { recursive: true });
    await writeFile(resolve(OUT, `${name}.png`), png);
    const sw = this.sw;
    return {
      state,
      png,
      column: (xFrac) =>
        sw.evaluate(async (xf) => {
          const r = (await (globalThis as unknown as Hooked).__pagesnapTest.getResult())!;
          const bmp = await createImageBitmap(r.blob);
          const x = Math.min(bmp.width - 1, Math.floor(bmp.width * xf));
          const c = new OffscreenCanvas(1, bmp.height);
          const ctx = c.getContext('2d')!;
          ctx.drawImage(bmp, x, 0, 1, bmp.height, 0, 0, 1, bmp.height);
          const d = ctx.getImageData(0, 0, 1, bmp.height).data;
          const runs: { y0: number; y1: number; c: { r: number; g: number; b: number } }[] = [];
          for (let y = 0; y < bmp.height; y++) {
            const [R, G, B] = [d[y * 4]!, d[y * 4 + 1]!, d[y * 4 + 2]!];
            const last = runs[runs.length - 1];
            if (last && last.c.r === R && last.c.g === G && last.c.b === B) last.y1 = y + 1;
            else runs.push({ y0: y, y1: y + 1, c: { r: R, g: G, b: B } });
          }
          bmp.close();
          return runs;
        }, xFrac),
      sample: (points) =>
        sw.evaluate(async (pts) => {
          const r = (await (globalThis as unknown as Hooked).__pagesnapTest.getResult())!;
          const bmp = await createImageBitmap(r.blob);
          const c = new OffscreenCanvas(bmp.width, bmp.height);
          const ctx = c.getContext('2d')!;
          ctx.drawImage(bmp, 0, 0);
          const out = pts.map(([x, y]) => {
            const d = ctx.getImageData(x, y, 1, 1).data;
            return { r: d[0]!, g: d[1]!, b: d[2]! };
          });
          bmp.close();
          return out;
        }, points),
    };
  }
}

/* ---------- band analysis (mirrors tests/fixtures/bands.js) ---------- */

export const BAND = 100;
export const bandColor = (i: number): RGB => ({
  r: (i * 67 + 30) % 256,
  g: (i * 131 + 60) % 256,
  b: (i * 29 + 90) % 256,
});
const dist = (a: RGB, b: RGB) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

export interface BandReport {
  /** Band indices in the order they appear top to bottom. */
  order: number[];
  /** White pixels inside the banded region: seams or missing content. */
  gapPx: number;
  /** Pixels in 1-2 px runs at band edges (anti-aliasing at fractional zoom). */
  edgeBlendPx: number;
  /** Max |measured - expected| band start, in output pixels. */
  maxAlignmentError: number;
  /** Pixels that match no band color (seams, blending, foreign content). */
  unmatchedPx: number;
}

/**
 * Classifies each run of a column to the nearest band color and compares band
 * start positions to where they should be: (offset + i * BAND) * scale.
 */
export function analyzeBands(
  runs: Run[],
  count: number,
  scale: number,
  offsetCss = 0,
  tol = 24,
): BandReport {
  const palette = Array.from({ length: count }, (_, i) => bandColor(i));
  const starts = new Map<number, number>();
  const order: number[] = [];
  let unmatched = 0;
  let gap = 0;
  let blend = 0;
  const top = offsetCss * scale;
  const bottom = (offsetCss + count * BAND) * scale;
  for (const run of runs) {
    if (run.y1 <= top || run.y0 >= bottom) continue;
    if (run.c.r > 250 && run.c.g > 250 && run.c.b > 250) {
      gap += run.y1 - run.y0;
      continue;
    }
    if (run.y1 - run.y0 <= 2) {
      // Chrome blends band edges that fall on fractional device pixels.
      blend += run.y1 - run.y0;
      continue;
    }
    let best = -1;
    let bestD = Infinity;
    palette.forEach((p, i) => {
      const d = dist(p, run.c);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (bestD > tol) {
      unmatched += run.y1 - run.y0;
      continue;
    }
    if (order[order.length - 1] !== best) order.push(best);
    if (!starts.has(best)) starts.set(best, run.y0);
  }
  let maxErr = 0;
  for (const [i, y] of starts) {
    if (i === 0) continue; // band 0's start is the page top / header edge
    maxErr = Math.max(maxErr, Math.abs(y - (offsetCss + i * BAND) * scale));
  }
  return {
    order,
    maxAlignmentError: maxErr,
    unmatchedPx: unmatched,
    gapPx: gap,
    edgeBlendPx: blend,
  };
}

export const test = base.extend<Fixtures & HarnessOptions, { server: Server }>({
  dsf: [1, { option: true }],
  server: [
    async ({}, use) => {
      const s = await startServer();
      await use(s);
      s.close();
    },
    { scope: 'worker' },
  ],
  baseUrl: async ({ server }, use) => {
    await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  },
  context: async ({ dsf }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${EXT}`,
        `--load-extension=${EXT}`,
        `--force-device-scale-factor=${dsf}`,
        '--window-size=1280,800',
      ],
      viewport: null,
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await use(sw);
  },
  extensionId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },
  snap: async ({ sw, context, baseUrl }, use) => {
    await use(new Snapper(sw, context, baseUrl));
  },
});

export const expect = test.expect;
