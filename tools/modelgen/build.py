"""Builds Scrap Titan's models from their briefs: geometry, UVs and textures, all in code.

    blender --background --factory-startup --disable-autoexec \
        --python tools/modelgen/build.py -- --out unity_assets/GENERATED \
        --copy-fbx-to ScrapTitan/Assets/_Game/Art/Generated

One recipe per asset, following its brief's DESIGN section for the shape and its EXACT
DIMENSIONS AND PIVOTS section for every number. Shapes come from shapes.py (rounded boxes,
lathes, capsules, tori: the littleburgerworld approach), the single texture each brief allows
is painted by textures.py into per-part rectangles assigned by atlas.py.

The output goes through tools/model-check/check-all.sh against the same standards as a Kimi
delivery, so a dimension or a pivot or a triangle cap cannot drift unnoticed. fit() in
shapes.py refuses to stretch a part more than 5% to make it pass, which is the model rule
that matters: never loosen a limit to make a model pass.
"""
import argparse
import math
import pathlib
import shutil
import sys

import bpy

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import atlas  # noqa: E402
import shapes  # noqa: E402
import textures as tx  # noqa: E402


def material(name, image):
    """One material per asset, named as the brief says, with the painted base colour on it.
    Rule 8 of every brief: standard PBR with image textures, no procedural node shaders. The
    procedural work happened in numpy and was baked to a PNG, which is what arrives here."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.location = (-400, 200)
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.62
    return mat


def finish(objs, asset_id, size, paint, out_dir, material_name):
    """Unwraps every part into its own slice of the atlas, paints it, and binds the material."""
    img = tx.new_map(size, tx.rgb("gunmetal", 0.5))
    rects = {}
    cells = paint["layout"]
    for obj in objs:
        atlas.unwrap(obj)
        rects[obj.name] = atlas.pack_into(obj, cells[obj.name], size)
    paint["paint"](img, rects)

    out_dir.mkdir(parents=True, exist_ok=True)
    image = tx.save(img, out_dir / f"{asset_id}_basecolor.png")
    mat = material(material_name, image)
    for obj in objs:
        obj.data.materials.append(mat)


# ===========================================================================  titan chassis


def titan_chassis(out_dir):
    """Brief 01. Boxy riveted fortress torso, two tall exhaust stacks at the back, hip
    skirts, heavy round-jointed legs, broad three-toed feet. Hip at (2.20, 0, 0), knee 3.40
    below, ankle 6.80 below, sole at 7.70."""
    # Torso: the brief's box is 6.5 m tall and the stacks carry the bounding box to 9.0.
    torso = shapes.make_object("Titan_Torso", shapes.fit(shapes.combine("torso", [
        (shapes.rounded_box((5.5, 7.0, 6.4), bevel=0.42, segments=3), (0, 0, 3.2)),
        # Two tall exhaust stacks on the back (+Y), rimmed so they read as pipe.
        (shapes.cylinder(0.52, 8.9, bevel=0.16, segments=12), (-1.45, 2.45, 4.45)),
        (shapes.cylinder(0.52, 8.9, bevel=0.16, segments=12), (1.45, 2.45, 4.45)),
        (shapes.torus(0.56, 0.11, 12, 6), (-1.45, 2.45, 8.55)),
        (shapes.torus(0.56, 0.11, 12, 6), (1.45, 2.45, 8.55)),
        # Armour skirts at the hips, flaring over the thighs.
        (shapes.rounded_box((1.5, 3.4, 2.1), bevel=0.22, segments=2), (-2.0, 0, 0.55)),
        (shapes.rounded_box((1.5, 3.4, 2.1), bevel=0.22, segments=2), (2.0, 0, 0.55)),
        # The collar the main cannon sits in, recessed into the front face.
        (shapes.cylinder(1.0, 0.8, bevel=0.14, segments=14, axis="y"), (0, -3.1, 4.2)),
    ]), (5.5, 7.0, 9.0), ("centre", "centre", "min"), "Titan_Torso"))

    def leg(name, length, radius, location):
        return shapes.make_object(name, shapes.fit(shapes.combine(name, [
            (shapes.capsule(radius, length, segments=12, cap_steps=3), (0, 0, 0)),
            # Piston ram down the front of the limb, and a round armoured joint cap.
            (shapes.cylinder(radius * 0.26, length * 0.62, bevel=0.05, segments=8),
             (0, -radius * 0.74, 0)),
            (shapes.torus(radius * 0.82, radius * 0.17, 12, 6), (0, 0, length * 0.5 - radius * 0.5)),
        ]), (radius * 2, radius * 2, length), ("centre", "centre", "max"), name), location)

    upper = leg("Titan_Leg_Upper", 3.4, 0.8, (2.2, 0.0, 0.0))
    lower = leg("Titan_Leg_Lower", 3.4, 0.75, (2.2, 0.0, -3.4))

    foot = shapes.make_object("Titan_Foot", shapes.fit(shapes.combine("foot", [
        (shapes.rounded_box((2.2, 2.7, 0.88), bevel=0.18, segments=2), (0, 0.42, 0)),
        # Three blunt toes at the front.
        (shapes.rounded_box((0.62, 1.15, 0.72), bevel=0.16, segments=2), (-0.72, -1.16, -0.04)),
        (shapes.rounded_box((0.62, 1.15, 0.72), bevel=0.16, segments=2), (0.0, -1.22, -0.04)),
        (shapes.rounded_box((0.62, 1.15, 0.72), bevel=0.16, segments=2), (0.72, -1.16, -0.04)),
    ]), (2.2, 3.6, 0.9), ("centre", "centre", "max"), "Titan_Foot"), (2.2, 0.0, -6.8))

    objs = [torso, upper, lower, foot]
    cells = atlas.grid(2, 2)
    layout = {
        "Titan_Torso": cells[0],
        "Titan_Leg_Upper": cells[1],
        "Titan_Leg_Lower": cells[2],
        "Titan_Foot": cells[3],
    }

    def paint(img, r):
        # Torso: brass-and-gunmetal fortress plating, a painted teal cockpit band high on it,
        # rivets, panel seams, soot rising from the stacks.
        tx.plate(img, r["Titan_Torso"], tx.rgb("gunmetal", 1.15), seed=11)
        tx.panel_lines(img, r["Titan_Torso"], 6, 7, width=3, darken=0.52)
        tx.rivets(img, r["Titan_Torso"], spacing=46, radius=4)
        tx.accent_band(img, r["Titan_Torso"], "brass", band=(0.17, 0.20))
        tx.accent_band(img, r["Titan_Torso"], "teal", band=(0.20, 0.26))
        tx.accent_band(img, r["Titan_Torso"], "brass", band=(0.26, 0.29))
        # The player side is "clean brass and gunmetal with teal accents". Rust is the
        # raiders' colour, so the Titan gets only light staining: a first pass at 18 streaks
        # measured 36% rust against 0.5% brass, which read as a scrap raider, not the Titan.
        tx.streaks(img, r["Titan_Torso"], tx.rgb("rust", 0.75), count=5, strength=0.22, seed=5)
        tx.grime(img, r["Titan_Torso"], strength=0.30, from_top=True, seed=19)
        tx.edge_wear(img, r["Titan_Torso"], strength=0.35, inset=7)

        # Brass limbs, which is half of what the brief calls the player's scheme. A darkened
        # brass reads as rust to the palette check, so it stays near full strength.
        for part, seed in (("Titan_Leg_Upper", 23), ("Titan_Leg_Lower", 29)):
            tx.plate(img, r[part], tx.rgb("brass", 1.0), seed=seed)
            tx.panel_lines(img, r[part], 4, 6, width=3, darken=0.55)
            tx.rivets(img, r[part], spacing=40, radius=3)
            tx.accent_band(img, r[part], "teal", band=(0.70, 0.74))
            tx.streaks(img, r[part], tx.rgb("rust", 0.8), count=5, strength=0.28, seed=seed)
            tx.grime(img, r[part], strength=0.32, seed=seed + 1)
            tx.edge_wear(img, r[part], strength=0.3, inset=6)

        # The brief asks for hazard-yellow stripes on the feet and the hip skirts. Kimi's
        # batch measured hazard yellow at 0.1 to 0.3% and the stripes were not clearly
        # there; here they are painted where the brief puts them.
        tx.plate(img, r["Titan_Foot"], tx.rgb("gunmetal", 1.0), seed=31)
        tx.hazard_stripes(img, r["Titan_Foot"], pitch=26, angle=1.0, band=(0.30, 0.62))
        tx.panel_lines(img, r["Titan_Foot"], 5, 4, width=3, darken=0.5)
        tx.rivets(img, r["Titan_Foot"], spacing=36, radius=3)
        tx.grime(img, r["Titan_Foot"], strength=0.45, seed=37)
        tx.edge_wear(img, r["Titan_Foot"], strength=0.5, inset=6)

    finish(objs, "titan_chassis", 2048, {"layout": layout, "paint": paint},
           out_dir, "Titan_Mat")


# =====================================================================  autocannon


def titan_cannon_autocannon(out_dir):
    """Brief 02. Twin short heavy barrels with chunky muzzle brakes, a round ammunition drum
    on the housing side, a belt chute. Trunnion at the housing centre, barrel rear at Y=-0.60."""
    housing = shapes.make_object("Autocannon_Housing", shapes.fit(shapes.combine("housing", [
        (shapes.rounded_box((1.52, 2.4, 2.0), bevel=0.2, segments=3), (0, 0, 0)),
        # The ammunition drum, lying across the housing so its ends make the 2.2 m width.
        (shapes.cylinder(0.46, 2.2, bevel=0.1, segments=14, axis="x"), (0, 0.52, 0.28)),
        # Belt chute running down to the breech.
        (shapes.rounded_box((0.42, 0.5, 1.2), bevel=0.08, segments=1), (0.5, 0.2, -0.45)),
    ]), (2.2, 2.4, 2.0), ("centre", "centre", "centre"), "Autocannon_Housing"))

    def barrel_pair(offset):
        return [
            (shapes.cylinder(0.26, 4.4, bevel=0.05, segments=10, axis="y"), (offset, -2.2, 0)),
            # Chunky muzzle brake at the front. Its radius is kept under the pair's
            # half-separation: at 0.33 the two brakes met at exactly x = 0, and welding that
            # tangent point left an edge shared by three faces, which is non-manifold.
            (shapes.cylinder(0.30, 0.62, bevel=0.09, segments=10, axis="y"), (offset, -4.62, 0)),
        ]

    barrel = shapes.make_object("Autocannon_Barrel", shapes.fit(shapes.combine(
        "barrel",
        barrel_pair(-0.34) + barrel_pair(0.34) + [
            # The breech block the two barrels share, at the pivot end.
            (shapes.rounded_box((1.1, 0.8, 0.7), bevel=0.12, segments=2), (0, -0.4, 0)),
        ],
    ), (None, 5.0, None), ("centre", "max", "centre"), "Autocannon_Barrel"), (0.0, -0.6, 0.0))

    cells = atlas.grid(1, 2)
    layout = {"Autocannon_Housing": cells[0], "Autocannon_Barrel": cells[1]}

    def paint(img, r):
        tx.plate(img, r["Autocannon_Housing"], tx.rgb("brass", 0.85), seed=41)
        tx.panel_lines(img, r["Autocannon_Housing"], 5, 5, width=3, darken=0.5)
        tx.rivets(img, r["Autocannon_Housing"], spacing=34, radius=3)
        tx.accent_band(img, r["Autocannon_Housing"], "teal", band=(0.46, 0.5))
        tx.grime(img, r["Autocannon_Housing"], strength=0.45, seed=43)
        tx.edge_wear(img, r["Autocannon_Housing"], strength=0.4, inset=6)

        tx.plate(img, r["Autocannon_Barrel"], tx.rgb("gunmetal", 1.05), seed=47)
        tx.panel_lines(img, r["Autocannon_Barrel"], 3, 8, width=2, darken=0.55)
        # The muzzle end is open and dark inside, painted.
        tx.grime(img, r["Autocannon_Barrel"], strength=0.75, seed=53)
        tx.edge_wear(img, r["Autocannon_Barrel"], strength=0.3, inset=5)

    finish([housing, barrel], "titan_cannon_autocannon", 1024,
           {"layout": layout, "paint": paint}, out_dir, "Autocannon_Mat")


# =====================================================================  rustcrawler


def enemy_rustcrawler(out_dir):
    """Brief 10. A low six-legged crawler like a beetle made from an oil drum and junk
    plates, two pincer claws built into the front, one glowing red sensor eye. Body origin
    at the centre of its underside; the leg's origin at a hip pivot."""
    body = shapes.make_object("Rustcrawler_Body", shapes.fit(shapes.combine("body", [
        # The oil drum it is made from, lying along the lane.
        (shapes.cylinder(0.62, 2.66, bevel=0.1, segments=14, axis="y"), (0, 0.27, 0.7)),
        # The drum's end hoops. Their major radius plus tube sets the body's 1.4 m height,
        # so these two numbers are what the briefed height actually rests on.
        (shapes.torus(0.645, 0.05, 14, 6), (0, -0.5, 0.7), (math.pi / 2, 0, 0)),
        (shapes.torus(0.645, 0.05, 14, 6), (0, 1.0, 0.7), (math.pi / 2, 0, 0)),
        # Junk plates bolted down the sides, which make the briefed 1.8 m width.
        (shapes.rounded_box((1.8, 2.0, 0.7), bevel=0.1, segments=1), (0, 0.2, 0.46)),
        # Two pincer claws built into the front, inside the briefed 3.2 m length.
        (shapes.rounded_box((0.34, 1.0, 0.3), bevel=0.08, segments=1), (-0.52, -1.1, 0.72)),
        (shapes.rounded_box((0.34, 1.0, 0.3), bevel=0.08, segments=1), (0.52, -1.1, 0.72)),
        # Sensor eye housing.
        (shapes.cylinder(0.2, 0.3, bevel=0.05, segments=8, axis="y"), (0, -1.35, 1.0)),
    ]), (1.8, 3.2, 1.4), ("centre", "centre", "min"), "Rustcrawler_Body"))

    leg = shapes.make_object("Rustcrawler_Leg", shapes.fit(shapes.combine("leg", [
        (shapes.capsule(0.1, 0.78, segments=5, cap_steps=1, axis="x"), (0.34, 0, 0)),
        (shapes.capsule(0.085, 0.72, segments=5, cap_steps=1), (0.7, 0, -0.3)),
    ]), (None, None, None), ("min", "centre", "max"), "Rustcrawler_Leg"), (0.8, 0.0, 0.2))

    cells = atlas.grid(1, 2)
    layout = {"Rustcrawler_Body": (0.0, 0.0, 0.78, 1.0),
              "Rustcrawler_Leg": (0.78, 0.0, 1.0, 1.0)}

    def paint(img, r):
        # Raider side: patched rust plates, oil black, signal red accents.
        tx.plate(img, r["Rustcrawler_Body"], tx.rgb("rust", 0.95), shade_variation=0.22, seed=61)
        tx.panel_lines(img, r["Rustcrawler_Body"], 7, 5, width=3, darken=0.42)
        tx.rivets(img, r["Rustcrawler_Body"], spacing=30, radius=3)
        tx.accent_band(img, r["Rustcrawler_Body"], "signal_red", band=(0.55, 0.60))
        tx.streaks(img, r["Rustcrawler_Body"], tx.rgb("oil", 1.0), count=22, strength=0.55, seed=67)
        tx.grime(img, r["Rustcrawler_Body"], strength=0.6, seed=71)
        tx.edge_wear(img, r["Rustcrawler_Body"], strength=0.45, inset=6)

        tx.plate(img, r["Rustcrawler_Leg"], tx.rgb("oil", 1.6), seed=73)
        tx.grime(img, r["Rustcrawler_Leg"], strength=0.5, seed=79)

    finish([body, leg], "enemy_rustcrawler", 1024,
           {"layout": layout, "paint": paint}, out_dir, "Rustcrawler_Mat")


