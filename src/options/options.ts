import { loadSettings, saveSettings, type Settings } from '../shared/settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const savedEl = $('saved');
let savedTimer: ReturnType<typeof setTimeout> | undefined;

function flashSaved(text = 'Saved') {
  savedEl.textContent = text;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (savedEl.textContent = ''), 1500);
}

function bind(settings: Settings) {
  for (const el of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]')) {
    const key = el.dataset.key as keyof Settings;
    const value = settings[key];
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = String(value);

    el.addEventListener('change', async () => {
      let next: Settings[keyof Settings];
      if (el instanceof HTMLInputElement && el.type === 'checkbox') next = el.checked;
      else if (el instanceof HTMLInputElement && el.type === 'number') next = Number(el.value);
      else next = el.value as Settings[keyof Settings];

      if (key === 'autoDownload' && next === true) {
        // Must run inside the click's user gesture.
        const granted = await chrome.permissions.request({ permissions: ['downloads'] });
        if (!granted) {
          (el as HTMLInputElement).checked = false;
          flashSaved('Downloads permission declined');
          return;
        }
      }
      const saved = await saveSettings({ [key]: next } as Partial<Settings>);
      // Reflect clamping (e.g. out-of-range numbers).
      if (!(el instanceof HTMLInputElement && el.type === 'checkbox'))
        el.value = String(saved[key]);
      flashSaved();
    });
  }
}

async function loadDiagnostics() {
  const diag = await chrome.runtime.sendMessage({ type: 'diagnostics/get' });
  $('diag').textContent = JSON.stringify(
    { ...diag, userAgent: navigator.userAgent, devicePixelRatio: window.devicePixelRatio },
    null,
    2,
  );
}

async function init() {
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  bind(await loadSettings());
  const cmds = await chrome.commands.getAll();
  $('shortcut').textContent = cmds.find((c) => c.name === '_execute_action')?.shortcut || 'not set';
  $('open-shortcuts').addEventListener(
    'click',
    () => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }),
  );
  $('refresh-diag').addEventListener('click', () => void loadDiagnostics());
  $('copy-diag').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('diag').textContent ?? '');
    flashSaved('Log copied');
  });
  await loadDiagnostics().catch((e: unknown) => ($('diag').textContent = String(e)));
}

void init();
