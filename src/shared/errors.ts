/** Stable error codes surfaced to the UI. Each maps to actionable guidance. */
export type ErrorCode =
  | 'RESTRICTED_PAGE'
  | 'NO_ACTIVE_TAB'
  | 'INJECTION_FAILED'
  | 'CAPTURE_FAILED'
  | 'STITCH_FAILED'
  | 'CLIPBOARD_UNSUPPORTED'
  | 'CLIPBOARD_DENIED'
  | 'CLIPBOARD_NO_POPUP'
  | 'TAB_CHANGED'
  | 'BUSY'
  | 'NO_RESULT'
  | 'UNKNOWN';

export interface PageSnapErrorInfo {
  code: ErrorCode;
  message: string;
  hint: string;
}

const HINTS: Record<ErrorCode, string> = {
  RESTRICTED_PAGE:
    'Chrome does not allow extensions to capture this page (chrome://, the Chrome Web Store, other extensions, or file:// without permission). Open a regular website and try again.',
  NO_ACTIVE_TAB: 'Focus the tab you want to capture and open PageSnap again.',
  INJECTION_FAILED:
    'PageSnap could not access this page. Reload the tab and try again. Some pages (PDF viewer, browser UI) cannot be scripted.',
  CAPTURE_FAILED:
    'Chrome refused a screenshot. Keep the tab visible and focused during capture, then retry.',
  STITCH_FAILED:
    'The image could not be assembled, usually because the page is too large for memory. Lower "Maximum capture height" in Settings.',
  CLIPBOARD_UNSUPPORTED:
    'This browser does not support writing images to the clipboard. Use Download instead.',
  CLIPBOARD_DENIED:
    'Clipboard write was blocked, usually because the popup lost focus. Click "Copy" to retry.',
  CLIPBOARD_NO_POPUP:
    'The popup closed before the image could be copied, so nothing was put on the clipboard. Click "Copy" (or press C) to copy it now.',
  TAB_CHANGED: 'The tab navigated or closed during capture. Try again once the page has loaded.',
  BUSY: 'A capture is already running.',
  NO_RESULT: 'No capture is available yet. Capture a page first.',
  UNKNOWN:
    'Something unexpected happened. Open Settings > Diagnostics and include the log in a bug report.',
};

export class PageSnapError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PageSnapError';
    this.code = code;
  }
  toInfo(): PageSnapErrorInfo {
    return { code: this.code, message: this.message, hint: HINTS[this.code] };
  }
}

export function hintFor(code: ErrorCode): string {
  return HINTS[code];
}

export function toErrorInfo(err: unknown): PageSnapErrorInfo {
  if (err instanceof PageSnapError) return err.toInfo();
  const message = err instanceof Error ? err.message : String(err);
  return { code: 'UNKNOWN', message, hint: HINTS.UNKNOWN };
}

/** URL schemes/hosts Chrome never lets extensions script or capture. */
export function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return false; // unknown URL: let injection decide
  const lower = url.toLowerCase();
  if (
    /^(chrome|chrome-extension|chrome-untrusted|devtools|edge|about|view-source|chrome-search):/.test(
      lower,
    )
  )
    return !lower.startsWith('about:blank');
  if (/^https:\/\/chrome\.google\.com\/webstore/.test(lower)) return true;
  if (/^https:\/\/chromewebstore\.google\.com/.test(lower)) return true;
  return false;
}
