# Benchmarks

Every number here was measured by `npm run bench` and `research/evaluation/evaluate.py`. Nothing is estimated or extrapolated.

## Method

- **Harness:** `scripts/bench.mjs` loads the E2E build in Chromium, serves `tests/fixtures/` locally, runs N captures per fixture through the real extension, and saves each PNG with its summary. It also saves Chrome's own full-page screenshot (CDP `Page.captureScreenshot` via Playwright `fullPage: true`) as a reference.
- **Evaluator:** `research/evaluation/evaluate.py` computes:
  - **band_alignment_max_px**: max |measured − expected| start row of each color band, in output pixels
  - **gap_px**: white rows inside the banded region (seams or missing content)
  - **band_order_ok**: every band present exactly once, in order
  - **ref_match_pct**: % of pixels identical to the CDP reference. Computed only for fixtures where both renderers should agree; the sticky and fixed fixtures intentionally differ.
- **Capture time** is `durationMs` from the extension (prepare → PNG encoded). It is dominated by Chrome's 2 calls/s `captureVisibleTab` quota, about 0.5 s per frame.

## Environment (2026-11-13 run)

```
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.0.0 Safari/537.36
{'platform': 'linux', 'arch': 'x64', 'cpus': 4, 'cpuModel': 'Intel(R) Xeon(R) Processor @ 2.10GHz', 'memGB': 16}
```

Headless Chromium in a Linux container, window 1280×800. Desktop hardware and GPU rasterization will change the timings; the quota floor will not.

## Results: device scale factor 1 (3 runs per fixture)

| fixture      | completion | frames | size      | png_kb | capture_ms_median | capture_ms_max | band_alignment_max_px | gap_px | band_order_ok | ref_match_pct |
| ------------ | ---------- | ------ | --------- | ------ | ----------------- | -------------- | --------------------- | ------ | ------------- | ------------- |
| short        | 3/3        | 1      | 1280x713  | 23     | 104               | 1298           |                       |        |               | 100.0         |
| long         | 3/3        | 9      | 1280x6000 | 243    | 4904              | 6067           | 0                     | 0      | True          | 100.0         |
| sticky       | 3/3        | 8      | 1280x5060 | 205    | 4989              | 4991           | 0                     | 0      | True          |               |
| fixed        | 3/3        | 8      | 1280x5050 | 205    | 4929              | 4954           | 0                     | 0      | True          |               |
| dynamic      | 3/3        | 11     | 1280x6000 | 243    | 6123              | 6659           | 0                     | 0      | True          |               |
| inner-scroll | 3/3        | 7      | 1080x4000 | 146    | 3715              | 4290           | 0                     | 0      | True          |               |
| wide         | 3/3        | 10     | 2400x3000 | 147    | 5606              | 6149           |                       |        |               | 100.0         |
| lazy-images  | 3/3        | 7      | 1280x4800 | 135    | 3675              | 4900           |                       |        |               | 100.0         |

## Results: device scale factor 2 (2 runs per fixture)

| fixture      | completion | frames | size       | png_kb | capture_ms_median | capture_ms_max | band_alignment_max_px | gap_px | band_order_ok | ref_match_pct |
| ------------ | ---------- | ------ | ---------- | ------ | ----------------- | -------------- | --------------------- | ------ | ------------- | ------------- |
| short        | 2/2        | 1      | 2560x1426  | 79     | 208               | 209            |                       |        |               | 100.0         |
| long         | 2/2        | 9      | 2560x12000 | 764    | 5502              | 6206           | 0                     | 0      | True          | 100.0         |
| sticky       | 2/2        | 8      | 2560x10120 | 645    | 4184              | 4256           | 0                     | 0      | True          |               |
| fixed        | 2/2        | 8      | 2560x10100 | 643    | 4222              | 4326           | 0                     | 0      | True          |               |
| dynamic      | 2/2        | 11     | 2560x12000 | 764    | 5260              | 5872           | 0                     | 0      | True          |               |
| inner-scroll | 2/2        | 7      | 2160x8000  | 448    | 3660              | 3762           | 0                     | 0      | True          |               |
| wide         | 2/2        | 10     | 4800x6000  | 553    | 5148              | 5158           |                       |        |               | 100.0         |
| lazy-images  | 2/2        | 7      | 2560x9600  | 495    | 3786              | 4052           |                       |        |               | 100.0         |

## Observations

- Output was pixel-identical to Chrome's full-page screenshot on all four comparable fixtures, at both device scales.
- Alignment error was 0 px and gap pixels were 0 on every banded fixture.
- The occasional slower runs (for example `short` at 1.3 s instead of 0.1 s) coincide with back-to-back captures hitting the per-second quota and the 600 ms retry. That is expected behavior, not a regression.
- `dynamic` varies between 9 and 11 frames because new content arrives asynchronously relative to scrolling.
- A 1 px seam at 150% zoom was found by the E2E suite (not this benchmark) and fixed before these runs (frame overlap plus `visualViewport` sizing).

## Not yet measured

Peak memory, real-website completion rate, clipboard success rate across OSes, OCR character error rate, and multimodal comprehension. See [ROADMAP.md](../ROADMAP.md) (M2, M6) and [research/README.md](../research/README.md).

## Reproduce

```bash
npm run bench -- --runs 3 --dsf 1 --out research/results/my-run
```

```bash
python3 research/evaluation/evaluate.py research/results/my-run
```
