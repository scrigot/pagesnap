import { defineConfig } from '@playwright/test';
import type { HarnessOptions } from './tests/e2e/harness';

export default defineConfig<HarnessOptions>({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1, // one extension instance at a time; captureVisibleTab is rate limited per browser
  reporter: [['list']],
  use: { trace: 'off' },
  projects: [
    { name: 'dpr1', use: { dsf: 1 }, grepInvert: /@dpr/ },
    { name: 'dpr2', use: { dsf: 2 }, grep: /@dpr/ },
  ],
});
