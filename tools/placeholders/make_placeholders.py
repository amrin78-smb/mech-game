"""Builds the Phase 1 grey-box placeholders, straight from the model briefs.

    blender --background --factory-startup --python tools/placeholders/make_placeholders.py \
        -- --out unity_assets/PLACEHOLDERS

CLAUDE.md hard rule 5: until a Kimi model arrives, gameplay uses simple shapes at the real
size with the real pivots from the model's brief. This writes those shapes.

It authors in the briefs' own convention (metres, Z up, front faces -Y, left faces +X) and
names every object and material exactly as the brief does, for one reason above all: the
output then goes through tools/model-check/check_model.py against the same standards as a
real delivery. A placeholder that would fail the brief is not a placeholder, it is a wrong
size that gameplay will be tuned around.

Shapes are plain boxes. Each part's overall bounding box is exactly the briefed size, so
sub-boxes (the torso's exhaust stacks, a cab) sit strictly inside it and change the read
without changing a dimension.
"""
import argparse
import math
import pathlib
import shutil
import sys

import bmesh
import bpy


# ---------------------------------------------------------------------------- geometry


def _span(size, rule):
    """The local bounding box along one axis, given where the brief puts the origin."""
    if rule == "centre":
        return -size / 2.0, size / 2.0
    if rule == "min":
        return 0.0, size
    if rule == "max":
        return -size, 0.0
    raise ValueError(f"unknown origin rule {rule!r}")


def _box_verts(size, origin, offset=(0.0, 0.0, 0.0)):
    """Eight corners of a box sized `size`, placed by the origin rules in `origin`."""
    lo = []
    hi = []
    for axis, (s, rule, shift) in enumerate(zip(size, origin, offset)):
        a, b = _span(s, rule)
        lo.append(a + shift)
        hi.append(b + shift)
    return [
        (lo[0], lo[1], lo[2]), (hi[0], lo[1], lo[2]), (hi[0], hi[1], lo[2]), (lo[0], hi[1], lo[2]),
        (lo[0], lo[1], hi[2]), (hi[0], lo[1], hi[2]), (hi[0], hi[1], hi[2]), (lo[0], hi[1], hi[2]),
    ]


_BOX_FACES = [
    (0, 3, 2, 1),  # bottom, wound so the normal points down and out
    (4, 5, 6, 7),  # top
    (0, 1, 5, 4),
    (1, 2, 6, 5),
    (2, 3, 7, 6),
    (3, 0, 4, 7),
]


def make_part(name, boxes, location=(0.0, 0.0, 0.0)):
    """One mesh object from a list of boxes, at `location`, with its origin at (0,0,0).

    `boxes` is a list of (size, origin_rules, offset). The first box is the part's real
    extent; the rest are detail and must sit inside it.
    """
    mesh = bpy.data.meshes.new(name)
    verts = []
    faces = []
    for size, origin, offset in boxes:
        base = len(verts)
        verts.extend(_box_verts(size, origin, offset))
        faces.extend(tuple(base + i for i in face) for face in _BOX_FACES)

    mesh.from_pydata(verts, [], faces)
    mesh.validate()

    # The briefs require UVs. A placeholder carries no texture, so this is a plain
    # per-face unwrap: enough for the checker's "has UVs" and for a lightmap-free lit
    # material, and it costs nothing to replace when the real model lands.
    mesh.uv_layers.new(name="UVMap")
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.active
    for face in bm.faces:
        for i, loop in enumerate(face.loops):
            loop[uv_layer].uv = ((i & 1) ^ (i >> 1), i >> 1)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    mesh.shade_flat()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return obj


def make_leg(name, reach, thickness, location):
    """A two-segment insect leg: out along +X, then down. Origin at the hip."""
    out = reach * 0.55
    drop = reach * 0.75
    half = thickness / 2.0
    mesh = bpy.data.meshes.new(name)
    verts = []
    faces = []
    for size, origin, offset in (
        ((out, thickness, thickness), ("min", "centre", "centre"), (0.0, 0.0, 0.0)),
        ((thickness, thickness, drop), ("centre", "centre", "max"), (out - half, 0.0, 0.0)),
    ):
        base = len(verts)
        verts.extend(_box_verts(size, origin, offset))
        faces.extend(tuple(base + i for i in face) for face in _BOX_FACES)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.uv_layers.new(name="UVMap")
    mesh.shade_flat()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------------------- materials

