export type OversizeStrategy = 'downscale' | 'truncate';

export interface Settings {
  /** Start capturing as soon as the popup opens (toolbar click or shortcut). */
  autoStart: boolean;
  /** Copy the PNG to the clipboard when capture finishes. */
  autoCopy: boolean;
  /** Also save the PNG via chrome.downloads (needs optional permission). */
  autoDownload: boolean;
  /** Extra wait after each scroll, for pages that animate or lazy-load slowly. */
  captureDelayMs: number;
  /** Hard cap on captured page height, in CSS pixels. */
  maxCaptureHeight: number;
  /** What to do when the output exceeds browser canvas limits. */
  oversizeStrategy: OversizeStrategy;
  /** Hide position:fixed elements after the first frame so they appear once. */
  hideFixedAfterFirst: boolean;
  /** Render position:sticky elements in their natural position. */
  flattenSticky: boolean;
  /** Close the popup automatically after a successful copy. */
  closePopupAfterCopy: boolean;
  /** Show progress and result on the toolbar badge. */
  badge: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  autoStart: true,
  autoCopy: true,
  autoDownload: false,
  captureDelayMs: 0,
  maxCaptureHeight: 30000,
  oversizeStrategy: 'downscale',
  hideFixedAfterFirst: true,
  flattenSticky: true,
  closePopupAfterCopy: false,
  badge: true,
};

export const LIMITS = {
  captureDelayMs: { min: 0, max: 5000 },
  maxCaptureHeight: { min: 1000, max: 200000 },
} as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Merge stored values over defaults, dropping unknown keys and wrong types. */
export function normalizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = r[key];
    const def = DEFAULT_SETTINGS[key];
    if (typeof v !== typeof def) continue;
    (out as unknown as Record<string, unknown>)[key] = v;
  }
  if (out.oversizeStrategy !== 'downscale' && out.oversizeStrategy !== 'truncate')
    out.oversizeStrategy = DEFAULT_SETTINGS.oversizeStrategy;
  out.captureDelayMs = clamp(
    Math.round(out.captureDelayMs),
    LIMITS.captureDelayMs.min,
    LIMITS.captureDelayMs.max,
  );
  out.maxCaptureHeight = clamp(
    Math.round(out.maxCaptureHeight),
    LIMITS.maxCaptureHeight.min,
    LIMITS.maxCaptureHeight.max,
  );
  return out;
}

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(KEY);
  return normalizeSettings(stored[KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await chrome.storage.sync.set({ [KEY]: next });
  return next;
}
