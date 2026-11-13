import type { PageSnapErrorInfo } from './errors';

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Snapshot of the page geometry reported by the content agent.
 * All values are CSS pixels except devicePixelRatio.
 */
export interface PageMetrics {
  /** 'document' scrolls the window; 'element' scrolls an inner container (app shells). */
  targetKind: 'document' | 'element';
  /** Layout viewport (window.innerWidth/innerHeight, includes scrollbars). */
  viewport: Size;
  /** Visible, scrollable client region of the target within the viewport. */
  clientRect: Rect;
  /** Full scrollable content size of the target. */
  contentSize: Size;
  /** Current scroll offset of the target. */
  scroll: Point;
  devicePixelRatio: number;
}

export interface CapturedFrame {
  index: number;
  /** Actual scroll position at capture time (CSS px). */
  scroll: Point;
  /** Metrics at capture time (viewport can change between frames). */
  metrics: PageMetrics;
  dataUrl: string;
}

export interface CaptureSummary {
  sessionId: string;
  width: number;
  height: number;
  bytes: number;
  frames: number;
  durationMs: number;
  /** Output pixels per CSS pixel (device scale × any downscale). */
  outputScale: number;
  warnings: string[];
  title: string;
  createdAt: number;
}

export type CapturePhase =
  'idle' | 'capturing' | 'stitching' | 'copying' | 'success' | 'failure' | 'cancelled';

export type CaptureState =
  | { phase: 'idle' }
  | { phase: 'capturing'; sessionId: string; tabId: number; frame: number; totalEstimate: number }
  | { phase: 'stitching'; sessionId: string; tabId: number; frames: number }
  | { phase: 'copying'; sessionId: string; summary: CaptureSummary; downloaded: boolean }
  | {
      phase: 'success';
      sessionId: string;
      summary: CaptureSummary;
      copied: boolean;
      downloaded: boolean;
      clipboardError?: PageSnapErrorInfo;
    }
  | { phase: 'failure'; sessionId: string; error: PageSnapErrorInfo }
  | { phase: 'cancelled'; sessionId: string };
