# Testing

## Automated

| Suite     | Command            | Environment                             | Mocked?                                                                                                                 |
| --------- | ------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Unit (54) | `npm test`         | Node (Vitest)                           | Clipboard API mocked in `misc.test.ts` (labeled). Chrome APIs are not used: the coordinator runs against a fake driver. |
| E2E (21)  | `npm run test:e2e` | Real headless Chromium + real extension | Nothing mocked. Pixel assertions on decoded output.                                                                     |

### What E2E proves

- Full-page capture of short, long, sticky, fixed, dynamic, app-shell, wide, and narrow pages; 150% zoom; DPR 2; lazy images; height cap; 40,000 px downscale
- Every content band appears exactly once, in order, with ≤1 px alignment error and 0 gap pixels
- Scroll position and temporary styles are restored, including after cancel
- `chrome://` pages fail with the restricted-page guidance
- A duplicate start does not create a second session
- The popup auto-copies, and `navigator.clipboard.read()` returns a decodable `image/png` with the expected dimensions
- The popup-closed path shows "Captured, not copied" and **Copy** recovers
- The production `dist/` loads with no test hooks and only the four declared permissions

### What E2E does not prove

- **The OS clipboard.** Headless Chromium uses an internal clipboard.
- **Pasting into other applications.**
- **The real toolbar popup and the global shortcut.** Playwright opens `popup/index.html?tabId=N` in a window instead.
- **`activeTab` grant behavior.** The E2E build uses `<all_urls>` because Playwright cannot click the toolbar.
- **The `NotAllowedError` path** (popup loses focus mid-write). It is covered only by mocked unit tests.

## Manual release checklist

Run on each OS before a release and record the results in the release notes.

| #   | Step                                                                                 | macOS | Windows | Linux |
| --- | ------------------------------------------------------------------------------------ | ----- | ------- | ----- |
| 1   | Load `dist/` unpacked; no errors on the extension card                               | ☐     | ☐       | ☐     |
| 2   | Click the icon on a long article; popup shows progress, then **Copied to clipboard** | ☐     | ☐       | ☐     |
| 3   | Paste into an image editor or Slack: full page, no seams or duplicates               | ☐     | ☐       | ☐     |
| 4   | Paste into ChatGPT web and claude.ai: image attaches                                 | ☐     | ☐       | ☐     |
| 5   | Paste into Claude Code (`Ctrl+V` macOS/Linux, `Alt+V` Windows): `[Image #1]` appears | ☐     | ☐       | ☐     |
| 6   | `Alt+Shift+S` opens the popup and captures                                           | ☐     | ☐       | ☐     |
| 7   | Click away during capture, then reopen: "Captured, not copied"; `C` copies           | ☐     | ☐       | ☐     |
| 8   | `chrome://settings`: "Cannot capture this page"                                      | ☐     | ☐       | ☐     |
| 9   | Page scroll position unchanged after capture                                         | ☐     | ☐       | ☐     |
| 10  | 150% zoom and a HiDPI display: sharp output, no seams                                | ☐     | ☐       | ☐     |
| 11  | App-shell site (e.g. a chat UI): inner panel fully captured                          | ☐     | ☐       | ☐     |
| 12  | Enable _Also download_: permission prompt; file saved                                | ☐     | ☐       | ☐     |