# The STYLE section every brief shares. A placeholder is flat colour: the point is to read
# friend from foe and part from part at a glance, not to stand in for the painted texture.
PALETTE = {
    "gunmetal": (0x3A / 255, 0x3F / 255, 0x45 / 255, 1.0),
    "brass": (0xC9 / 255, 0xA0 / 255, 0x4A / 255, 1.0),
    "rust": (0xB5 / 255, 0x56 / 255, 0x2B / 255, 1.0),
    "ash": (0x8A / 255, 0x8A / 255, 0x85 / 255, 1.0),
}


def make_material(name, colour):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = PALETTE[colour]
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Roughness"].default_value = 0.65
    return mat


# ---------------------------------------------------------------------------- the assets


def titan_chassis():
    """Brief 01. Hip at (2.20, 0, 0), knee -3.40 below it, ankle -6.80, sole at -7.70."""
    # The brief's 9.0 m of torso height is the exhaust stacks; the torso box itself is
    # 6.5 m. Both are built, so the bounding box is the brief's 9.0 and the silhouette is
    # the brief's shape.
    # The torso box is the brief's 6.5 m; the two exhaust stacks carry the bounding box to
    # the brief's 9.0 m. The collar the main cannon sits in is not modelled: it would have
    # to protrude past the front face to be seen, which breaks the briefed 7.0 m length,
    # and the cannon's own housing fills that space anyway at the mount point.
    torso = make_part("Titan_Torso", [
        ((5.5, 7.0, 6.5), ("centre", "centre", "min"), (0.0, 0.0, 0.0)),
        ((1.1, 1.1, 9.0), ("centre", "centre", "min"), (-1.4, 2.3, 0.0)),
        ((1.1, 1.1, 9.0), ("centre", "centre", "min"), (1.4, 2.3, 0.0)),
    ])
    upper = make_part("Titan_Leg_Upper", [
        ((1.6, 1.6, 3.4), ("centre", "centre", "max"), (0.0, 0.0, 0.0)),
    ], location=(2.2, 0.0, 0.0))
    lower = make_part("Titan_Leg_Lower", [
        ((1.5, 1.5, 3.4), ("centre", "centre", "max"), (0.0, 0.0, 0.0)),
    ], location=(2.2, 0.0, -3.4))
    foot = make_part("Titan_Foot", [
        ((2.2, 3.6, 0.9), ("centre", "centre", "max"), (0.0, 0.0, 0.0)),
    ], location=(2.2, 0.0, -6.8))

    mat = make_material("Titan_Mat", "gunmetal")
    for obj in (torso, upper, lower, foot):
        obj.data.materials.append(mat)


def titan_cannon_autocannon():
    """Brief 02. Trunnion at the housing centre; barrel rear end at Y = -0.60."""
    housing = make_part("Autocannon_Housing", [
        ((2.2, 2.4, 2.0), ("centre", "centre", "centre"), (0.0, 0.0, 0.0)),
        # The ammunition drum the brief asks for, kept inside the briefed block.
        ((1.0, 1.0, 1.0), ("centre", "centre", "centre"), (0.0, 0.6, 0.4)),
    ])
    barrel = make_part("Autocannon_Barrel", [
        ((0.7, 5.0, 0.7), ("centre", "max", "centre"), (0.0, 0.0, 0.0)),
    ], location=(0.0, -0.6, 0.0))

    mat = make_material("Autocannon_Mat", "brass")
    for obj in (housing, barrel):
        obj.data.materials.append(mat)


def enemy_rustcrawler():
    """Brief 10. Body origin at the centre of its underside; one leg at a hip socket."""
    body = make_part("Rustcrawler_Body", [
        ((1.8, 3.2, 1.4), ("centre", "centre", "min"), (0.0, 0.0, 0.0)),
        # The claws the brief includes in the 3.2 m, kept inside it.
        ((0.5, 1.0, 0.4), ("centre", "max", "centre"), (-0.5, -0.6, 0.5)),
        ((0.5, 1.0, 0.4), ("centre", "max", "centre"), (0.5, -0.6, 0.5)),
    ])
    leg = make_leg("Rustcrawler_Leg", reach=1.3, thickness=0.22, location=(0.8, 0.0, 0.2))

    mat = make_material("Rustcrawler_Mat", "rust")
    for obj in (body, leg):
        obj.data.materials.append(mat)


