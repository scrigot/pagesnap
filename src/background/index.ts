/**
 * Service worker: owns the single capture session and its state machine,
 * talks to the page agent, stitches, stores the result, and asks the popup
 * (a focused extension page) to write the clipboard.
 */
import { runCapture, CancelledError } from '../capture/coordinator';
import { CAPTURE_MIN_INTERVAL_MS } from '../capture/geometry';
import { createRateLimiter } from '../capture/rate-limit';
import { INITIAL_STATE, isBusy, transition, type CaptureEvent } from '../capture/state';
import { stitchFrames } from '../capture/stitch';
import { PageSnapError, isRestrictedUrl, toErrorInfo, hintFor } from '../shared/errors';
import { createLogger, getLogEntries, safeOrigin } from '../shared/log';
import {
  POPUP_PORT,
  type BackgroundToPopup,
  type PopupToBackground,
  type RuntimeRequest,
} from '../shared/messages';
import { putResult, getResult } from '../shared/result-store';
import { loadSettings, type Settings } from '../shared/settings';
import type { CaptureState, CaptureSummary } from '../shared/types';
import { createChromeDriver, injectAgent, captureVisible } from './driver';
import { downloadBlob, hasDownloadPermission } from './download';

const log = createLogger('bg');

let state: CaptureState = INITIAL_STATE;
let abort: AbortController | null = null;
const ports = new Set<chrome.runtime.Port>();
let badgeTimer: ReturnType<typeof setTimeout> | undefined;
let badgeEnabled = true;

function post(port: chrome.runtime.Port, msg: BackgroundToPopup) {
  try {
    port.postMessage(msg);
  } catch {
    ports.delete(port);
  }
}

function broadcast(msg: BackgroundToPopup) {
  for (const p of ports) post(p, msg);
}

function dispatch(event: CaptureEvent) {
  const prev = state.phase;
  state = transition(state, event);
  log.debug(`${prev} -> ${state.phase}`, { event: event.type });
  broadcast({ type: 'state', state });
  updateBadge();
}

function setBadge(text: string, color: string) {
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color });
}

function updateBadge() {
  clearTimeout(badgeTimer);
  if (!badgeEnabled) return setBadge('', '#000');
  switch (state.phase) {
    case 'capturing': {
      const pct = state.totalEstimate ? Math.floor((state.frame / state.totalEstimate) * 100) : 0;
      return setBadge(`${pct}%`, '#3b82f6');
    }
    case 'stitching':
    case 'copying':
      return setBadge('...', '#3b82f6');
    case 'success':
      if (!state.copied && !state.downloaded) return setBadge('1', '#f59e0b'); // result waiting
      setBadge('OK', '#16a34a');
      badgeTimer = setTimeout(() => setBadge('', '#000'), 4000);
      return;
    case 'failure':
      setBadge('ERR', '#dc2626');
      badgeTimer = setTimeout(() => setBadge('', '#000'), 6000);
      return;
    default:
      return setBadge('', '#000');
  }
}

function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Fallback for pages that cannot be scripted but can be captured (e.g. the PDF viewer). */
async function captureVisibleOnly(tab: chrome.tabs.Tab, sessionId: string, t0: number) {
  const dataUrl = await captureVisible(tab.windowId);
  const blob = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const summary: CaptureSummary = {
    sessionId,
    width: bmp.width,
    height: bmp.height,
    bytes: blob.size,
    frames: 1,
    durationMs: Date.now() - t0,
    outputScale: 1,
    warnings: ['This page cannot be scripted, so only the visible area was captured.'],
    title: tab.title ?? '',
    createdAt: Date.now(),
  };
  bmp.close();
  return { blob, summary };
}

