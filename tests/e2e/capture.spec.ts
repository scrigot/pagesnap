/**
 * Real-browser capture tests. These run the actual extension in Chromium and
 * assert on decoded output pixels. Nothing here is mocked.
 */
import { test, expect, analyzeBands, type Run } from './harness';

const seq = (n: number) => [...Array(n).keys()];
const near = (a: { r: number; g: number; b: number }, b: [number, number, number], tol = 12) =>
  Math.abs(a.r - b[0]) + Math.abs(a.g - b[1]) + Math.abs(a.b - b[2]) <= tol;
const pxOfColor = (runs: Run[], rgb: [number, number, number], tol = 12) =>
  runs.filter((r) => near(r.c, rgb, tol)).reduce((n, r) => n + (r.y1 - r.y0), 0);

test('short page: single frame, no padding', async ({ snap }) => {
  const page = await snap.open('short.html');
  const r = await snap.capture(page, 'short');
  const s = r.state.summary;
  expect(s.frames).toBe(1);
  expect(s.width).toBe(1280);
  expect(analyzeBands(await r.column(0.75), 3, s.outputScale).order).toEqual(seq(3));
});

test('long page: every band once, in order, pixel-aligned; scroll restored', async ({ snap }) => {
  const page = await snap.open('long.html');
  await page.evaluate(() => window.scrollTo(0, 1234));
  const r = await snap.capture(page, 'long');
  const s = r.state.summary;
  expect(s).toMatchObject({ width: 1280, height: 6000, warnings: [] });
  const rep = analyzeBands(await r.column(0.75), 60, s.outputScale);
  expect(rep.order).toEqual(seq(60));
  expect(rep.maxAlignmentError).toBeLessThanOrEqual(1);
  expect(rep.gapPx).toBe(0);
  expect(rep.unmatchedPx).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(1234);
});

test('sticky header appears once at the top and is restored afterwards', async ({ snap }) => {
  const page = await snap.open('sticky.html');
  const r = await snap.capture(page, 'sticky');
  const s = r.state.summary;
  const runs = await r.column(0.75);
  expect(pxOfColor(runs, [255, 0, 255])).toBe(60 * s.outputScale);
  expect(near(runs[0]!.c, [255, 0, 255])).toBe(true);
  const rep = analyzeBands(runs, 50, s.outputScale, 60);
  expect(rep.order).toEqual(seq(50));
  expect(rep.maxAlignmentError).toBeLessThanOrEqual(1);
  expect(rep.gapPx).toBe(0);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('h')!).position)).toBe(
    'sticky',
  );
});

test('fixed header appears once at the top and is visible again afterwards', async ({ snap }) => {
  const page = await snap.open('fixed.html');
  const r = await snap.capture(page, 'fixed');
  const s = r.state.summary;
  const runs = await r.column(0.75);
  expect(pxOfColor(runs, [0, 255, 255])).toBe(50 * s.outputScale);
  const rep = analyzeBands(runs, 50, s.outputScale, 50);
  expect(rep.order).toEqual(seq(50));
  expect(rep.maxAlignmentError).toBeLessThanOrEqual(1);
  expect(rep.gapPx).toBe(0);
  expect(
    await page.evaluate(() => getComputedStyle(document.getElementById('h')!).visibility),
  ).toBe('visible');
});

test('dynamic content: follows a page that grows while scrolling', async ({ snap }) => {
  const page = await snap.open('dynamic.html');
  const r = await snap.capture(page, 'dynamic');
  expect(r.state.summary.height).toBe(6000);
  const rep = analyzeBands(await r.column(0.75), 60, r.state.summary.outputScale);
  expect(rep.order).toEqual(seq(60));
  expect(rep.maxAlignmentError).toBeLessThanOrEqual(1);
});

test('app shell: captures the inner scrolling panel', async ({ snap }) => {
  const page = await snap.open('inner-scroll.html');
  const mainWidth = await page.evaluate(() => document.getElementById('main')!.clientWidth);
  const r = await snap.capture(page, 'inner-scroll');
  const s = r.state.summary;
  expect(s.width).toBe(mainWidth);
  expect(s.height).toBe(4000);
  expect(s.warnings.join(' ')).toMatch(/main scrolling panel/);
  const rep = analyzeBands(await r.column(0.75), 40, s.outputScale);
  expect(rep.order).toEqual(seq(40));
  expect(rep.maxAlignmentError).toBeLessThanOrEqual(1);
  expect(rep.gapPx).toBe(0);
  expect(await page.evaluate(() => document.getElementById('main')!.scrollTop)).toBe(0);
});

test('horizontal overflow: 2-D grid capture', async ({ snap }) => {
  const page = await snap.open('wide.html');
  const r = await snap.capture(page, 'wide');
  const s = r.state.summary;
  expect(s).toMatchObject({ width: 2400, height: 3000 });
  const pts: [number, number][] = [];
  const want: [number, number, number][] = [];
  for (let row = 0; row < 30; row++)
    for (let k = 0; k < 12; k++) {
      pts.push([k * 200 + 150, row * 100 + 50]);
      const i = row * 12 + k;
      want.push([(i * 67 + 30) % 256, (i * 131 + 60) % 256, (i * 29 + 90) % 256]);
    }
  const got = await r.sample(pts);
  const bad = got.filter((c, i) => !near(c, want[i]!)).length;
  expect(bad).toBe(0);
});

