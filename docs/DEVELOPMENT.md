# Development

## Commands

| Command                           | What                                                                |
| --------------------------------- | ------------------------------------------------------------------- |
| `npm run build`                   | Production build → `dist/`                                          |
| `npm run build:e2e`               | Test build → `dist-e2e/` (test hook, `<all_urls>`, `clipboardRead`) |
| `npm run typecheck`               | `tsc --noEmit`, strict                                              |
| `npm run lint`                    | ESLint (typescript-eslint)                                          |
| `npm run format` / `format:check` | Prettier                                                            |
| `npm test`                        | Vitest unit tests                                                   |
| `npm run test:e2e`                | Build E2E and run Playwright in real Chromium                       |
| `npm run bench`                   | Build E2E and run the benchmark harness                             |
| `npm run check`                   | Everything CI runs except E2E                                       |

## Workflow

1. `npm run build`, then load `dist/` unpacked (see INSTALLATION).
2. After a change, rebuild and click **reload** on the extension card. Reload the target tab as well if you changed `content.js`.
3. Debugging:
   - **Service worker:** `chrome://extensions` → PageSnap → "service worker" link → DevTools console (logs are prefixed `[pagesnap:bg]`).
   - **Popup:** right-click the icon → _Inspect popup_. Inspecting keeps the popup open, which is handy for clipboard work.
   - **Page agent:** the page's DevTools → Console → choose the "PageSnap" context.
   - **Diagnostics:** Settings → Diagnostics shows the state and the last 300 log entries.

## Where things go

- New geometry or decision logic → `src/capture/*.ts` as **pure functions**, with unit tests.
- New Chrome API usage → `src/background/` behind an interface the coordinator can fake.
- New page behavior → `src/content/page-agent.ts`. Every DOM change must be recorded through `setImportant` so `restore` reverts it.
- New message → add it to the unions in `src/shared/messages.ts`. The compiler then flags every handler that needs updating.
- New state → `src/capture/state.ts` plus tests for every legal and illegal transition.

## E2E harness

`tests/e2e/harness.ts` launches Chromium with the E2E build, serves `tests/fixtures/` over HTTP, triggers captures through `globalThis.__pagesnapTest` in the service worker, and decodes output pixels inside the browser. Fixtures use **color bands with known geometry** (`tests/fixtures/bands.js`), so tests can assert band order, alignment error in pixels, and gap pixels exactly.

Device scale is set with `--force-device-scale-factor`, not CDP emulation, so DPR behaves as on real hardware. Captured PNGs are written to `test-results/captures/` for inspection.

## Commit style

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `build:`, `ci:`, `chore:`.

## Release

1. Bump `version` in `package.json` (the build copies it into the manifest).
2. Update `CHANGELOG.md`.
3. `npm run check && npm run test:e2e`.
4. Run the manual checklist in [TESTING.md](TESTING.md).
5. `npm run package`, then tag `vX.Y.Z`.
