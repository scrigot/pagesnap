import { describe, expect, it } from 'vitest';
import {
  INITIAL_STATE,
  InvalidTransitionError,
  isBusy,
  transition,
  type CaptureEvent,
} from '../../src/capture/state';
import type { CaptureState, CaptureSummary } from '../../src/shared/types';

const summary: CaptureSummary = {
  sessionId: 's1',
  width: 10,
  height: 20,
  bytes: 100,
  frames: 2,
  durationMs: 5,
  outputScale: 1,
  warnings: [],
  title: '',
  createdAt: 0,
};
const err = { code: 'CLIPBOARD_DENIED' as const, message: 'x', hint: 'y' };
const run = (events: CaptureEvent[], from: CaptureState = INITIAL_STATE) =>
  events.reduce(transition, from);

describe('capture state machine', () => {
  it('follows the happy path idle -> capturing -> stitching -> copying -> success', () => {
    const s = run([
      { type: 'START', sessionId: 's1', tabId: 1, totalEstimate: 3 },
      { type: 'PROGRESS', frame: 1, totalEstimate: 3 },
      { type: 'PROGRESS', frame: 3, totalEstimate: 3 },
      { type: 'STITCH', frames: 3 },
      { type: 'FINISH', summary },
      { type: 'COPY_START' },
      { type: 'COPY_DONE' },
    ]);
    expect(s).toMatchObject({ phase: 'success', copied: true, downloaded: false });
  });

  it('records clipboard failure without claiming success, then recovers on retry', () => {
    const base = run([
      { type: 'START', sessionId: 's1', tabId: 1, totalEstimate: 1 },
      { type: 'STITCH', frames: 1 },
      { type: 'FINISH', summary },
      { type: 'COPY_START' },
      { type: 'COPY_FAILED', error: err },
    ]);
    expect(base).toMatchObject({ phase: 'success', copied: false, clipboardError: err });
    const retried = transition(base, { type: 'COPY_DONE' });
    expect(retried).toMatchObject({ phase: 'success', copied: true });
    expect('clipboardError' in retried).toBe(false);
  });

  it('keeps the downloaded flag across copy', () => {
    const s = run([
      { type: 'START', sessionId: 's1', tabId: 1, totalEstimate: 1 },
      { type: 'STITCH', frames: 1 },
      { type: 'FINISH', summary },
      { type: 'DOWNLOADED' },
      { type: 'COPY_START' },
      { type: 'COPY_DONE' },
    ]);
    expect(s).toMatchObject({ copied: true, downloaded: true });
  });

  it('rejects a second START while busy (no simultaneous sessions)', () => {
    const s = run([{ type: 'START', sessionId: 's1', tabId: 1, totalEstimate: 1 }]);
    expect(isBusy(s)).toBe(true);
    expect(() =>
      transition(s, { type: 'START', sessionId: 's2', tabId: 1, totalEstimate: 1 }),
    ).toThrow(InvalidTransitionError);
  });

  it('allows a new START after any terminal state', () => {
    for (const end of [{ type: 'CANCEL' } as const, { type: 'FAIL', error: err } as const]) {
      const s = run([{ type: 'START', sessionId: 's1', tabId: 1, totalEstimate: 1 }, end]);
      expect(
        transition(s, { type: 'START', sessionId: 's2', tabId: 1, totalEstimate: 1 }).phase,
      ).toBe('capturing');
    }
  });

  it('rejects impossible events', () => {
    expect(() => transition(INITIAL_STATE, { type: 'FINISH', summary })).toThrow(
      InvalidTransitionError,
    );
    expect(() => transition(INITIAL_STATE, { type: 'COPY_START' })).toThrow(InvalidTransitionError);
    expect(() => transition(INITIAL_STATE, { type: 'CANCEL' })).toThrow(InvalidTransitionError);
    const capturing = run([{ type: 'START', sessionId: 's1', tabId: 1, totalEstimate: 1 }]);
    expect(() => transition(capturing, { type: 'RESET' })).toThrow(InvalidTransitionError);
    expect(() => transition(capturing, { type: 'FINISH', summary })).toThrow(
      InvalidTransitionError,
    );
  });

  it('cancels from stitching', () => {
    const s = run([
      { type: 'START', sessionId: 's1', tabId: 1, totalEstimate: 1 },
      { type: 'STITCH', frames: 1 },
      { type: 'CANCEL' },
    ]);
    expect(s.phase).toBe('cancelled');
  });
});