test('responsive layout at a narrow window', async ({ snap }) => {
  const page = await snap.open('long.html', { width: 500, height: 800 });
  const r = await snap.capture(page, 'narrow');
  const s = r.state.summary;
  expect(s.width).toBeLessThan(600);
  const rep = analyzeBands(await r.column(0.75), 60, s.outputScale);
  expect(rep.order).toEqual(seq(60));
  expect(rep.maxAlignmentError).toBeLessThanOrEqual(1);
});

test('browser zoom 150%', async ({ snap, sw }) => {
  const page = await snap.open('long.html');
  const id = await snap.tabId(page);
  await sw.evaluate((tid) => chrome.tabs.setZoom(tid, 1.5), id);
  await page.waitForFunction(() => window.devicePixelRatio === 1.5);
  const r = await snap.capture(page, 'zoom150');
  const s = r.state.summary;
  expect(s.outputScale).toBeCloseTo(1.5, 2);
  expect(s.height).toBe(9000);
  const rep = analyzeBands(await r.column(0.75), 60, s.outputScale);
  expect(rep.order).toEqual(seq(60));
  expect(rep.maxAlignmentError).toBeLessThanOrEqual(1);
  expect(rep.gapPx).toBe(0);
});

test('lazy images are loaded before each frame is captured', async ({ snap }) => {
  const page = await snap.open('lazy-images.html');
  const r = await snap.capture(page, 'lazy-images');
  const runs = await r.column(0.5);
  const green = pxOfColor(runs, [16, 185, 129], 6);
  expect(green).toBe(12 * 400 * r.state.summary.outputScale);
});

test('max capture height truncates and warns', async ({ snap, sw }) => {
  await sw.evaluate(() => chrome.storage.sync.set({ settings: { maxCaptureHeight: 2000 } }));
  const page = await snap.open('long.html');
  const r = await snap.capture(page, 'truncated');
  expect(r.state.summary.height).toBe(2000);
  expect(r.state.summary.warnings.join(' ')).toMatch(/2,000 of 6,000/);
  await sw.evaluate(() => chrome.storage.sync.clear());
});

test('restricted page fails with actionable error', async ({ snap }) => {
  const page = await snap.open('short.html');
  await page.goto('chrome://version');
  await snap.start(page);
  const s = await snap.waitFor((x) => x.phase === 'failure');
  expect(s).toMatchObject({ phase: 'failure', error: { code: 'RESTRICTED_PAGE' } });
  if (s.phase === 'failure') expect(s.error.hint).toMatch(/regular website/);
});

test('cancel mid-capture restores scroll and allows recovery', async ({ snap, sw }) => {
  await sw.evaluate(() => chrome.storage.sync.set({ settings: { captureDelayMs: 300 } }));
  const page = await snap.open('long.html');
  await page.evaluate(() => window.scrollTo(0, 500));
  await snap.start(page);
  await snap.waitFor((x) => x.phase === 'capturing' && x.frame >= 2);
  await snap.cancel();
  await snap.waitFor((x) => x.phase === 'cancelled');
  expect(await page.evaluate(() => window.scrollY)).toBe(500);
  await sw.evaluate(() => chrome.storage.sync.clear());
  const r = await snap.capture(page, 'after-cancel');
  expect(analyzeBands(await r.column(0.75), 60, r.state.summary.outputScale).order).toEqual(
    seq(60),
  );
});

test('duplicate start while busy does not start a second session', async ({ snap }) => {
  const page = await snap.open('long.html');
  await snap.start(page);
  const first = await snap.waitFor((x) => x.phase === 'capturing');
  await snap.start(page);
  const done = await snap.waitFor((x) => x.phase === 'success');
  expect('sessionId' in first && 'sessionId' in done && first.sessionId === done.sessionId).toBe(
    true,
  );
});

test('high-DPI (device scale factor 2) @dpr', async ({ snap }) => {
  const page = await snap.open('long.html');
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
  const r = await snap.capture(page, 'dpr2');
  const s = r.state.summary;
  expect(s).toMatchObject({ width: 2560, height: 12000, outputScale: 2 });
  const rep = analyzeBands(await r.column(0.75), 60, 2);
  expect(rep.order).toEqual(seq(60));
  expect(rep.maxAlignmentError).toBeLessThanOrEqual(1);
  expect(rep.gapPx).toBe(0);
  expect(rep.unmatchedPx).toBe(0);
});

test('oversized page: downscales to canvas limits and says so', async ({ snap, sw }) => {
  test.setTimeout(150_000);
  await sw.evaluate(() => chrome.storage.sync.set({ settings: { maxCaptureHeight: 60000 } }));
  const page = await snap.open('long.html?n=400'); // 40,000 CSS px > 32,767 px canvas side
  const r = await snap.capture(page, 'oversized');
  const s = r.state.summary;
  expect(s.height).toBeLessThanOrEqual(32767);
  expect(s.outputScale).toBeLessThan(1);
  expect(s.warnings.join(' ')).toMatch(/downscaled to \d+%/);
  // Palette repeats every 256 bands, so check each band's center color directly.
  const pts = seq(400).map((i): [number, number] => [
    Math.floor(s.width * 0.75),
    Math.floor((i * 100 + 50) * s.outputScale),
  ]);
  const got = await r.sample(pts);
  const wrong = got.filter(
    (c, i) => !near(c, [(i * 67 + 30) % 256, (i * 131 + 60) % 256, (i * 29 + 90) % 256]),
  ).length;
  expect(wrong).toBe(0);
  await sw.evaluate(() => chrome.storage.sync.clear());
});
