# Q4 — Screenshot resolution vs. multimodal comprehension (preregistration)

**Status:** planned. No results yet.

## Hypothesis

For a fixed page, a multimodal model's question-answering accuracy stays flat as the screenshot is downscaled, until rendered text x-height falls below a threshold (expected: 6–8 px). Below that, accuracy drops sharply.

## Why it matters

Chat tools downscale large images. PageSnap could choose window width or tiling to keep text above the threshold instead of shipping one 12,000 px image.

## Stimuli

- 30 synthetic pages from templates (docs, pricing table, dashboard, form, code). Text and numbers are randomized from a seed, so answers are known.
- 5 questions per page: lookup, comparison, layout ("what is left of…"), count, code reading.
- Captured with PageSnap at DPR 2, then resampled to 100/75/50/35/25% (Lanczos).

## Conditions

Scale (5 levels) × model (≥2 vision models) × tiling (single image vs. 2,000 px tiles).

## Metrics

- Primary: exact-match accuracy per scale.
- Secondary: token or image cost, latency.
- Threshold estimate: logistic fit of accuracy vs. x-height.

## Analysis plan

Mixed-effects logistic regression (page as a random effect). Report 95% CIs. No post-hoc subsetting without labeling it exploratory.

## Data handling

All pages are synthetic. No real user content.
