// Vitest configuration. The extension itself is built by scripts/build.mjs,
// which runs Vite programmatically (two passes: pages/worker, content IIFE).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __E2E__: 'false' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: { include: ['src/**/*.ts'] },
  },
});
