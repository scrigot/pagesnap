// Builds the extension into dist/ (or dist-e2e/ with --e2e).
// Two Vite passes: pages + module service worker, then the content agent as
// a self-contained IIFE (content scripts cannot import modules).
import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const e2e = process.argv.includes('--e2e');
const outDir = resolve(root, e2e ? 'dist-e2e' : 'dist');
const define = { __E2E__: JSON.stringify(e2e) };

await build({
  configFile: false,
  root: resolve(root, 'src'),
  base: './',
  publicDir: resolve(root, 'src/assets'),
  define,
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: true,
    modulePreload: false,
    target: 'chrome116',
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(root, 'src/popup/index.html'),
        options: resolve(root, 'src/options/index.html'),
        background: resolve(root, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});

await build({
  configFile: false,
  root,
  define,
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: false,
    target: 'chrome116',
    lib: {
      entry: resolve(root, 'src/content/page-agent.ts'),
      formats: ['iife'],
      name: 'PageSnapAgent',
      fileName: () => 'content.js',
    },
  },
});

const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
manifest.version = pkg.version;
if (e2e) {
  // Playwright cannot click the toolbar button, so activeTab is never granted.
  // The E2E build alone gets broad host access to call captureVisibleTab.
  manifest.name = 'PageSnap (E2E)';
  manifest.host_permissions = ['<all_urls>'];
  // Lets tests read the clipboard back to verify what PageSnap wrote.
  manifest.permissions = [...manifest.permissions, 'clipboardRead'];
}
await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`built ${e2e ? 'E2E ' : ''}extension -> ${outDir}`);
