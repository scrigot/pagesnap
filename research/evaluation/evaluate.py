"""Evaluate a benchmark run produced by `npm run bench`.

Metrics (all computed, none estimated):
  - band_alignment_max_px: max distance between a color band's measured start
    and its expected start (fixtures with known band geometry only)
  - gap_px: white rows inside the banded region (seams / missing content)
  - band_order_ok: every band present exactly once, in order
  - ref_match_pct: % of pixels identical to the CDP full-page reference, for
    fixtures where both renderings are expected to agree (no fixed/sticky
    elements, no inner scroller). Reported, not asserted.

Usage: python3 research/evaluation/evaluate.py research/results/<run-dir>
Requires: numpy, Pillow
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

import numpy as np
from PIL import Image

BAND = 100
# fixture -> (band count, css offset of band 0)
BANDED = {
    "long": (60, 0),
    "dynamic": (60, 0),
    "sticky": (50, 60),
    "fixed": (50, 50),
    "inner-scroll": (40, 0),
}
REF_COMPARABLE = {"long", "short", "wide", "lazy-images"}


def band_color(i: int) -> np.ndarray:
    return np.array([(i * 67 + 30) % 256, (i * 131 + 60) % 256, (i * 29 + 90) % 256], dtype=np.int32)


def analyze_bands(img: np.ndarray, count: int, offset: int, scale: float) -> dict:
    col = img[:, int(img.shape[1] * 0.75), :3].astype(np.int32)
    palette = np.stack([band_color(i) for i in range(count)])
    top, bottom = int(offset * scale), int((offset + count * BAND) * scale)
    starts: dict[int, int] = {}
    order: list[int] = []
    gap = 0
    for y in range(max(0, top), min(bottom, col.shape[0])):
        px = col[y]
        if (px > 250).all():
            gap += 1
            continue
        d = np.abs(palette - px).sum(axis=1)
        i = int(d.argmin())
        if d[i] > 24:
            continue
        if not order or order[-1] != i:
            order.append(i)
        starts.setdefault(i, y)
    errs = [abs(y - (offset + i * BAND) * scale) for i, y in starts.items() if i > 0]
    # Ignore single-row edge blends when checking order: they may classify as a neighbour.
    clean = [b for k, b in enumerate(order) if k == 0 or b > order[k - 1]]
    return {
        "band_alignment_max_px": round(max(errs), 2) if errs else None,
        "gap_px": gap,
        "band_order_ok": clean == list(range(count)),
    }


def ref_match(a: np.ndarray, b: np.ndarray) -> float | None:
    if a.shape != b.shape:
        return None
    return round(float((a[..., :3] == b[..., :3]).all(axis=2).mean() * 100), 3)


def main(run_dir: Path) -> None:
    data = json.loads((run_dir / "results.json").read_text())
    rows = []
    by_fixture: dict[str, list[dict]] = {}
    for r in data["results"]:
        by_fixture.setdefault(r["fixture"].removesuffix(".html"), []).append(r)
    for fx, runs in by_fixture.items():
        ok = [r for r in runs if r["ok"]]
        row = {
            "fixture": fx,
            "completion": f"{len(ok)}/{len(runs)}",
            "frames": ok[0]["frames"] if ok else None,
            "size": f'{ok[0]["width"]}x{ok[0]["height"]}' if ok else None,
            "png_kb": round(statistics.median(r["bytes"] for r in ok) / 1024) if ok else None,
            "capture_ms_median": round(statistics.median(r["captureMs"] for r in ok)) if ok else None,
            "capture_ms_max": max(r["captureMs"] for r in ok) if ok else None,
        }
        if ok:
            img = np.asarray(Image.open(run_dir / ok[0]["file"]).convert("RGB"))
            if fx in BANDED:
                row.update(analyze_bands(img, *BANDED[fx], ok[0]["outputScale"]))
            ref = run_dir / f"{fx}-reference.png"
            if fx in REF_COMPARABLE and ref.exists():
                row["ref_match_pct"] = ref_match(img, np.asarray(Image.open(ref).convert("RGB")))
        rows.append(row)

    cols = ["fixture", "completion", "frames", "size", "png_kb", "capture_ms_median", "capture_ms_max",
            "band_alignment_max_px", "gap_px", "band_order_ok", "ref_match_pct"]
    lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for r in rows:
        lines.append("| " + " | ".join("" if r.get(c) is None else str(r.get(c)) for c in cols) + " |")
    table = "\n".join(lines)
    (run_dir / "evaluation.json").write_text(json.dumps({"meta": data["meta"], "rows": rows}, indent=2))
    (run_dir / "evaluation.md").write_text(table + "\n")
    print(json.dumps(data["meta"], indent=2))
    print(table)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
