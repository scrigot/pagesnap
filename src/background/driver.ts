/** Chrome-API implementation of CaptureDriver for one tab. */
import type { CaptureDriver } from '../capture/coordinator';
import { PageSnapError } from '../shared/errors';
import type { AgentRequest, AgentResponse } from '../shared/messages';
import type { PageMetrics } from '../shared/types';

export async function injectAgent(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: ['content.js'],
    });
  } catch (e) {
    throw new PageSnapError('INJECTION_FAILED', `Script injection failed: ${String(e)}`);
  }
}

export async function captureVisible(windowId: number): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    } catch (e) {
      const msg = String(e);
      // Quota errors are retryable; anything else (permissions, hidden tab) is not.
      if (attempt < 3 && /MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/.test(msg)) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      throw new PageSnapError('CAPTURE_FAILED', msg);
    }
  }
}

export function createChromeDriver(tab: { id: number; windowId: number }): CaptureDriver {
  const send = async (msg: AgentRequest): Promise<AgentResponse & { ok: true }> => {
    let res: AgentResponse | undefined;
    try {
      res = (await chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 })) as
        AgentResponse | undefined;
    } catch (e) {
      throw new PageSnapError('TAB_CHANGED', `Lost connection to the page: ${String(e)}`);
    }
    if (!res) throw new PageSnapError('TAB_CHANGED', 'Page agent did not respond');
    if (!res.ok) throw new PageSnapError('INJECTION_FAILED', res.error);
    return res;
  };
  const metricsOf = (r: AgentResponse & { ok: true }): PageMetrics => {
    if (!r.metrics) throw new PageSnapError('UNKNOWN', 'Agent returned no metrics');
    return r.metrics;
  };

  return {
    async prepare(options) {
      const r = await send({ type: 'agent/prepare', options });
      return { metrics: metricsOf(r), title: r.title ?? '' };
    },
    async scrollTo(options) {
      return metricsOf(await send({ type: 'agent/scrollTo', options }));
    },
    async restore() {
      await send({ type: 'agent/restore' });
    },
    async captureVisible() {
      // captureVisibleTab grabs whatever tab is active in the window. If the
      // user switched tabs mid-capture, stop instead of capturing the wrong page.
      const current = await chrome.tabs.get(tab.id);
      if (!current.active)
        throw new PageSnapError('TAB_CHANGED', 'The captured tab is no longer active');
      return captureVisible(tab.windowId);
    },
  };
}
