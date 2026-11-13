import { writeImageToClipboard } from '../clipboard/clipboard';
import {
  PageSnapError,
  isRestrictedUrl,
  toErrorInfo,
  type PageSnapErrorInfo,
} from '../shared/errors';
import { downloadFilename, formatBytes, formatDims, formatDuration } from '../shared/format';
import { POPUP_PORT, type BackgroundToPopup, type PopupToBackground } from '../shared/messages';
import { getResult } from '../shared/result-store';
import { loadSettings, type Settings } from '../shared/settings';
import type { CaptureState } from '../shared/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const shell = $('shell');
const titleEl = $('title');
const metaEl = $('meta');
const barEl = $('bar');
const detailEl = $('detail');
const warningsEl = $('warnings');
const preview = $('preview');
const previewImg = $<HTMLImageElement>('preview-img');
const btnCapture = $<HTMLButtonElement>('capture');
const btnCopy = $<HTMLButtonElement>('copy');
const btnDownload = $<HTMLButtonElement>('download');
const btnCancel = $<HTMLButtonElement>('cancel');

const params = new URLSearchParams(location.search);
/** Opened as a regular tab (tests, manual use) rather than as the action popup. */
const detached = params.has('tabId');

let settings: Settings;
let tabId: number | null = null;
let tabUrl: string | undefined;
let state: CaptureState = { phase: 'idle' };
let firstState = true;
let localError: PageSnapErrorInfo | null = null;
let previewSession = '';
let previewUrl = '';
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let autoCopyPending = false;

const port = chrome.runtime.connect({ name: POPUP_PORT });
const send = (msg: PopupToBackground) => port.postMessage(msg);

