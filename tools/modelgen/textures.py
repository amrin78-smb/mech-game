"""Paints the base colour, emissive and normal-free texture maps, procedurally.

The briefs ask for "hand-painted textures with light wear, rivets, panel lines and soot
painted in rather than modelled". That is a flat-image job, so it is done here with numpy
rather than by a 3D generator: panel grids, rivet rings, soot gradients, rust streaks and
hazard stripes, painted into the exact region of the atlas that belongs to one part.

Each part owns a rectangle of the atlas (see atlas.py), so "hazard-yellow stripes on the
feet and the hip skirts" means painting those parts' rectangles and nothing else. Kimi's
first batch measured hazard yellow at 0.1 to 0.3% and the briefs' stripes were not clearly
there; here they land where the brief puts them because the brief is the input.

No baked lighting and no painted shadows: rule 9 of every brief reserves lighting to the
game. The grime here is dirt, applied as colour, not as an ambient-occlusion bake.
"""
import numpy as np

# The STYLE section every brief shares.
PALETTE = {
    "rust": (0xB5, 0x56, 0x2B),
    "brass": (0xC9, 0xA0, 0x4A),
    "gunmetal": (0x3A, 0x3F, 0x45),
    "ash": (0x8A, 0x8A, 0x85),
    "oil": (0x1E, 0x1E, 0x1E),
    "hazard": (0xE8, 0xB8, 0x28),
    "teal": (0x2F, 0x8F, 0x8A),
    "signal_red": (0xC0, 0x39, 0x2B),
}


def rgb(name, shade=1.0):
    r, g, b = PALETTE[name]
    return np.array([r, g, b], dtype=np.float32) / 255.0 * shade


def new_map(size, colour=(0.0, 0.0, 0.0)):
    """A fresh square map. Alpha is 1 everywhere: the briefs forbid transparency."""
    img = np.zeros((size, size, 4), dtype=np.float32)
    img[..., :3] = np.array(colour, dtype=np.float32)
    img[..., 3] = 1.0
    return img


def _view(img, rect):
    x0, y0, x1, y1 = rect
    return img[y0:y1, x0:x1]


