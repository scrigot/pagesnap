/**
 * Clipboard path through the real popup page, in real Chromium.
 *
 * Scope, stated honestly: headless Chromium has its own clipboard, so these
 * tests prove the extension's write succeeds and the clipboard then holds a
 * decodable image/png of the right size. They do not touch the OS clipboard;
 * pasting into another app is verified manually (docs/TESTING.md).
 *
 * Reading the clipboard back uses `clipboardRead`, which only the E2E build
 * declares. The production build writes with `clipboardWrite` alone.
 *
 * The popup is opened as a normal extension page in its own window
 * (popup/index.html?tabId=N) because Playwright cannot click the toolbar.
 */
import type { Page } from '@playwright/test';
import { test, expect, OUT } from './harness';
import { resolve } from 'node:path';

async function openPopup(
  context: import('@playwright/test').BrowserContext,
  sw: import('@playwright/test').Worker,
  extensionId: string,
  tabId: number,
): Promise<Page> {
  const url = `chrome-extension://${extensionId}/popup/index.html?tabId=${tabId}`;
  const [popup] = await Promise.all([
    context.waitForEvent('page', (p) => p.url().startsWith(url)),
    sw.evaluate(
      (u) => chrome.windows.create({ url: u, focused: true, width: 360, height: 560 }),
      url,
    ),
  ]);
  await popup.waitForLoadState();
  return popup;
}

async function readClipboardImage(popup: Page) {
  return popup.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items[0]!;
    const blob = await item.getType('image/png');
    const bmp = await createImageBitmap(blob);
    const out = { types: item.types, bytes: blob.size, width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  });
}

test('toolbar flow: popup opens, captures, and copies a PNG automatically', async ({
  snap,
  context,
  sw,
  extensionId,
}) => {
  const page = await snap.open('long.html');
  const tabId = await snap.tabId(page);
  const popup = await openPopup(context, sw, extensionId, tabId);

  await expect(popup.locator('#title')).toHaveText('Copied to clipboard', { timeout: 60_000 });
  const s = await snap.state();
  expect(s).toMatchObject({ phase: 'success', copied: true });

  const clip = await readClipboardImage(popup);
  expect(clip.types).toContain('image/png');
  expect(clip).toMatchObject({ width: 1280, height: 6000 });
  expect(clip.bytes).toBeGreaterThan(1000);
  await popup.screenshot({ path: resolve(OUT, 'popup-success.png') });
});

test('popup closed before copy: honest state, then Copy recovers', async ({
  snap,
  context,
  sw,
  extensionId,
}) => {
  const page = await snap.open('long.html');
  const tabId = await snap.tabId(page);
  // Capture with no popup attached (equivalent to the popup closing mid-capture).
  await snap.start(page);
  const s = await snap.waitFor((x) => x.phase === 'success');
  expect(s).toMatchObject({ copied: false, clipboardError: { code: 'CLIPBOARD_NO_POPUP' } });

  const popup = await openPopup(context, sw, extensionId, tabId);
  // Recent uncopied result: popup offers it instead of recapturing.
  await expect(popup.locator('#title')).toHaveText('Captured, not copied');
  await expect(popup.locator('#copy')).toBeVisible();
  await popup.screenshot({ path: resolve(OUT, 'popup-not-copied.png') });

  await popup.keyboard.press('c');
  await expect(popup.locator('#title')).toHaveText('Copied to clipboard');
  expect(await snap.state()).toMatchObject({ phase: 'success', copied: true });
  expect(await readClipboardImage(popup)).toMatchObject({ width: 1280, height: 6000 });
});

test('restricted page: popup shows guidance', async ({ snap, context, sw, extensionId }) => {
  const page = await snap.open('short.html');
  await page.goto('chrome://version');
  const popup = await openPopup(context, sw, extensionId, await snap.tabId(page));
  await expect(popup.locator('#title')).toHaveText('Cannot capture this page');
  await expect(popup.locator('.warnings')).toContainText('regular website');
  expect(['idle', 'failure']).toContain((await snap.state()).phase);
  await popup.screenshot({ path: resolve(OUT, 'popup-restricted.png') });
});

test('settings page renders and persists changes', async ({ context, extensionId, sw }) => {
  const opts = await context.newPage();
  await opts.setViewportSize({ width: 1200, height: 900 });
  await opts.goto(`chrome-extension://${extensionId}/options/index.html`);
  const delay = opts.locator('[data-key="captureDelayMs"]');
  await delay.fill('99999');
  await delay.dispatchEvent('change');
  await expect(delay).toHaveValue('5000'); // clamped
  const stored = await sw.evaluate(() => chrome.storage.sync.get('settings'));
  expect((stored.settings as { captureDelayMs: number }).captureDelayMs).toBe(5000);
  await opts.screenshot({ path: resolve(OUT, 'options.png'), fullPage: true });
  await sw.evaluate(() => chrome.storage.sync.clear());
});
