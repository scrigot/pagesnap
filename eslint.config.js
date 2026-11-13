import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const browser = {
  window: 'readonly',
  document: 'readonly',
  location: 'readonly',
  navigator: 'readonly',
};
const node = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  URL: 'readonly',
};

export default tseslint.config(
  { ignores: ['dist', 'dist-e2e', 'coverage', 'test-results', 'playwright-report', 'research'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { chrome: 'readonly', console: 'readonly', process: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  { files: ['tests/fixtures/**/*.js'], languageOptions: { globals: browser } },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        ...node,
        globalThis: 'readonly',
        btoa: 'readonly',
        navigator: 'readonly',
        chrome: 'readonly',
      },
    },
  },
  // Playwright fixtures require an object-destructuring first argument, even when empty.
  { files: ['tests/e2e/**/*.ts'], rules: { 'no-empty-pattern': 'off' } },
);