def pickup_scrap():
    """Brief 27. Three lumps, each about 0.8 m across, origin at the centre of each."""
    objs = []
    # The brief is "about 0.8 m across in every direction" for all three, so the extent is
    # the same for each and only the nub bolted to it differs.
    for name, nub in (
        ("Scrap_A", (0.0, 0.0, 0.25)),
        ("Scrap_B", (0.25, 0.0, 0.0)),
        ("Scrap_C", (0.0, 0.25, 0.0)),
    ):
        objs.append(make_part(name, [
            ((0.8, 0.8, 0.8), ("centre", "centre", "centre"), (0.0, 0.0, 0.0)),
            ((0.3, 0.3, 0.3), ("centre", "centre", "centre"), nub),
        ]))
    mat = make_material("Scrap_Mat", "brass")
    for obj in objs:
        obj.data.materials.append(mat)


def env_rust_flats_ground():
    """Brief 28. 20 m along X, 12 m deep, walking surface at Z = 0, front lip down to -3."""
    tile = make_part("Ground_Tile", [
        ((20.0, 12.0, 3.0), ("centre", "centre", "max"), (0.0, 0.0, 0.0)),
    ])
    tile.data.materials.append(make_material("Ground_Mat", "ash"))


ASSETS = {
    "titan_chassis": titan_chassis,
    "titan_cannon_autocannon": titan_cannon_autocannon,
    "enemy_rustcrawler": enemy_rustcrawler,
    "pickup_scrap": pickup_scrap,
    "env_rust_flats_ground": env_rust_flats_ground,
}


# ---------------------------------------------------------------------------- export


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export(asset_id, out_root):
    folder = out_root / asset_id
    folder.mkdir(parents=True, exist_ok=True)
    blend = folder / f"{asset_id}.blend"
    fbx = folder / f"{asset_id}.fbx"

    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    # axis_forward/-up put Blender's Z-up, -Y-front model into Unity's Y-up, +Z-forward
    # without Unity having to correct it on import. ScaleAndPivotTests prove the result.
    bpy.ops.export_scene.fbx(
        filepath=str(fbx),
        use_selection=False,
        apply_unit_scale=True,
        global_scale=1.0,
        apply_scale_options="FBX_SCALE_NONE",
        axis_forward="-Z",
        axis_up="Y",
        object_types={"MESH"},
        mesh_smooth_type="FACE",
        use_mesh_modifiers=False,
        add_leaf_bones=False,
        bake_anim=False,
        path_mode="COPY",
    )
    return blend, fbx


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument(
        "--copy-fbx-to",
        default=None,
        help="Also copy each .fbx here, for the Unity project. The .blend and the FBX in "
             "--out are the checkable source; this is the imported copy.",
    )
    parser.add_argument("--only", nargs="*", default=None)
    args = parser.parse_args(argv)

    out_root = pathlib.Path(args.out).resolve()
    wanted = args.only or list(ASSETS)

    for asset_id in wanted:
        build = ASSETS.get(asset_id)
        if build is None:
            raise SystemExit(f"no placeholder for {asset_id!r}; known: {', '.join(ASSETS)}")
        clear_scene()
        build()
        blend, fbx = export(asset_id, out_root)
        if args.copy_fbx_to:
            dest = pathlib.Path(args.copy_fbx_to).resolve()
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(fbx, dest / fbx.name)
        tris = sum(
            len(obj.data.loop_triangles) if obj.data.loop_triangles else
            sum(len(p.vertices) - 2 for p in obj.data.polygons)
            for obj in bpy.data.objects if obj.type == "MESH"
        )
        parts = sorted(o.name for o in bpy.data.objects if o.type == "MESH")
        print(f"  built {asset_id:26} {len(parts)} parts, {tris:5} triangles  {', '.join(parts)}")

    print(f"\n  written to {out_root}")


if __name__ == "__main__":
    main()
