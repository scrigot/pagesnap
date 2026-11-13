# Roadmap

PageSnap's direction: from a reliable screenshot utility to an open-source **visual context engine**, the most dependable way to hand a webpage to an AI model. Stable capture comes before anything clever.

Legend: **Implemented** · **In progress** · **Planned** · **Research**
Tracks: `SWE` (software engineering) · `DS` (data science and evaluation) · `ML` (machine learning research) · `AI` (applied AI integrations)

| #   | Milestone                                              | Track   | Priority | Status               |
| --- | ------------------------------------------------------ | ------- | -------- | -------------------- |
| M1  | Screenshot engine                                      | SWE     | P0       | Implemented (v0.1.0) |
| M2  | Release hardening and real-site reliability            | SWE, DS | P0       | Planned              |
| M3  | Capture quality: region, element, and sequence capture | SWE     | P1       | Planned              |
| M4  | Intelligent visual capture                             | ML, SWE | P1       | Research             |
| M5  | AI-ready context bundles                               | SWE, AI | P1       | Research             |
| M6  | Evaluation and benchmarking framework                  | DS, ML  | P1       | In progress          |
| M7  | Developer integrations                                 | AI      | P2       | Research             |

---

## M1 — Screenshot engine · `SWE` · P0 · **Implemented**

**Objective.** One click captures the entire scrollable page, stitches it exactly, and copies a PNG to the clipboard.

**Core features**

- [x] Scroll-and-stitch capture via `captureVisibleTab`, row-major, 2-D for wide pages
- [x] Live re-measurement each frame (growing pages, scroll clamping, stuck detection)
- [x] DPR and zoom handling measured from captured bitmaps; fractional `visualViewport` sizing
- [x] 1 CSS px frame overlap (fixes a device-pixel snapping seam found at 150% zoom)
- [x] Sticky → static; fixed elements hidden after the first frame; full restore
- [x] Inner-scroller (app-shell) detection
- [x] Event-driven settling: rAF, visible images; optional per-frame delay
- [x] Rate limiting and retry for the 2 calls/s quota
- [x] Canvas limit planning: downscale or truncate, always with a warning
- [x] Clipboard write from the popup; honest "Captured, not copied" state; copy-again
- [x] Deterministic state machine; single-session guard; cancellation
- [x] Popup, settings page, `_execute_action` shortcut, badge, diagnostics log
- [x] Restricted-page detection; visible-area fallback for unscriptable pages

**Technical challenges solved.** No image clipboard in service workers or offscreen documents; device-pixel scroll snapping; rate limits; canvas size limits; restoring pages after errors.

**Deliverables.** Extension, 54 unit tests, 21 real-Chromium E2E tests, benchmark harness, documentation.

**Acceptance criteria**

- [x] Unpacked extension loads; production build has no test hooks (automated)
- [x] Full scrollable fixture captured with every section exactly once (automated, pixel-checked)
- [x] PNG written to the clipboard and read back as a decodable `image/png` (automated, headless Chromium clipboard)
- [x] Clipboard failure produces an actionable error (automated: popup-closed path; mocked: permission-denied path)
- [x] Scroll position restored (automated)
- [x] TypeScript strict build, lint, and tests pass in CI
- [ ] Paste into an external app verified on macOS, Windows, and Linux (manual; see [docs/TESTING.md](docs/TESTING.md))

---

## M2 — Release hardening and real-site reliability · `SWE` `DS` · P0 · Planned

**Objective.** Prove PageSnap works on real sites, not only fixtures, and ship it to the Chrome Web Store.

**Core features**

- [ ] Manual release checklist run on macOS, Windows, and Linux, recorded per release
- [ ] Real-site smoke corpus: about 50 public, non-sensitive pages (docs, news, dashboards, SPAs), captured in CI on a schedule; track completion rate and warnings
- [ ] Chrome Web Store listing, privacy disclosures, and store screenshots taken from the real extension
- [ ] Handle `beforeunload` and history navigations in SPAs (abort cleanly vs. continue)
- [ ] Surface `file://` access guidance with a link to the extension's details page
- [ ] Optional accessibility pass on the popup and settings pages (screen-reader labels, contrast audit)

**Technical challenges.** Real sites are non-deterministic (ads, A/B tests, consent banners). Network access in CI. Measuring completion without storing screenshots of third-party content.

**Deliverables.** Versioned checklist results; `research/benchmarks/real-sites.json` (URLs only); store package.

**Acceptance criteria.** ≥95% capture completion on the smoke corpus, with every failure categorized. Zero unrestored pages. Store review passed.

**Dependencies.** M1.

**Suggested issues**

- `release: manual paste-verification checklist for v0.1.x`
- `ci: scheduled real-site smoke run (completion rate only, no image retention)`
- `store: listing copy, privacy fields, screenshots`
- `bug: SPA route change mid-capture`

---

## M3 — Capture modes · `SWE` · P1 · Planned

**Objective.** Capture exactly what the user needs, not always the whole page.

**Core features**

- [ ] Visible-area capture (instant, no scrolling)
- [ ] Region selection overlay (drag a rectangle, which can extend below the fold)
- [ ] Element capture (hover-highlight a DOM node, capture its full scroll extent)
- [ ] Multi-page sequence: capture a list of open tabs into one export
- [ ] Opt-in **CDP mode** (`chrome.debugger` with `captureBeyondViewport`) for speed, with clear disclosure of the debugger infobar and permission
- [ ] JPEG and WebP output with a quality setting; clipboard stays PNG where destinations require it

**Technical challenges.** Overlay UI that does not disturb page layout. Element capture across nested scrollers. Permission UX for `debugger`.

**Acceptance criteria.** Each mode has E2E fixtures; region output matches the requested rectangle within 1 px.