# =====================================================================  scrap pickups


def pickup_scrap(out_dir):
    """Brief 27. A bent gear with bolts, a tied bundle of pipe offcuts, a crumpled brass
    plate with a hazard stripe. Each about 0.8 m in every direction, origin at its centre,
    and at most 120 triangles each, which is what keeps these shapes coarse."""
    # A bent gear: the ring tilted out of flat, with two bolts that carry the lump out to
    # the briefed 0.8 m in the two axes a flat ring cannot reach on its own.
    gear = shapes.make_object("Scrap_A", shapes.fit(shapes.combine("gear", [
        (shapes.torus(0.28, 0.1, 10, 4), (0, 0, 0), (math.radians(60), 0, 0)),
        (shapes.rounded_box((0.18, 0.18, 0.18), bevel=0.0, segments=0), (0.31, 0.31, 0.31)),
        (shapes.rounded_box((0.18, 0.18, 0.18), bevel=0.0, segments=0), (-0.31, -0.31, -0.31)),
    ]), (0.8, 0.8, 0.8), ("centre",) * 3, "Scrap_A"))
    pipes = shapes.make_object("Scrap_B", shapes.fit(shapes.combine("pipes", [
        (shapes.cylinder(0.14, 0.78, bevel=0.0, segments=6, axis="y"), (-0.26, 0, -0.26)),
        (shapes.cylinder(0.14, 0.78, bevel=0.0, segments=6, axis="y"), (0.26, 0, -0.26)),
        (shapes.cylinder(0.14, 0.78, bevel=0.0, segments=6, axis="y"), (0, 0, 0.26)),
    ]), (0.8, 0.8, 0.8), ("centre",) * 3, "Scrap_B"))
    plate_ = shapes.make_object("Scrap_C", shapes.fit(shapes.combine("plate", [
        (shapes.rounded_box((0.78, 0.62, 0.24), bevel=0.0, segments=0), (0.0, 0.08, 0.28)),
        (shapes.rounded_box((0.56, 0.78, 0.24), bevel=0.0, segments=0), (0.06, 0.0, 0.0)),
        (shapes.rounded_box((0.7, 0.58, 0.24), bevel=0.0, segments=0), (-0.04, -0.08, -0.28)),
    ]), (0.8, 0.8, 0.8), ("centre",) * 3, "Scrap_C"))

    cells = atlas.grid(2, 2)
    layout = {"Scrap_A": cells[0], "Scrap_B": cells[1], "Scrap_C": cells[2]}

    def paint(img, r):
        # Bright and shiny-looking so they read as reward, with a brass glint.
        for part, seed in (("Scrap_A", 83), ("Scrap_B", 89), ("Scrap_C", 97)):
            tx.plate(img, r[part], tx.rgb("brass", 1.2), shade_variation=0.18, seed=seed)
            tx.rivets(img, r[part], spacing=16, radius=2, margin=6, light=1.7, dark=0.6)
            tx.grime(img, r[part], strength=0.28, seed=seed + 1)
        tx.hazard_stripes(img, r["Scrap_C"], pitch=10, angle=1.0, band=(0.42, 0.62))

    finish([gear, pipes, plate_], "pickup_scrap", 256,
           {"layout": layout, "paint": paint}, out_dir, "Scrap_Mat")


