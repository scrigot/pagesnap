import { describe, expect, it, vi } from 'vitest';
import { writeImageToClipboard, type ClipboardEnv } from '../../src/clipboard/clipboard';
import { createRateLimiter } from '../../src/capture/rate-limit';
import { PageSnapError, isRestrictedUrl, toErrorInfo } from '../../src/shared/errors';
import { downloadFilename, formatBytes, formatDims } from '../../src/shared/format';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/shared/settings';

class FakeClipboardItem {
  constructor(public items: Record<string, Blob>) {}
}

function env(
  write: (items: unknown[]) => Promise<void>,
  focused = true,
): ClipboardEnv & { focus: ReturnType<typeof vi.fn> } {
  return {
    clipboard: { write },
    ClipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem,
    hasFocus: () => focused,
    focus: vi.fn(),
  };
}

describe('clipboard (mocked Clipboard API, not a real browser)', () => {
  const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

  it('writes a single image/png ClipboardItem', async () => {
    const write = vi.fn(async () => undefined);
    await writeImageToClipboard(png, env(write));
    const [items] = write.mock.calls[0] as unknown as [FakeClipboardItem[]];
    expect(Object.keys(items[0]!.items)).toEqual(['image/png']);
  });

  it('refocuses the document before writing', async () => {
    const e = env(async () => undefined, false);
    await writeImageToClipboard(png, e);
    expect(e.focus).toHaveBeenCalled();
  });

  it('maps NotAllowedError to CLIPBOARD_DENIED', async () => {
    const e = env(async () => {
      throw new DOMException('Document is not focused.', 'NotAllowedError');
    });
    await expect(writeImageToClipboard(png, e)).rejects.toMatchObject({ code: 'CLIPBOARD_DENIED' });
  });

  it('reports unsupported environments', async () => {
    await expect(
      writeImageToClipboard(png, { hasFocus: () => true, focus: () => undefined }),
    ).rejects.toMatchObject({ code: 'CLIPBOARD_UNSUPPORTED' });
  });
});

describe('restricted pages', () => {
  it.each([
    'chrome://settings',
    'chrome-extension://abc/popup.html',
    'https://chromewebstore.google.com/detail/x',
    'https://chrome.google.com/webstore/category/extensions',
    'view-source:https://example.com',
    'edge://flags',
  ])('blocks %s', (u) => expect(isRestrictedUrl(u)).toBe(true));

  it.each(['https://example.com', 'http://localhost:3000', 'about:blank', undefined])(
    'allows %s',
    (u) => expect(isRestrictedUrl(u)).toBe(false),
  );
});

describe('errors', () => {
  it('carries actionable hints', () => {
    const info = new PageSnapError('RESTRICTED_PAGE').toInfo();
    expect(info.hint).toMatch(/regular website/);
    expect(toErrorInfo(new Error('x'))).toMatchObject({ code: 'UNKNOWN', message: 'x' });
    expect(toErrorInfo('s')).toMatchObject({ code: 'UNKNOWN', message: 's' });
  });
});

describe('settings', () => {
  it('fills defaults and drops bad types', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    const s = normalizeSettings({
      autoCopy: 'yes',
      captureDelayMs: 99999,
      maxCaptureHeight: 5,
      oversizeStrategy: 'bogus',
      junk: 1,
    });
    expect(s.autoCopy).toBe(true);
    expect(s.captureDelayMs).toBe(5000);
    expect(s.maxCaptureHeight).toBe(1000);
    expect(s.oversizeStrategy).toBe('downscale');
    expect('junk' in s).toBe(false);
  });
});

describe('rate limiter', () => {
  it('spaces calls by the minimum interval', async () => {
    let t = 0;
    const sleeps: number[] = [];
    const rl = createRateLimiter(
      500,
      () => t,
      async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    );
    await rl.wait();
    t += 100;
    await rl.wait();
    t += 600;
    await rl.wait();
    expect(sleeps).toEqual([400]);
  });
});

describe('format', () => {
  it('formats sizes and names', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatDims(2560, 16000)).toBe('2,560 × 16,000');
    expect(downloadFilename({ createdAt: new Date(2026, 0, 2, 3, 4, 5).getTime() })).toBe(
      'PageSnap 2026-01-02 at 03.04.05.png',
    );
  });
});
