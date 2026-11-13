# Contributing

Thanks for helping. PageSnap values correctness and honesty over features.

## Before you start

- For anything beyond a small fix, open an issue first so we can agree on the approach.
- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The split between pure logic (`src/capture`) and browser glue matters.

## Setup

```bash
npm ci && npm run build
```

Load `dist/` unpacked (see [docs/INSTALLATION.md](docs/INSTALLATION.md)).

## Pull request checklist

- [ ] `npm run check` passes (typecheck, lint, format, unit tests, build)
- [ ] `npm run test:e2e` passes for capture, stitching, clipboard, or UI changes
- [ ] New logic has unit tests; new page behaviors have an E2E fixture in `tests/fixtures/`
- [ ] Every DOM change in the page agent is reverted by `restore`
- [ ] No new permissions without discussion; never add host permissions to the production manifest
- [ ] No network calls, analytics, or remote code
- [ ] Docs updated (README, ARCHITECTURE, TROUBLESHOOTING) when behavior changes
- [ ] Performance or quality claims include the benchmark command and output

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), e.g. `fix(stitch): round destination edges independently`.

## Research contributions

Follow [research/README.md](research/README.md): preregister the hypothesis and metric, use synthetic or consented data, and report only measured results.