# =====================================================================  ground


def env_rust_flats_ground(out_dir):
    """Brief 28. 20 m along X, 12 m deep, walking surface at Z = 0 staying within 0.15 m of
    it across the walkable band, front lip broken down to Z = -3. Tiles seamlessly along X,
    so the height function is periodic over the tile length and the two ends match exactly."""
    import bmesh

    length, depth, drop, floor = 20.0, 12.0, 2.7, -3.0
    cols, rows = 20, 10
    bm = bmesh.new()
    grid = []
    for j in range(rows + 1):
        y = -depth / 2 + depth * j / rows
        row = []
        for i in range(cols + 1):
            # i == cols repeats i == 0's height, which is what makes the seam invisible.
            phase = 2.0 * math.pi * (i % cols) / cols
            walkable = abs(y) <= 3.0
            amp = 0.12 if walkable else 0.30
            wave = math.sin(phase * 2) * 0.6 + math.sin(phase * 3 + 1.1) * 0.4
            # The unevenness dips below the walking surface rather than rising above it, so
            # Z = 0 is the top of the tile and the bounding box is exactly the briefed 3.0 m
            # from the walking surface down to the lip. The walkable band stays within the
            # 0.15 m the brief allows.
            z = -amp * (0.5 + 0.5 * wave)
            if y < -3.0:
                # The broken cliff-like lip towards the camera, landing exactly on -3.0.
                t = (-y - 3.0) / (depth / 2 - 3.0)
                z -= (drop + z) * (t ** 1.6)
            row.append(bm.verts.new((-length / 2 + length * i / cols, y, z)))
        grid.append(row)
    for j in range(rows):
        for i in range(cols):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    shapes.solidify_surface(bm, floor)
    tile = shapes.make_object("Ground_Tile", shapes.fit(
        bm, (20.0, 12.0, 3.0), ("centre", "centre", "max"), "Ground_Tile"), smooth_angle=50.0)

    layout = {"Ground_Tile": (0.0, 0.0, 1.0, 1.0)}

    def paint(img, r):
        # Cracked orange-brown desert of rusted plates and sand.
        tx.plate(img, r["Ground_Tile"], tx.rgb("rust", 0.85), shade_variation=0.3, seed=101)
        tx.panel_lines(img, r["Ground_Tile"], 9, 9, width=2, darken=0.62)
        tx.streaks(img, r["Ground_Tile"], tx.rgb("ash", 0.9), count=40, strength=0.35, seed=103)
        tx.grime(img, r["Ground_Tile"], strength=0.3, seed=107)

    finish([tile], "env_rust_flats_ground", 1024,
           {"layout": layout, "paint": paint}, out_dir, "Ground_Mat")


