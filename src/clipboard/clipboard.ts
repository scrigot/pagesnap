/**
 * Clipboard writes happen in the popup, a visible and focused extension page.
 *
 * Why not the service worker or an offscreen document? Service workers have
 * no navigator.clipboard. Offscreen documents (reason CLIPBOARD) are never
 * focused, so the async Clipboard API rejects there, and the documented
 * offscreen workaround (document.execCommand('copy')) only handles text.
 * With the "clipboardWrite" permission, a focused extension page can call
 * navigator.clipboard.write() without a fresh user gesture.
 */
import { PageSnapError } from '../shared/errors';

export interface ClipboardEnv {
  clipboard?: { write(items: ClipboardItem[]): Promise<void> };
  ClipboardItem?: typeof ClipboardItem;
  hasFocus(): boolean;
  focus(): void;
}

export function browserClipboardEnv(): ClipboardEnv {
  return {
    clipboard: navigator.clipboard,
    ClipboardItem: typeof ClipboardItem === 'undefined' ? undefined : ClipboardItem,
    hasFocus: () => document.hasFocus(),
    focus: () => window.focus(),
  };
}

export async function writeImageToClipboard(
  blob: Blob,
  env: ClipboardEnv = browserClipboardEnv(),
): Promise<void> {
  if (!env.clipboard?.write || !env.ClipboardItem) {
    throw new PageSnapError('CLIPBOARD_UNSUPPORTED', 'ClipboardItem / clipboard.write unavailable');
  }
  if (blob.type !== 'image/png') blob = new Blob([blob], { type: 'image/png' });
  if (!env.hasFocus()) env.focus();
  try {
    await env.clipboard.write([new env.ClipboardItem({ 'image/png': blob })]);
  } catch (e) {
    const name = e instanceof DOMException || e instanceof Error ? e.name : '';
    const message = e instanceof Error ? e.message : String(e);
    if (name === 'NotAllowedError' || name === 'SecurityError')
      throw new PageSnapError('CLIPBOARD_DENIED', message);
    if (name === 'DataError' || name === 'NotSupportedError')
      throw new PageSnapError('CLIPBOARD_UNSUPPORTED', message);
    throw new PageSnapError('CLIPBOARD_DENIED', message);
  }
}
