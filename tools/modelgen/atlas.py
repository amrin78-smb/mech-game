"""Gives every part its own rectangle of the asset's one texture.

Each brief allows a single material and a single texture per asset, and the game needs the
parts as separate objects. So the texture is an atlas: each object is unwrapped, then its
UVs are packed into the rectangle the asset's recipe assigns it. That is what lets the
texture painter put hazard stripes on the feet and soot on the exhaust stacks, instead of
painting one pattern over everything.

Padding is in pixels and is left blank, so bilinear filtering and mipmaps cannot bleed one
part's paint onto another's.
"""
import math

import bpy


def unwrap(obj, angle_limit_degrees=66.0, island_margin=0.02):
    """Smart-projects one object's UVs into 0..1. The operator takes radians."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(angle_limit_degrees), island_margin=island_margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def _uv_bounds(obj):
    uvs = obj.data.uv_layers.active.data
    xs = [d.uv[0] for d in uvs]
    ys = [d.uv[1] for d in uvs]
    return min(xs), min(ys), max(xs), max(ys)


def pack_into(obj, rect, size, padding=8):
    """Squeezes this object's UVs into `rect`, given as (x0, y0, x1, y1) fractions of the
    atlas. Returns the pixel rectangle to paint, with the padding already taken off."""
    x0, y0, x1, y1 = rect
    pad = padding / float(size)
    tx0, ty0 = x0 + pad, y0 + pad
    tx1, ty1 = x1 - pad, y1 - pad
    if tx1 <= tx0 or ty1 <= ty0:
        raise ValueError(f"rect {rect} is too small for {padding}px of padding")

    ux0, uy0, ux1, uy1 = _uv_bounds(obj)
    uw = max(ux1 - ux0, 1e-6)
    uh = max(uy1 - uy0, 1e-6)
    # One scale for both axes, so a square metre of the part gets the same number of pixels
    # whichever way it faces and the panel grid does not come out stretched.
    scale = min((tx1 - tx0) / uw, (ty1 - ty0) / uh)
    ox = tx0 + ((tx1 - tx0) - uw * scale) * 0.5
    oy = ty0 + ((ty1 - ty0) - uh * scale) * 0.5

    for d in obj.data.uv_layers.active.data:
        d.uv[0] = ox + (d.uv[0] - ux0) * scale
        d.uv[1] = oy + (d.uv[1] - uy0) * scale

    # Painting happens in a top-down array, so the V axis flips.
    px0 = int(round(tx0 * size))
    px1 = int(round(tx1 * size))
    py0 = int(round((1.0 - ty1) * size))
    py1 = int(round((1.0 - ty0) * size))
    return px0, py0, px1, py1


def grid(rows, cols):
    """Even rectangles, left to right then top to bottom, as a convenience for a recipe."""
    out = []
    for r in range(rows):
        for c in range(cols):
            out.append((c / cols, 1.0 - (r + 1) / rows, (c + 1) / cols, 1.0 - r / rows))
    return out
