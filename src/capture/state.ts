/**
 * Deterministic capture state machine. Every transition goes through
 * `transition`; illegal events throw so bugs surface instead of leaving the
 * UI in an impossible state.
 */
import type { PageSnapErrorInfo } from '../shared/errors';
import type { CaptureState, CaptureSummary } from '../shared/types';

export type CaptureEvent =
  | { type: 'START'; sessionId: string; tabId: number; totalEstimate: number }
  | { type: 'PROGRESS'; frame: number; totalEstimate: number }
  | { type: 'STITCH'; frames: number }
  | { type: 'COPY_START' }
  | { type: 'COPY_DONE' }
  | { type: 'COPY_FAILED'; error: PageSnapErrorInfo }
  | { type: 'FINISH'; summary: CaptureSummary }
  | { type: 'DOWNLOADED' }
  | { type: 'FAIL'; error: PageSnapErrorInfo }
  | { type: 'CANCEL' }
  | { type: 'RESET' };

export class InvalidTransitionError extends Error {
  constructor(phase: string, event: string) {
    super(`Invalid transition: ${event} in phase ${phase}`);
    this.name = 'InvalidTransitionError';
  }
}

export const INITIAL_STATE: CaptureState = { phase: 'idle' };

export function isBusy(s: CaptureState): boolean {
  return s.phase === 'capturing' || s.phase === 'stitching' || s.phase === 'copying';
}

export function isTerminal(s: CaptureState): boolean {
  return (
    s.phase === 'success' || s.phase === 'failure' || s.phase === 'cancelled' || s.phase === 'idle'
  );
}

export function transition(s: CaptureState, e: CaptureEvent): CaptureState {
  const bad = () => new InvalidTransitionError(s.phase, e.type);
  switch (e.type) {
    case 'START':
      if (isBusy(s)) throw bad();
      return {
        phase: 'capturing',
        sessionId: e.sessionId,
        tabId: e.tabId,
        frame: 0,
        totalEstimate: e.totalEstimate,
      };
    case 'PROGRESS':
      if (s.phase !== 'capturing') throw bad();
      return { ...s, frame: e.frame, totalEstimate: Math.max(e.totalEstimate, e.frame) };
    case 'STITCH':
      if (s.phase !== 'capturing') throw bad();
      return { phase: 'stitching', sessionId: s.sessionId, tabId: s.tabId, frames: e.frames };
    case 'FINISH':
      if (s.phase !== 'stitching') throw bad();
      return {
        phase: 'success',
        sessionId: s.sessionId,
        summary: e.summary,
        copied: false,
        downloaded: false,
      };
    case 'COPY_START':
      if (s.phase === 'success')
        return {
          phase: 'copying',
          sessionId: s.sessionId,
          summary: s.summary,
          downloaded: s.downloaded,
        };
      throw bad();
    case 'COPY_DONE':
      if (s.phase === 'copying')
        return {
          phase: 'success',
          sessionId: s.sessionId,
          summary: s.summary,
          copied: true,
          downloaded: s.downloaded,
        };
      if (s.phase === 'success') {
        const { clipboardError: _drop, ...rest } = s;
        return { ...rest, copied: true };
      }
      throw bad();
    case 'COPY_FAILED':
      if (s.phase === 'copying')
        return {
          phase: 'success',
          sessionId: s.sessionId,
          summary: s.summary,
          copied: false,
          downloaded: s.downloaded,
          clipboardError: e.error,
        };
      if (s.phase === 'success') return { ...s, copied: false, clipboardError: e.error };
      throw bad();
    case 'DOWNLOADED':
      if (s.phase === 'success') return { ...s, downloaded: true };
      throw bad();
    case 'FAIL':
      if (s.phase === 'capturing' || s.phase === 'stitching')
        return { phase: 'failure', sessionId: s.sessionId, error: e.error };
      throw bad();
    case 'CANCEL':
      if (s.phase === 'capturing' || s.phase === 'stitching')
        return { phase: 'cancelled', sessionId: s.sessionId };
      throw bad();
    case 'RESET':
      if (isBusy(s)) throw bad();
      return INITIAL_STATE;
  }
}
