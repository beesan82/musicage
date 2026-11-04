#!/usr/bin/env python3
"""Generate the MUSICAGE app icon (design B: turntable on a light ground).

The icon is drawn programmatically at build time (see the "Generate the app
icon" step in codemagic.yaml) because binary assets cannot be carried through
the GitHub connector snapshot flow. The design was chosen by the owner on
2026-11-05 from six rendered candidates: a vinyl record with a red label and
a tonearm on a warm cream ground, echoing the product concept of a lyric
object placed beside a record.

Requires Pillow. Output: assets/icon.png, 1024x1024, RGB (no alpha).
"""
import math
import os

from PIL import Image, ImageDraw

S = 2  # supersampling factor
W = 1024 * S
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "icon.png")


def main() -> None:
    img = Image.new("RGB", (W, W), (238, 232, 218))
    d = ImageDraw.Draw(img, "RGBA")

    # Platter shadow
    d.ellipse([96 * S, 150 * S, 856 * S, 910 * S], fill=(0, 0, 0, 46))

    # Record disc and grooves
    cx, cy, R = 476 * S, 530 * S, 372 * S
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(18, 17, 16, 255))
    r = 150 * S
    while r < R - 8 * S:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(70, 66, 60, 255), width=2 * S)
        r += 13 * S

    # Label and spindle
    lr = 128 * S
    d.ellipse([cx - lr, cy - lr, cx + lr, cy + lr], fill=(176, 44, 36, 255))
    d.ellipse([cx - 15 * S, cy - 15 * S, cx + 15 * S, cy + 15 * S], fill=(238, 232, 218, 255))

    # Tonearm: pivot at top right, arm down to the record, red headshell
    px, py = 838 * S, 196 * S
    d.ellipse([px - 58 * S, py - 58 * S, px + 58 * S, py + 58 * S], fill=(40, 38, 35, 255))
    d.ellipse([px - 58 * S, py - 58 * S, px + 58 * S, py + 58 * S], outline=(120, 112, 100, 255), width=3 * S)
    tipx, tipy = 636 * S, 452 * S
    d.line([px, py, tipx, tipy], fill=(40, 38, 35, 255), width=17 * S)
    ang = math.atan2(tipy - py, tipx - px)
    hx, hy = tipx + 64 * S * math.cos(ang), tipy + 64 * S * math.sin(ang)
    d.line([tipx, tipy, hx, hy], fill=(176, 44, 36, 255), width=30 * S)

    img = img.resize((1024, 1024), Image.LANCZOS)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT)
    print(f"wrote {OUT} ({img.size[0]}x{img.size[1]}, mode {img.mode})")


if __name__ == "__main__":
    main()
