# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [0.1.0] - 2026-11-13

### Added

- Full-page scroll-and-stitch capture (vertical and 2-D), following live page growth
- DPR and zoom handling from measured bitmaps; `visualViewport` fractional sizing; 1 px frame overlap
- Sticky elements rendered in place; fixed elements shown once; full restore after success, error, or cancel
- App-shell support: largest inner scroller captured when the document does not scroll
- Event-driven settling (rAF, visible image loads) plus an optional per-frame delay
- Rate-limited `captureVisibleTab` with quota retry
- Canvas-limit planning (downscale or truncate) with explicit warnings
- Clipboard write from the popup; "Captured, not copied" state; copy-again; download
- Deterministic capture state machine; single-session guard
- Popup, settings page, `Alt+Shift+S` shortcut, toolbar badge, diagnostics log
- Restricted-page handling and a visible-area fallback
- 54 unit tests, 21 real-Chromium E2E tests, benchmark harness, and Python evaluator
- Documentation, roadmap, research plan, and CI