async function startCapture(tabId: number): Promise<void> {
  if (isBusy(state)) {
    log.info('capture already running; ignoring duplicate start');
    broadcast({ type: 'state', state });
    return;
  }
  const settings = await loadSettings();
  badgeEnabled = settings.badge;
  const sessionId = newSessionId();
  const t0 = Date.now();
  const controller = new AbortController();
  abort = controller;

  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    dispatch({ type: 'START', sessionId, tabId, totalEstimate: 1 });
    dispatch({ type: 'FAIL', error: new PageSnapError('NO_ACTIVE_TAB').toInfo() });
    return;
  }
  dispatch({ type: 'START', sessionId, tabId, totalEstimate: 1 });
  log.info('capture start', { sessionId, origin: safeOrigin(tab.url) });

  const onRemoved = (id: number) =>
    id === tabId && controller.abort(new PageSnapError('TAB_CHANGED'));
  const onUpdated = (id: number, info: { status?: string }) =>
    id === tabId && info.status === 'loading' && controller.abort(new PageSnapError('TAB_CHANGED'));
  chrome.tabs.onRemoved.addListener(onRemoved);
  chrome.tabs.onUpdated.addListener(onUpdated);

  try {
    if (isRestrictedUrl(tab.url))
      throw new PageSnapError('RESTRICTED_PAGE', `Cannot capture ${safeOrigin(tab.url)}`);

    let result: { blob: Blob; summary: CaptureSummary };
    let injected = true;
    try {
      await injectAgent(tabId);
    } catch (e) {
      injected = false;
      log.warn('injection failed; trying visible-area fallback', String(e));
    }

    if (!injected) {
      try {
        result = await captureVisibleOnly(tab, sessionId, t0);
      } catch {
        throw new PageSnapError('RESTRICTED_PAGE', 'Page can neither be scripted nor captured');
      }
      dispatch({ type: 'STITCH', frames: 1 });
    } else {
      result = await runCapture({
        sessionId,
        driver: createChromeDriver({ id: tabId, windowId: tab.windowId }),
        stitch: stitchFrames,
        settings,
        limiter: createRateLimiter(CAPTURE_MIN_INTERVAL_MS),
        signal: controller.signal,
        onProgress: (frame, totalEstimate) => dispatch({ type: 'PROGRESS', frame, totalEstimate }),
        onStitch: (frames) => dispatch({ type: 'STITCH', frames }),
      });
    }

    await putResult(result);
    log.info('capture done', {
      width: result.summary.width,
      height: result.summary.height,
      frames: result.summary.frames,
      bytes: result.summary.bytes,
      ms: result.summary.durationMs,
    });
    dispatch({ type: 'FINISH', summary: result.summary });
    await afterCapture(settings, result.blob, result.summary);
  } catch (e) {
    const reason: unknown = controller.signal.aborted ? (controller.signal.reason ?? e) : e;
    if (
      reason instanceof CancelledError ||
      (controller.signal.aborted && !(reason instanceof PageSnapError))
    ) {
      log.info('capture cancelled');
      if (state.phase === 'capturing' || state.phase === 'stitching') dispatch({ type: 'CANCEL' });
    } else {
      const info = toErrorInfo(reason);
      log.error('capture failed', info);
      if (state.phase === 'capturing' || state.phase === 'stitching')
        dispatch({ type: 'FAIL', error: info });
    }
  } finally {
    chrome.tabs.onRemoved.removeListener(onRemoved);
    chrome.tabs.onUpdated.removeListener(onUpdated);
    if (abort === controller) abort = null;
  }
}

async function afterCapture(settings: Settings, blob: Blob, summary: CaptureSummary) {
  if (settings.autoDownload) {
    if (await hasDownloadPermission()) {
      try {
        await downloadBlob(blob, summary);
        dispatch({ type: 'DOWNLOADED' });
      } catch (e) {
        log.error('download failed', String(e));
      }
    } else {
      log.warn('autoDownload enabled but downloads permission not granted');
    }
  }
  if (!settings.autoCopy) return;
  requestCopy();
}

function requestCopy() {
  if (state.phase !== 'success') return;
  const [port] = ports;
  if (!port) {
    dispatch({
      type: 'COPY_FAILED',
      error: {
        code: 'CLIPBOARD_NO_POPUP',
        message: 'Popup closed before copy',
        hint: hintFor('CLIPBOARD_NO_POPUP'),
      },
    });
    return;
  }
  dispatch({ type: 'COPY_START' });
  post(port, { type: 'copy/request', sessionId: state.sessionId });
}

async function handlePopupMessage(port: chrome.runtime.Port, msg: PopupToBackground) {
  switch (msg.type) {
    case 'capture/start':
      await startCapture(msg.tabId);
      return;
    case 'capture/cancel':
      abort?.abort(new CancelledError());
      return;
    case 'clipboard/result': {
      if (state.phase !== 'copying' && state.phase !== 'success') return;
      if (state.sessionId !== msg.sessionId) return;
      if (msg.ok) {
        log.info('clipboard write ok');
        dispatch({ type: 'COPY_DONE' });
      } else {
        log.warn('clipboard write failed', msg.error);
        dispatch({
          type: 'COPY_FAILED',
          error: msg.error ?? toErrorInfo('unknown clipboard error'),
        });
      }
      return;
    }
    case 'download/done':
      if (state.phase === 'success' && state.sessionId === msg.sessionId)
        dispatch({ type: 'DOWNLOADED' });
      return;
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== POPUP_PORT || port.sender?.id !== chrome.runtime.id) return;
  ports.add(port);
  post(port, { type: 'state', state });
  port.onMessage.addListener((msg: PopupToBackground) => {
    handlePopupMessage(port, msg).catch((e: unknown) =>
      log.error('popup message failed', String(e)),
    );
  });
  port.onDisconnect.addListener(() => {
    ports.delete(port);
    if (state.phase === 'copying' && ports.size === 0) {
      dispatch({
        type: 'COPY_FAILED',
        error: {
          code: 'CLIPBOARD_NO_POPUP',
          message: 'Popup closed during copy',
          hint: hintFor('CLIPBOARD_NO_POPUP'),
        },
      });
    }
  });
});

chrome.runtime.onMessage.addListener((msg: RuntimeRequest, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (msg?.type === 'diagnostics/get') {
    sendResponse({ state, logs: getLogEntries(), version: chrome.runtime.getManifest().version });
  }
  return false;
});

chrome.runtime.onInstalled.addListener((details) => {
  log.info('installed', { reason: details.reason });
});

/* E2E-only hooks: compiled out of production builds (see scripts/build.mjs). */
if (__E2E__) {
  (globalThis as Record<string, unknown>).__pagesnapTest = {
    start: (tabId: number) => startCapture(tabId),
    cancel: () => abort?.abort(new CancelledError()),
    getState: () => state,
    getLogs: () => getLogEntries(),
    getResult,
  };
}
