import type { PageSnapErrorInfo } from './errors';
import type { CaptureState, PageMetrics } from './types';

/* ---------- background <-> content agent (chrome.tabs.sendMessage) ---------- */

export interface AgentPrepareOptions {
  flattenSticky: boolean;
}

export interface AgentScrollOptions {
  x: number;
  y: number;
  frameIndex: number;
  delayMs: number;
  hideFixed: boolean;
}

export type AgentRequest =
  | { type: 'agent/ping' }
  | { type: 'agent/prepare'; options: AgentPrepareOptions }
  | { type: 'agent/scrollTo'; options: AgentScrollOptions }
  | { type: 'agent/restore' };

export type AgentResponse =
  { ok: true; metrics?: PageMetrics; title?: string } | { ok: false; error: string };

/* ---------- popup -> background (port messages) ---------- */

export const POPUP_PORT = 'pagesnap-popup';

export type PopupToBackground =
  | { type: 'capture/start'; tabId: number }
  | { type: 'capture/cancel' }
  | { type: 'clipboard/result'; sessionId: string; ok: boolean; error?: PageSnapErrorInfo }
  | { type: 'download/done'; sessionId: string };

/* ---------- background -> popup (port messages) ---------- */

export type BackgroundToPopup =
  | { type: 'state'; state: CaptureState }
  | { type: 'copy/request'; sessionId: string }
  | { type: 'error'; error: PageSnapErrorInfo };

/* ---------- one-shot runtime messages (options page) ---------- */

export type RuntimeRequest = { type: 'diagnostics/get' };
