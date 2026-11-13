# PageSnap research

The engineering goal of this directory is that every claim PageSnap makes about quality can be **reproduced from code in this repo**. Its research goal is to find out which page representations help AI models most, and when.

**Rules**

1. **Hypotheses and observations stay separate.** Each experiment file states its hypothesis, baseline, and metric _before_ results exist. Results are appended with the environment and the commit.
2. **Deterministic first.** ML is adopted only when it beats the deterministic baseline on a preregistered metric.
3. **No invented numbers.** If something has not been run, it is listed as _not measured_.

## Layout

| Path                                 | Contents                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `evaluation/evaluate.py`             | Scores a benchmark run: alignment error, gaps, band order, pixel match vs. Chrome's full-page screenshot |
| `benchmarks/`                        | Benchmark definitions (fixture lists, corpora as URL lists, never images)                                |
| `experiments/`                       | Preregistered experiment plans (`Qn-*.md`)                                                               |
| `datasets/`                          | Dataset cards only. Image data is generated locally and git-ignored.                                     |
| `schemas/context-bundle.schema.json` | Draft schema for AI context bundles (ROADMAP M5)                                                         |
| `results/`                           | Local outputs of `npm run bench` (git-ignored)                                                           |

## Setup

```bash
python3 -m venv .venv && . .venv/bin/activate && pip install -r research/requirements.txt
```

```bash
npm run bench -- --runs 3 --out research/results/run1
```

```bash
python3 research/evaluation/evaluate.py research/results/run1
```

## Research questions

| #   | Question                                                                                       | Hypothesis                                                                                                       | Baseline                             | Primary metric                                                        | Status  |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- | ------- |
| Q1  | Can perceptual hashing find duplicated fixed/overlay strips across frames?                     | Strip-level pHash finds repeated overlays the DOM rule misses (overlays drawn on canvas, late `position: fixed`) | DOM `position: fixed` scan (current) | Duplicate-region frequency on a labeled fixture set; precision/recall | Planned |
| Q2  | Does content-aware seam placement reduce visible artifacts on animated pages?                  | Moving seams to low-energy rows reduces perceptual diff in the overlap region                                    | Fixed seams (current)                | Mean SSIM of overlap regions; human A/B                               | Planned |
| Q3  | Can near-duplicate detection stop infinite feeds better than a height cap?                     | pHash distance between successive frames identifies "no new content"                                             | `maxCaptureHeight`                   | Captured unique content / total pixels                                | Planned |
| Q4  | How does screenshot resolution affect multimodal comprehension?                                | Accuracy holds until text x-height falls below a threshold, then drops sharply                                   | Native DPR output                    | QA accuracy on synthetic pages with known answers, by scale           | Planned |
| Q5  | Which compression preserves readability at the smallest size?                                  | WebP q≈80 matches PNG OCR CER at a fraction of the bytes for text-heavy pages                                    | PNG                                  | OCR character error rate vs. bytes (Pareto)                           | Planned |
| Q6  | Screenshot vs. DOM text vs. accessibility tree vs. hybrid: which is best for AI understanding? | Hybrid wins on layout-dependent questions; text wins on long prose                                               | Screenshot only                      | Task accuracy and token cost per representation                       | Planned |

## Metrics

| Metric                     | Definition                                              | Measured today                       |
| -------------------------- | ------------------------------------------------------- | ------------------------------------ |
| Capture completion rate    | successful captures / attempts                          | Fixtures only (100%, see BENCHMARKS) |
| Clipboard success rate     | `copied: true` / successful captures with popup present | E2E only (headless clipboard)        |
| Capture duration           | prepare → PNG encoded (`durationMs`)                    | Yes                                  |
| Stitch alignment error     | max \|measured − expected\| band start (px)             | Yes                                  |
| Gap pixels                 | white rows within known content                         | Yes                                  |
| Pixel fidelity             | % identical pixels vs. CDP full-page reference          | Yes (comparable fixtures)            |
| Output dimensions and size | width × height, PNG bytes                               | Yes                                  |
| Duplicate-region frequency | repeated strips per capture (Q1)                        | No                                   |
| Peak memory                | SW JS heap + canvas during stitch                       | No                                   |
| OCR CER                    | Levenshtein(OCR, ground truth) / len(ground truth)      | No                                   |
| Comprehension accuracy     | correct answers / questions (Q4, Q6)                    | No                                   |

## Data policy

- Use only **synthetic fixtures** (generated locally, ground truth known) or **public pages the experimenter chose**, stored as URL lists. Do not commit third-party screenshots.
- Never collect screenshots from users. PageSnap has no telemetry, and research data never comes from the extension in the field.
- Any human-labeled dataset needs a dataset card (`datasets/<name>.md`): source, license, consent, PII review.
- Redact before sharing. Model-comprehension experiments must not send private pages to third-party APIs.
