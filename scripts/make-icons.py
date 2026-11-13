"""Render the PageSnap toolbar icons (stacked frames inside a rounded square).

Run: python3 scripts/make-icons.py   (requires Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "icons"
BG = (124, 140, 255, 255)
INK = (12, 12, 14, 255)


def render(size: int) -> Image.Image:
    s = 8  # supersample
    n = size * s
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=BG)
    # A tall "page" with three stacked frame bands.
    left, right = int(n * 0.30), int(n * 0.70)
    top, bottom = int(n * 0.18), int(n * 0.82)
    w = max(s, int(n * 0.07))
    d.rounded_rectangle([left, top, right, bottom], radius=int(n * 0.06), outline=INK, width=w)
    for frac in (0.39, 0.61):
        y = int(top + (bottom - top) * frac)
        d.line([left, y, right, y], fill=INK, width=max(s, int(w * 0.8)))
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        render(size).save(OUT / f"icon-{size}.png")
    print(f"wrote icons to {OUT}")


if __name__ == "__main__":
    main()
