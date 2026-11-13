/**
 * Content agent, injected on demand into the top frame of the target tab via
 * chrome.scripting (activeTab). It only measures geometry, scrolls, and
 * temporarily adjusts inline styles; every change is recorded and reverted in
 * `restore`. It never reads page text, clicks, or sends data anywhere.
 */
import type {
  AgentPrepareOptions,
  AgentRequest,
  AgentResponse,
  AgentScrollOptions,
} from '../shared/messages';
import type { PageMetrics, Rect } from '../shared/types';

declare global {
  interface Window {
    __pagesnapAgentInstalled?: boolean;
  }
}

interface InlineBackup {
  el: HTMLElement;
  prop: string;
  value: string;
  priority: string;
}

interface Session {
  target: Element | null; // null = the document scrolls
  origin: { x: number; y: number };
  backups: InlineBackup[];
  hidden: Set<HTMLElement>;
}

let session: Session | null = null;

function setImportant(s: Session, el: HTMLElement, prop: string, value: string) {
  s.backups.push({
    el,
    prop,
    value: el.style.getPropertyValue(prop),
    priority: el.style.getPropertyPriority(prop),
  });
  el.style.setProperty(prop, value, 'important');
}

function allElements(): HTMLElement[] {
  const out: HTMLElement[] = [];
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
  for (let n = walker.currentNode as Element | null; n; n = walker.nextNode() as Element | null) {
    if (n instanceof HTMLElement) out.push(n);
  }
  return out;
}

function scrollingElement(): Element {
  return document.scrollingElement ?? document.documentElement;
}

function documentScrolls(): boolean {
  const se = scrollingElement();
  const overflowY = getComputedStyle(document.documentElement).overflowY;
  const bodyOverflowY = document.body ? getComputedStyle(document.body).overflowY : 'visible';
  if (overflowY === 'hidden' || overflowY === 'clip') return false;
  if (bodyOverflowY === 'hidden' && overflowY !== 'scroll' && overflowY !== 'auto') return false;
  return se.scrollHeight > window.innerHeight + 1;
}

/** Largest visible element that scrolls vertically: the main panel of app-shell pages. */
function findInnerScroller(): Element | null {
  let best: Element | null = null;
  let bestArea = 0;
  const minHeight = window.innerHeight * 0.3;
  for (const el of allElements()) {
    if (el.scrollHeight <= el.clientHeight + 1 || el.clientHeight < minHeight) continue;
    const oy = getComputedStyle(el).overflowY;
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') continue;
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
    const area = w * h;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

function intersectViewport(r: Rect): Rect {
  const left = Math.max(0, r.left);
  const top = Math.max(0, r.top);
  const right = Math.min(window.innerWidth, r.left + r.width);
  const bottom = Math.min(window.innerHeight, r.top + r.height);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function measure(target: Element | null): PageMetrics {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const devicePixelRatio = window.devicePixelRatio || 1;
  if (!target) {
    const se = scrollingElement();
    const de = document.documentElement;
    // clientWidth/Height are rounded to integers; at non-100% zoom the real
    // visible area is fractional (e.g. 533.33 px). visualViewport reports it
    // exactly (and excludes scrollbars) unless the user has pinch-zoomed.
    const vv = window.visualViewport;
    const exact = vv && Math.abs(vv.scale - 1) < 1e-3;
    const width = exact ? Math.min(vv.width, de.clientWidth + 1) : de.clientWidth;
    const height = exact ? Math.min(vv.height, de.clientHeight + 1) : de.clientHeight;
    return {
      targetKind: 'document',
      viewport,
      clientRect: { left: 0, top: 0, width, height },
      contentSize: {
        width: Math.max(se.scrollWidth, de.clientWidth),
        height: Math.max(se.scrollHeight, de.clientHeight),
      },
      scroll: { x: window.scrollX, y: window.scrollY },
      devicePixelRatio,
    };
  }
  const r = target.getBoundingClientRect();
  const clientRect = intersectViewport({
    left: r.left + target.clientLeft,
    top: r.top + target.clientTop,
    width: target.clientWidth,
    height: target.clientHeight,
  });
  return {
    targetKind: 'element',
    viewport,
    clientRect,
    contentSize: { width: target.scrollWidth, height: target.scrollHeight },
    scroll: { x: target.scrollLeft, y: target.scrollTop },
    devicePixelRatio,
  };
}

function prepare(opts: AgentPrepareOptions): PageMetrics {
  if (session) restore();
  const target = documentScrolls() ? null : findInnerScroller();
  const s: Session = {
    target,
    origin: target
      ? { x: target.scrollLeft, y: target.scrollTop }
      : { x: window.scrollX, y: window.scrollY },
    backups: [],
    hidden: new Set(),
  };
  session = s;

  // Smooth scrolling would make scrollTo asynchronous and frames misaligned.
  setImportant(s, document.documentElement, 'scroll-behavior', 'auto');
  if (document.body) setImportant(s, document.body, 'scroll-behavior', 'auto');
  if (target instanceof HTMLElement) setImportant(s, target, 'scroll-behavior', 'auto');

  if (opts.flattenSticky) {
    // A sticky element occupies the same layout box as a static one, so
    // switching it to static renders it once, in place, without reflowing.
    for (const el of allElements()) {
      const pos = getComputedStyle(el).position;
      if (pos === 'sticky' || pos === '-webkit-sticky') setImportant(s, el, 'position', 'static');
    }
  }
  return measure(target);
}

function hideFixedElements(s: Session) {
  // Re-scanned every frame: many sites switch headers to fixed on scroll.
  for (const el of allElements()) {
    if (s.hidden.has(el)) continue;
    if (getComputedStyle(el).position !== 'fixed') continue;
    if (s.target && el.contains(s.target)) continue; // never hide the scroller itself
    s.hidden.add(el);
    setImportant(s, el, 'visibility', 'hidden');
  }
}

const nextFrame = () =>
  new Promise<void>((resolve) => {
    // rAF does not fire in hidden tabs; the timeout keeps capture from hanging.
    const t = setTimeout(resolve, 250);
    requestAnimationFrame(() => {
      clearTimeout(t);
      resolve();
    });
  });

/** Wait (bounded) for images in the viewport that are still loading. */
async function settleImages(timeoutMs: number) {
  const pending: Promise<unknown>[] = [];
  for (const img of Array.from(document.images)) {
    if (img.complete) continue;
    const r = img.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight || r.width === 0) continue;
    pending.push(
      new Promise((res) => {
        img.addEventListener('load', res, { once: true });
        img.addEventListener('error', res, { once: true });
      }),
    );
  }
  if (!pending.length) return;
  await Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, timeoutMs))]);
}