def _smooth(a, passes=2):
    for _ in range(passes):
        a = (a
             + np.roll(a, 1, 0) + np.roll(a, -1, 0)
             + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5.0
    return a


def _noise(shape, seed, scale=8, passes=3):
    """Value noise in 0..1: a coarse random field, smoothed and stretched to size."""
    rng = np.random.default_rng(seed)
    h, w = shape
    coarse = rng.random((max(h // scale, 2), max(w // scale, 2))).astype(np.float32)
    coarse = _smooth(coarse, passes)
    ys = (np.linspace(0, coarse.shape[0] - 1, h)).astype(np.int32)
    xs = (np.linspace(0, coarse.shape[1] - 1, w)).astype(np.int32)
    out = coarse[np.ix_(ys, xs)]
    lo, hi = out.min(), out.max()
    return (out - lo) / (hi - lo) if hi > lo else out


# ------------------------------------------------------------------ painters


def plate(img, rect, colour, shade_variation=0.10, seed=1):
    """Base metal: a flat colour broken up by a little mottling, so it is not plastic."""
    v = _view(img, rect)
    n = _noise(v.shape[:2], seed)[..., None]
    v[..., :3] = colour * (1.0 - shade_variation * 0.5 + shade_variation * n)
    v[..., 3] = 1.0


def panel_lines(img, rect, cols, rows, width=2, darken=0.45, inset=0):
    """A grid of panel seams. Painted, not modelled, which is what the briefs ask for."""
    v = _view(img, rect)
    h, w = v.shape[:2]
    for i in range(1, cols):
        x = int(round(w * i / cols))
        v[inset:h - inset, max(x - width // 2, 0):x + width - width // 2, :3] *= darken
    for j in range(1, rows):
        y = int(round(h * j / rows))
        v[max(y - width // 2, 0):y + width - width // 2, inset:w - inset, :3] *= darken


def rivets(img, rect, spacing=28, radius=3, margin=10, light=1.5, dark=0.5):
    """Rivet heads: a lit top and a shadowed underside, two pixels apart. At phone size this
    is the detail that reads as 'bolted together'."""
    v = _view(img, rect)
    h, w = v.shape[:2]
    yy, xx = np.mgrid[0:2 * radius + 1, 0:2 * radius + 1]
    d = np.sqrt((xx - radius) ** 2 + (yy - radius) ** 2)
    head = (d <= radius).astype(np.float32)
    lit = head * ((yy < radius) * light + (yy >= radius) * dark)
    lit[head == 0] = 1.0
    for cy in range(margin, h - margin, spacing):
        for cx in range(margin, w - margin, spacing):
            y0, x0 = cy - radius, cx - radius
            if y0 < 0 or x0 < 0 or y0 + 2 * radius + 1 > h or x0 + 2 * radius + 1 > w:
                continue
            patch = v[y0:y0 + 2 * radius + 1, x0:x0 + 2 * radius + 1, :3]
            patch *= lit[..., None]


def grime(img, rect, strength=0.35, seed=7, from_top=False):
    """Soot and oil, heavier where it would gather. Colour, not a shadow bake."""
    v = _view(img, rect)
    h, w = v.shape[:2]
    ramp = np.linspace(1.0, 0.0, h) if from_top else np.linspace(0.0, 1.0, h)
    mask = (ramp[:, None] ** 2) * _noise((h, w), seed, scale=5)
    v[..., :3] *= (1.0 - strength * mask[..., None])


def streaks(img, rect, colour, count=14, strength=0.5, seed=3):
    """Rust weeping down from a seam. Vertical in UV space, which is down the part."""
    v = _view(img, rect)
    h, w = v.shape[:2]
    rng = np.random.default_rng(seed)
    for _ in range(count):
        x = rng.integers(0, max(w - 1, 1))
        width = int(rng.integers(2, max(w // 24, 3)))
        top = int(rng.integers(0, max(h // 2, 1)))
        run = int(rng.integers(h // 6, max(h // 2, 2)))
        fade = np.linspace(strength, 0.0, max(run, 1))[:, None, None]
        region = v[top:top + run, x:x + width, :3]
        if region.size == 0:
            continue
        region *= (1.0 - fade[:region.shape[0]])
        region += colour * fade[:region.shape[0]] * 0.8


def hazard_stripes(img, rect, pitch=22, angle=1.0, a="hazard", b="oil", band=None):
    """The diagonal yellow-and-black warning stripes the briefs ask for on feet and skirts."""
    v = _view(img, rect)
    h, w = v.shape[:2]
    y0, y1 = (0, h) if band is None else (int(h * band[0]), int(h * band[1]))
    yy, xx = np.mgrid[y0:y1, 0:w]
    on = (((xx + angle * yy) // pitch) % 2 == 0)
    v[y0:y1, :, :3] = np.where(on[..., None], rgb(a), rgb(b))


def accent_band(img, rect, colour="teal", band=(0.42, 0.52)):
    """A faction colour stripe. Player side is teal; raiders get signal red."""
    v = _view(img, rect)
    h = v.shape[0]
    v[int(h * band[0]):int(h * band[1]), :, :3] = rgb(colour)


def edge_wear(img, rect, strength=0.5, inset=6, colour="ash"):
    """Paint rubbed back to bare metal around the border of a part's atlas tile."""
    v = _view(img, rect)
    h, w = v.shape[:2]
    bare = rgb(colour, 1.25)
    for y0, y1, x0, x1 in (
        (0, inset, 0, w), (h - inset, h, 0, w), (0, h, 0, inset), (0, h, w - inset, w),
    ):
        region = v[y0:y1, x0:x1, :3]
        region *= (1.0 - strength)
        region += bare * strength


def save(img, path, colour_space="sRGB"):
    """Writes the map as a PNG through Blender, which needs no PIL."""
    import bpy

    h, w = img.shape[:2]
    name = path.name
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    image = bpy.data.images.new(name, width=w, height=h, alpha=True)
    image.colorspace_settings.name = colour_space
    # Blender's pixel buffer runs bottom-up; the arrays here are top-down.
    image.pixels.foreach_set(np.clip(img[::-1], 0.0, 1.0).ravel())
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return image
