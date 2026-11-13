// Benchmark harness: runs real captures of the local fixtures in Chromium with
// the E2E build and records measured metrics. Also saves a CDP full-page
// screenshot of each fixture as a reference for research/evaluation.
//
// Usage: npm run bench -- [--runs 3] [--dsf 1] [--out research/results/<name>]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const runs = Number(arg('runs', 3));
const dsf = Number(arg('dsf', 1));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = resolve(root, arg('out', `research/results/${stamp}-dsf${dsf}`));
const FIXTURES = [
  'short.html',
  'long.html',
  'sticky.html',
  'fixed.html',
  'dynamic.html',
  'inner-scroll.html',
  'wide.html',
  'lazy-images.html',
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/slow-image.svg') {
    await new Promise((r) => setTimeout(r, 300));
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
    return res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#10b981"/></svg>',
    );
  }
  try {
    const body = await readFile(resolve(root, 'tests/fixtures', `.${url.pathname}`));
    res.writeHead(200, {
      'content-type': extname(url.pathname) === '.js' ? 'text/javascript' : 'text/html',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const ext = resolve(root, 'dist-e2e');
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: null,
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    `--force-device-scale-factor=${dsf}`,
    '--window-size=1280,800',
  ],
});
const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
await mkdir(out, { recursive: true });

const results = [];
for (const fixture of FIXTURES) {
  const page = await context.newPage();
  await page.goto(`${base}/${fixture}`);
  await page.bringToFront();
  const tabId = await sw.evaluate(
    async (u) => (await chrome.tabs.query({ url: u }))[0].id,
    page.url(),
  );
  for (let run = 0; run < runs; run++) {
    const prev = await sw.evaluate(() => globalThis.__pagesnapTest.getState().sessionId ?? '');
    const t0 = Date.now();
    await sw.evaluate((t) => void globalThis.__pagesnapTest.start(t), tabId);
    let state;
    for (;;) {
      state = await sw.evaluate(() => globalThis.__pagesnapTest.getState());
      if (
        state.sessionId &&
        state.sessionId !== prev &&
        ['success', 'failure', 'cancelled'].includes(state.phase)
      )
        break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const wallMs = Date.now() - t0;
    if (state.phase !== 'success') {
      results.push({ fixture, run, ok: false, phase: state.phase, error: state.error ?? null });
      continue;
    }
    const s = state.summary;
    const name = `${fixture.replace('.html', '')}-run${run}.png`;
    const b64 = await sw.evaluate(async () => {
      const r = await globalThis.__pagesnapTest.getResult();
      const bytes = new Uint8Array(await r.blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    });
    await writeFile(resolve(out, name), Buffer.from(b64, 'base64'));
    results.push({
      fixture,
      run,
      ok: true,
      file: name,
      width: s.width,
      height: s.height,
      bytes: s.bytes,
      frames: s.frames,
      captureMs: s.durationMs,
      wallMs,
      outputScale: s.outputScale,
      warnings: s.warnings,
    });
    console.log(
      `${fixture} run ${run}: ${s.width}x${s.height} ${s.frames} frames ${s.durationMs} ms ${(s.bytes / 1024).toFixed(0)} KB`,
    );
  }
  // Reference: Chrome DevTools Protocol full-page screenshot of the same page.
  await page.screenshot({
    path: resolve(out, `${fixture.replace('.html', '')}-reference.png`),
    fullPage: true,
  });
  await page.close();
}

const meta = {
  createdAt: new Date().toISOString(),
  runsPerFixture: runs,
  deviceScaleFactor: dsf,
  window: '1280x800',
  chromium: context.browser()?.version() ?? 'persistent-context',
  userAgent: await sw.evaluate(() => navigator.userAgent),
  host: {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model,
    memGB: Math.round(os.totalmem() / 2 ** 30),
  },
  note: 'Headless Chromium in a container. Timings are dominated by the 2 calls/s captureVisibleTab quota.',
};
await writeFile(resolve(out, 'results.json'), JSON.stringify({ meta, results }, null, 2));
console.log(`\nwrote ${resolve(out, 'results.json')}`);
await context.close();
server.close();