ASSETS = {
    "titan_chassis": titan_chassis,
    "titan_cannon_autocannon": titan_cannon_autocannon,
    "enemy_rustcrawler": enemy_rustcrawler,
    "pickup_scrap": pickup_scrap,
    "env_rust_flats_ground": env_rust_flats_ground,
}


# =====================================================================  export


def export(asset_id, out_root):
    folder = out_root / asset_id
    folder.mkdir(parents=True, exist_ok=True)
    blend = folder / f"{asset_id}.blend"
    fbx = folder / f"{asset_id}.fbx"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
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
        embed_textures=False,
    )
    return blend, fbx


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--copy-fbx-to", default=None)
    parser.add_argument("--only", nargs="*", default=None)
    args = parser.parse_args(argv)

    out_root = pathlib.Path(args.out).resolve()
    for asset_id in (args.only or list(ASSETS)):
        build = ASSETS.get(asset_id)
        if build is None:
            raise SystemExit(f"no recipe for {asset_id!r}; known: {', '.join(ASSETS)}")
        bpy.ops.wm.read_factory_settings(use_empty=True)
        folder = out_root / asset_id
        build(folder)
        blend, fbx = export(asset_id, out_root)
        if args.copy_fbx_to:
            dest = pathlib.Path(args.copy_fbx_to).resolve()
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(fbx, dest / fbx.name)
            for png in sorted(folder.glob("*.png")):
                shutil.copy2(png, dest / png.name)
        counts = ", ".join(
            f"{o.name} {shapes.triangles(o)}"
            for o in sorted(bpy.data.objects, key=lambda o: o.name) if o.type == "MESH")
        print(f"  built {asset_id:26} {counts}")

    print(f"\n  written to {out_root}")


if __name__ == "__main__":
    main()