async function resolveTab(): Promise<void> {
  if (detached) {
    tabId = Number(params.get('tabId'));
    tabUrl = (await chrome.tabs.get(tabId).catch(() => undefined))?.url;
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  tabUrl = tab?.url;
}

function startCapture() {
  localError = null;
  if (tabId === null) {
    localError = new PageSnapError('NO_ACTIVE_TAB').toInfo();
    return render();
  }
  if (isRestrictedUrl(tabUrl)) {
    localError = new PageSnapError('RESTRICTED_PAGE').toInfo();
    return render();
  }
  send({ type: 'capture/start', tabId });
}

async function copyLatest(auto: boolean): Promise<void> {
  const sessionId = 'sessionId' in state ? state.sessionId : '';
  try {
    const stored = await getResult();
    if (!stored) throw new PageSnapError('NO_RESULT');
    await writeImageToClipboard(stored.blob);
    send({ type: 'clipboard/result', sessionId: stored.summary.sessionId, ok: true });
    if (auto && settings.closePopupAfterCopy && !detached)
      closeTimer = setTimeout(() => window.close(), 700);
  } catch (e) {
    send({ type: 'clipboard/result', sessionId, ok: false, error: toErrorInfo(e) });
  }
}

async function downloadLatest(): Promise<void> {
  const stored = await getResult();
  if (!stored) {
    localError = new PageSnapError('NO_RESULT').toInfo();
    return render();
  }
  const url = URL.createObjectURL(stored.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadFilename(stored.summary);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  send({ type: 'download/done', sessionId: stored.summary.sessionId });
}

async function showPreview(sessionId: string) {
  if (previewSession === sessionId) return;
  previewSession = sessionId;
  const stored = await getResult();
  if (!stored || stored.summary.sessionId !== sessionId) return;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(stored.blob);
  previewImg.src = previewUrl;
  preview.hidden = false;
}

function setProgress(pct: number) {
  barEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function render() {
  const s = state;
  shell.dataset.phase = localError ? 'failure' : s.phase;
  shell.dataset.copied = s.phase === 'success' ? String(s.copied) : '';
  warningsEl.replaceChildren();
  metaEl.textContent = '';
  detailEl.textContent = '';
  const busy = s.phase === 'capturing' || s.phase === 'stitching' || s.phase === 'copying';
  const hasResult = s.phase === 'success';

  btnCapture.hidden = busy;
  btnCancel.hidden = !(s.phase === 'capturing' || s.phase === 'stitching');
  btnCopy.hidden = !hasResult;
  btnDownload.hidden = !hasResult;
  btnCapture.innerHTML =
    hasResult || s.phase === 'failure' ? 'Capture again <kbd>R</kbd>' : 'Capture page <kbd>↵</kbd>';
  btnCapture.classList.toggle('primary', !(hasResult && !s.copied));
  btnCopy.classList.toggle('primary', hasResult && !s.copied);

  const addWarning = (text: string, err = false) => {
    const li = document.createElement('li');
    li.textContent = text;
    if (err) li.className = 'err';
    warningsEl.append(li);
  };

  if (localError) {
    titleEl.textContent =
      localError.code === 'RESTRICTED_PAGE' ? 'Cannot capture this page' : 'Cannot capture';
    setProgress(100);
    addWarning(localError.hint, true);
    return;
  }

  switch (s.phase) {
    case 'idle':
      titleEl.textContent = 'Ready';
      detailEl.textContent = 'Captures the full scrollable page and copies it as PNG.';
      setProgress(0);
      break;
    case 'capturing':
      titleEl.textContent = 'Capturing';
      metaEl.textContent = `${s.frame} / ${s.totalEstimate}`;
      detailEl.textContent = 'Keep this tab in front until capture finishes.';
      setProgress(s.totalEstimate ? (s.frame / s.totalEstimate) * 85 : 5);
      break;
    case 'stitching':
      titleEl.textContent = 'Stitching';
      metaEl.textContent = `${s.frames} frames`;
      setProgress(90);
      break;
    case 'copying':
      titleEl.textContent = 'Copying to clipboard';
      metaEl.textContent = formatDims(s.summary.width, s.summary.height);
      setProgress(96);
      break;
    case 'success': {
      const sm = s.summary;
      titleEl.textContent = s.copied
        ? 'Copied to clipboard'
        : s.downloaded
          ? 'Saved'
          : 'Captured, not copied';
      metaEl.textContent = formatDims(sm.width, sm.height);
      detailEl.textContent = `${formatBytes(sm.bytes)} PNG · ${sm.frames} frame${sm.frames === 1 ? '' : 's'} · ${formatDuration(sm.durationMs)}${s.downloaded ? ' · downloaded' : ''}`;
      setProgress(100);
      if (s.clipboardError) addWarning(s.clipboardError.hint, true);
      for (const w of sm.warnings) addWarning(w);
      void showPreview(s.sessionId);
      break;
    }
    case 'failure':
      titleEl.textContent =
        s.error.code === 'RESTRICTED_PAGE' ? 'Cannot capture this page' : 'Capture failed';
      setProgress(100);
      addWarning(s.error.hint, true);
      detailEl.textContent = s.error.code;
      break;
    case 'cancelled':
      titleEl.textContent = 'Cancelled';
      detailEl.textContent = 'The page was restored to its original scroll position.';
      setProgress(0);
      break;
  }
  if (!busy)
    (s.phase === 'success' && !s.copied ? btnCopy : btnCapture).focus({ preventScroll: true });
}

function shouldAutoStart(s: CaptureState): boolean {
  if (!settings.autoStart) return false;
  if (s.phase === 'capturing' || s.phase === 'stitching' || s.phase === 'copying') return false;
  // A recent capture that never reached the clipboard: offer it instead of recapturing.
  if (
    s.phase === 'success' &&
    !s.copied &&
    !s.downloaded &&
    Date.now() - s.summary.createdAt < 120_000
  )
    return false;
  return true;
}

port.onMessage.addListener(async (msg: BackgroundToPopup) => {
  await ready;
  switch (msg.type) {
    case 'state': {
      state = msg.state;
      if (firstState) {
        firstState = false;
        if (shouldAutoStart(state)) {
          startCapture();
          return;
        }
      }
      render();
      return;
    }
    case 'copy/request':
      autoCopyPending = true;
      void copyLatest(true).finally(() => (autoCopyPending = false));
      return;
    case 'error':
      localError = msg.error;
      render();
      return;
  }
});

btnCapture.addEventListener('click', startCapture);
btnCopy.addEventListener('click', () => void copyLatest(false));
btnDownload.addEventListener('click', () => void downloadLatest());
btnCancel.addEventListener('click', () => send({ type: 'capture/cancel' }));
$('settings').addEventListener('click', () => void chrome.runtime.openOptionsPage());

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const busy =
    state.phase === 'capturing' || state.phase === 'stitching' || state.phase === 'copying';
  const k = e.key.toLowerCase();
  if (k === 'escape') {
    e.preventDefault();
    if (busy) send({ type: 'capture/cancel' });
    else window.close();
  } else if (busy || autoCopyPending) {
    return;
  } else if (k === 'c' && state.phase === 'success') {
    void copyLatest(false);
  } else if (k === 'd' && state.phase === 'success') {
    void downloadLatest();
  } else if (k === 'r') {
    startCapture();
  } else if (k === 's') {
    void chrome.runtime.openOptionsPage();
  }
});

window.addEventListener('unload', () => clearTimeout(closeTimer));

async function showShortcut() {
  const cmds = await chrome.commands.getAll();
  const action = cmds.find((c) => c.name === '_execute_action');
  $('shortcut').textContent = action?.shortcut || 'not set';
}

async function init() {
  settings = await loadSettings();
  await resolveTab();
  void showShortcut();
}

const ready = init();