**Dependencies.** M1.

**Suggested issues**: `feat: region capture overlay` · `feat: element capture` · `feat: opt-in CDP fast mode` · `feat: output format setting`

---

## M4 — Intelligent visual capture · `ML` `SWE` · P1 · **Research**

**Objective.** Fix what deterministic rules can't: repeated or ambiguous overlays, scroll-triggered effects, and very long feeds.

**Investigations**

- [ ] **Duplicate fixed or overlay detection with perceptual hashing.** Hash horizontal strips at the top and bottom of each frame and flag strips that repeat across frames while the content between them changes. Compare against the current DOM-based rule.
- [ ] **Content-aware seams.** When a frame boundary cuts through text, shift the seam to the nearest low-gradient row (edge detection, row energy). This matters only when frames disagree, for example on animated pages.
- [ ] **Animation and parallax detection.** Detect frames where the overlap region differs from the previous frame. Retry with a delay, or warn.
- [ ] **Infinite-scroll stopping rule.** Stop when new frames are near-duplicates (pHash distance) rather than at a fixed height.
- [ ] **Semantic regions.** Detect headers, tables, charts, forms, and code blocks, first with DOM and accessibility-tree heuristics, then a vision model only if it measurably beats them.
- [ ] **Adaptive compression.** Choose format and quality per region so text stays legible at the smallest size (feeds M6 Q5).

**Principle.** Introduce ML only where it beats the deterministic baseline on the M6 benchmark. Every experiment states its hypothesis and baseline up front.

**Technical challenges.** Runs locally in the extension: WASM or JS CV with no model downloads by default. Latency budget under 300 ms per page.

**Dependencies.** M6 for measurement; M1.

**Suggested issues**: `research: pHash strip dedup vs DOM rule` · `research: seam placement by row energy` · `research: near-duplicate stop rule for feeds`

---

## M5 — AI-ready context bundles · `SWE` `AI` · P1 · **Research**

**Objective.** Export a page as a structured bundle an AI assistant can use: the image plus the context the image can't carry.

**Core features (design)**

- [ ] Bundle schema v0: screenshot(s), title, URL, timestamp, viewport and document size, DPR, capture warnings, image metadata. Draft in [`research/schemas/context-bundle.schema.json`](research/schemas/context-bundle.schema.json).
- [ ] Optional extracted text (`innerText` of the capture target) and optional sanitized accessibility tree (roles, names, levels; no values)
- [ ] **Local redaction before export:** emails, phone numbers, long digit runs, and user-marked regions. Redaction applies to both pixels and text.
- [ ] Export as a `.zip` or a single Markdown file with the embedded image; copy-as-Markdown for chat tools
- [ ] Explicit consent per export. Text extraction off by default.

**Technical challenges.** Aligning DOM text with pixel regions; redaction recall vs. precision; size budgets for chat uploads.

**Acceptance criteria.** Schema validated in CI. Redaction unit tests with synthetic PII. No extracted text leaves the device unless the user exports it.

**Dependencies.** M1; M6 for the representation study.

**Suggested issues**: `design: context bundle schema v0` · `feat: local PII redaction (text + pixels)` · `feat: copy as Markdown bundle`

---

## M6 — Evaluation and benchmarking · `DS` `ML` · P1 · **In progress**

**Objective.** Make every quality claim reproducible.

**Done**

- [x] Deterministic fixtures with known geometry (`tests/fixtures`)
- [x] Benchmark harness: `npm run bench` (real Chromium; timings, sizes, frames, warnings)
- [x] Evaluator: `research/evaluation/evaluate.py` (alignment error, gap pixels, band order, pixel match vs. CDP reference)
- [x] First measured results in [docs/BENCHMARKS.md](docs/BENCHMARKS.md)

**Planned**

- [ ] Peak memory measurement (SW heap via CDP `Performance.getMetrics`)
- [ ] Fixtures for zoom levels 50–200%, DPR 1/1.5/2/3, RTL, `position: fixed` footers, parallax
- [ ] Real-site completion study (M2 corpus)
- [ ] Research questions Q1–Q6 in [research/README.md](research/README.md), each with a preregistered metric

**Metrics**: capture completion rate · clipboard success rate · capture duration · stitch alignment error · output dimensions · output size · pixel fidelity vs. reference · duplicate-region frequency · peak memory · OCR character error rate · multimodal comprehension accuracy

**Dependencies.** None. This milestone gates M4 and M5 decisions.

**Suggested issues**: `bench: peak memory` · `fixtures: zoom/DPR matrix` · `research: Q4 resolution vs comprehension protocol`

---

## M7 — Developer integrations · `AI` · P2 · **Research**

**Objective.** Get page context into AI tools without the clipboard when that is more reliable. Only build on verified, documented APIs.

**Candidates (verify before building)**

- [ ] **MCP server**: a local companion exposing `capture_page` / `get_last_capture` to MCP-compatible clients. Needs native messaging (`nativeMessaging` permission plus a host install).
- [ ] **Claude Code**: today, paste with `Ctrl+V` (macOS/Linux) or `Alt+V` (Windows). An MCP integration would avoid the clipboard entirely.
- [ ] **Cursor and VS Code**: file-based handoff (save to a watched folder) as the most portable option. Clipboard paste support varies by OS and version.
- [ ] Visual diff between captures of the same URL (regression checks)
- [ ] Export captures as Playwright visual-test fixtures

**Rule.** No integration ships without a test against the real tool, and compatibility tables list only what has been verified.

**Dependencies.** M5 (bundle format).

**Suggested issues**: `spike: native-messaging MCP companion` · `spike: watched-folder handoff` · `feat: capture diff`