async function scrollTo(o: AgentScrollOptions): Promise<PageMetrics> {
  const s = session;
  if (!s) throw new Error('Agent not prepared');
  if (o.hideFixed) hideFixedElements(s);
  if (s.target) s.target.scrollTo({ left: o.x, top: o.y, behavior: 'instant' });
  else window.scrollTo({ left: o.x, top: o.y, behavior: 'instant' });
  await nextFrame();
  await settleImages(1500);
  if (o.delayMs > 0) await new Promise((r) => setTimeout(r, o.delayMs));
  // Two frames: the first commits layout, the second guarantees paint.
  await nextFrame();
  await nextFrame();
  return measure(s.target);
}

function restore() {
  const s = session;
  if (!s) return;
  session = null;
  for (let i = s.backups.length - 1; i >= 0; i--) {
    const b = s.backups[i]!;
    if (b.value) b.el.style.setProperty(b.prop, b.value, b.priority);
    else b.el.style.removeProperty(b.prop);
  }
  if (s.target) s.target.scrollTo({ left: s.origin.x, top: s.origin.y, behavior: 'instant' });
  else window.scrollTo({ left: s.origin.x, top: s.origin.y, behavior: 'instant' });
}

async function handle(msg: AgentRequest): Promise<AgentResponse> {
  switch (msg.type) {
    case 'agent/ping':
      return { ok: true };
    case 'agent/prepare':
      return { ok: true, metrics: prepare(msg.options), title: document.title };
    case 'agent/scrollTo':
      return { ok: true, metrics: await scrollTo(msg.options) };
    case 'agent/restore':
      restore();
      return { ok: true };
  }
}

if (!window.__pagesnapAgentInstalled) {
  window.__pagesnapAgentInstalled = true;
  chrome.runtime.onMessage.addListener((msg: AgentRequest, sender, sendResponse) => {
    if (
      sender.id !== chrome.runtime.id ||
      typeof msg?.type !== 'string' ||
      !msg.type.startsWith('agent/')
    )
      return false;
    handle(msg).then(sendResponse, (e: unknown) =>
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return true;
  });
  // If the page is hidden/unloaded mid-capture, put everything back.
  window.addEventListener('pagehide', restore);
}
