"""Measures how much of a texture is actually in the brief's palette.

    python3 -I tools/model-check/check_palette.py <basecolor.png> [more.png ...]

The style section of every brief fixes a palette and a faction colour scheme. Judging that
by eye from a render is unreliable and the renders are the artist's own, so this reads the
texture itself and reports what share of its pixels sit near each briefed colour. It is
evidence for a conversation, not a pass/fail gate: a model is finally judged on frames of
the running game.
"""
import collections
import pathlib
import sys

from PIL import Image

# From the STYLE section shared by every brief.
PALETTE = {
    "rust orange":   (0xB5, 0x56, 0x2B),
    "brass":         (0xC9, 0xA0, 0x4A),
    "gunmetal":      (0x3A, 0x3F, 0x45),
    "ash grey":      (0x8A, 0x8A, 0x85),
    "oil black":     (0x1E, 0x1E, 0x1E),
    "hazard yellow": (0xE8, 0xB8, 0x28),
    "player teal":   (0x2F, 0x8F, 0x8A),
    "raider red":    (0xC0, 0x39, 0x2B),
}

NEAR = 60  # Euclidean distance in RGB that still counts as "that colour".


def classify(path):
    image = Image.open(path).convert("RGBA")
    pixels = image.getdata()

    counts = collections.Counter()
    opaque = 0
    for r, g, b, a in pixels:
        if a < 8:
            continue
        opaque += 1
        best_name, best_distance = None, None
        for name, (pr, pg, pb) in PALETTE.items():
            distance = ((r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2) ** 0.5
            if best_distance is None or distance < best_distance:
                best_name, best_distance = name, distance
        counts[best_name if best_distance <= NEAR else "off palette"] += 1

    return opaque, counts


def main(paths):
    for path in paths:
        opaque, counts = classify(path)
        print(f"\n=== {pathlib.Path(path).name}  ({opaque:,} opaque pixels) ===")
        for name, n in counts.most_common():
            share = n / opaque if opaque else 0
            bar = "#" * int(share * 40)
            print(f"  {name:14} {share:6.1%} {bar}")

        missing = [n for n in PALETTE if counts.get(n, 0) / max(opaque, 1) < 0.005]
        if missing:
            print(f"  barely present or absent: {', '.join(missing)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
