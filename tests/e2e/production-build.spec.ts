/** Loads the production build (dist/, no test hooks, activeTab only) and checks it starts cleanly. */
import { chromium, test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const DIST = resolve(import.meta.dirname, '../../dist');

test('production build loads: service worker, popup and options render without errors', async () => {
  const manifest = JSON.parse(await readFile(resolve(DIST, 'manifest.json'), 'utf8'));
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'clipboardWrite', 'storage']);

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: null,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  try {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    expect(
      await sw.evaluate(() => typeof (globalThis as Record<string, unknown>).__pagesnapTest),
    ).toBe('undefined');
    const id = new URL(sw.url()).host;
    for (const path of ['popup/index.html', 'options/index.html']) {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`chrome-extension://${id}/${path}`);
      await page.waitForLoadState('networkidle');
      expect(errors).toEqual([]);
      await page.close();
    }
    const cmds = await sw.evaluate(() => chrome.commands.getAll());
    expect(cmds.find((c) => c.name === '_execute_action')).toBeTruthy();
  } finally {
    await context.close();
  }
});
