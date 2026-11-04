"""Checks one Kimi model delivery against its brief. Measures; never modifies.

    blender --background --factory-startup --disable-autoexec \
            --python tools/model-check/check_model.py -- \
            --input MODEL.blend --asset-id titan_chassis [--report OUT.json]

Exit codes: 0 everything passed (or was waived), 1 at least one check failed,
2 the model could not be read at all.

The limits come from standards.json, transcribed from docs/unity/KIMI_MODEL_PROMPTS.
Nothing is ever moved, rescaled or reduced to make a model pass: a model that misses its
brief goes back to the artist. Only the owner can accept a failure, as a named waiver in
standards.json.
"""
import argparse
import json
import math
import pathlib
import sys

import bpy
from mathutils import Vector

AXES = ("x", "y", "z")
HERE = pathlib.Path(__file__).resolve().parent


# ----------------------------------------------------------------- measuring

def triangle_count(mesh):
    """Triangles after triangulation, from topology alone so it needs no Blender API that moves."""
    return sum(len(polygon.vertices) - 2 for polygon in mesh.polygons)


def local_bounds(obj):
    """The object's bounding box relative to its own origin, in world orientation.

    This is the measurement the briefs are written against: a part's size, and where its
    origin sits inside it, which is the pivot.
    """
    matrix = obj.matrix_world
    origin = matrix.translation
    points = [matrix @ v.co - origin for v in obj.data.vertices]
    if not points:
        return None
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return {"min": list(low), "max": list(high), "size": list(high - low)}


def signed_volume(obj):
    """Six times the signed volume. Negative means the normals point inward."""
    total = 0.0
    for polygon in obj.data.polygons:
        verts = [obj.data.vertices[i].co for i in polygon.vertices]
        for i in range(1, len(verts) - 1):
            total += verts[0].dot(verts[i].cross(verts[i + 1]))
    return total / 6.0


def mesh_health(obj):
    """Problems the briefs call out: open meshes, zero-area faces, loose and doubled geometry."""
    mesh = obj.data

    faces_per_edge = {}
    for polygon in mesh.polygons:
        for key in polygon.edge_keys:
            faces_per_edge[key] = faces_per_edge.get(key, 0) + 1
    boundary = sum(1 for n in faces_per_edge.values() if n == 1)
    non_manifold = sum(1 for n in faces_per_edge.values() if n > 2)

    zero_area = sum(1 for p in mesh.polygons if p.area < 1e-9)

    used = set()
    for polygon in mesh.polygons:
        used.update(polygon.vertices)
    loose_verts = len(mesh.vertices) - len(used)

    # Vertices sharing a position, rounded to a tenth of a millimetre.
    buckets = {}
    for v in mesh.vertices:
        key = (round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4))
        buckets[key] = buckets.get(key, 0) + 1
    doubled = sum(n - 1 for n in buckets.values() if n > 1)

    return {
        "vertices": len(mesh.vertices),
        "polygons": len(mesh.polygons),
        "triangles": triangle_count(mesh),
        "boundary_edges": boundary,
        "non_manifold_edges": non_manifold,
        "closed": boundary == 0 and non_manifold == 0,
        "zero_area_faces": zero_area,
        "loose_vertices": loose_verts,
        "doubled_vertices": doubled,
        "uv_layers": len(mesh.uv_layers),
        "signed_volume": round(signed_volume(obj), 4),
        "material_slots": [s.material.name if s.material else None for s in obj.material_slots],
    }


def transform_state(obj):
    scale = list(obj.scale)
    rotation = [math.degrees(a) for a in obj.rotation_euler]
    return {
        "location": [round(v, 4) for v in obj.location],
        "scale": [round(v, 6) for v in scale],
        "rotation_deg": [round(v, 4) for v in rotation],
        "applied": all(abs(s - 1.0) < 1e-4 for s in scale) and all(abs(r) < 1e-3 for r in rotation),
        "parent": obj.parent.name if obj.parent else None,
    }


# ----------------------------------------------------------------- checking

class Report:
    def __init__(self, asset_id, waived):
        self.asset_id = asset_id
        self.waived = set(waived)
        self.checks = []

    def add(self, name, passed, detail):
        waived = (not passed) and name in self.waived
        self.checks.append({
            "check": name,
            "passed": bool(passed),
            "waived": waived,
            "detail": detail,
        })

    @property
    def failures(self):
        return [c for c in self.checks if not c["passed"] and not c["waived"]]

    @property
    def waived_failures(self):
        return [c for c in self.checks if not c["passed"] and c["waived"]]


def check_object(report, obj, spec, standards):
    label = obj.name
    bounds = local_bounds(obj)
    if bounds is None:
        report.add(f"{label} has geometry", False, "the mesh has no vertices")
        return None

    health = mesh_health(obj)
    transform = transform_state(obj)

    report.add(f"{label} triangles", health["triangles"] <= spec["max_tris"],
               f"{health['triangles']} of at most {spec['max_tris']}")

    report.add(f"{label} transforms applied", transform["applied"],
               f"scale {transform['scale']}, rotation {transform['rotation_deg']} deg")

    default_tol = standards["default_tolerance"]
    loose_tol = standards["loose_tolerance"]
    loose_axes = set(spec.get("loose_axes", []))

    for index, axis in enumerate(AXES):
        expected = (spec.get("size") or [None, None, None])[index]
        if expected is None:
            continue
        actual = bounds["size"][index]
        tol = loose_tol if axis in loose_axes else spec.get("tolerance", default_tol)
        off = (actual - expected) / expected
        report.add(f"{label} size {axis}", abs(off) <= tol,
                   f"{actual:.2f} m, brief {expected} m, {off:+.1%}"
                   + (f" (tolerance {tol:.0%}, 'about' in the brief)" if axis in loose_axes
                      else f" (tolerance {tol:.0%})"))

    # Where the origin sits inside the part: this is the pivot the game rotates about.
    allowance = standards["overlap_allowance_m"]
    for axis, where in (spec.get("origin_at") or {}).items():
        if where is None:
            continue
        index = AXES.index(axis)
        low, high = bounds["min"][index], bounds["max"][index]
        if where == "min":
            offset, expected_text = low, "at the low end"
        elif where == "max":
            offset, expected_text = high, "at the high end"
        elif where == "centre":
            offset, expected_text = (low + high) / 2.0, "midway"
        else:
            raise ValueError(f"unknown origin_at '{where}'")
        report.add(f"{label} origin {axis}", abs(offset) <= allowance,
                   f"origin sits {offset:+.2f} m from {expected_text} of the part "
                   f"(bbox {low:+.2f} to {high:+.2f}; up to {allowance} m allowed for joint overlap)")

    thinnest = spec.get("min_thickness_m")
    if thinnest is not None:
        across = min(bounds["size"][AXES.index("x")], bounds["size"][AXES.index("z")])
        report.add(f"{label} thickness", across >= thinnest,
                   f"{across:.2f} m across, brief needs at least {thinnest} m")

    report.add(f"{label} no zero-area faces", health["zero_area_faces"] == 0,
               f"{health['zero_area_faces']} found")
    report.add(f"{label} no loose vertices", health["loose_vertices"] == 0,
               f"{health['loose_vertices']} found")
    report.add(f"{label} no doubled vertices", health["doubled_vertices"] == 0,
               f"{health['doubled_vertices']} vertices share a position with another")
    report.add(f"{label} has UVs", health["uv_layers"] >= 1,
               f"{health['uv_layers']} UV layers")

    if health["closed"]:
        report.add(f"{label} normals face outward", health["signed_volume"] > 0,
                   f"signed volume {health['signed_volume']}")
    else:
        report.add(f"{label} mesh is closed", False,
                   f"{health['boundary_edges']} open edges, "
                   f"{health['non_manifold_edges']} edges shared by more than two faces")

    return {"bounds": {k: [round(v, 4) for v in val] for k, val in bounds.items()},
            "health": health, "transform": transform}


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--standards", default=str(HERE / "standards.json"))
    parser.add_argument("--report")
    args = parser.parse_args(argv)

    standards = json.loads(pathlib.Path(args.standards).read_text())
    if args.asset_id not in standards["assets"]:
        print(f"No standards for asset id '{args.asset_id}'.", file=sys.stderr)
        return 2
    spec = standards["assets"][args.asset_id]

    bpy.ops.wm.open_mainfile(filepath=str(pathlib.Path(args.input).resolve()))

    waived = (spec.get("waivers") or {}).get("checks", [])
    report = Report(args.asset_id, waived)

    objects = list(bpy.data.objects)
    meshes = {o.name: o for o in objects if o.type == "MESH"}
    others = {o.name: o.type for o in objects if o.type != "MESH"}

    expected_names = set(spec["objects"])
    report.add("exactly the objects the brief names", set(meshes) == expected_names,
               f"found {sorted(meshes)}, brief names {sorted(expected_names)}")

    # The briefs forbid rigs, cameras, lights, ground planes and display stands.
    report.add("nothing but meshes in the file", not others,
               f"also found {others}" if others else "no armatures, cameras, lights or empties")

    materials = sorted({m.name for o in meshes.values() for m in o.data.materials if m})
    report.add("material count", len(materials) <= spec["max_materials"],
               f"{len(materials)} ({materials}), brief allows {spec['max_materials']}")
    if spec.get("material_names"):
        report.add("material named as the brief says", materials == sorted(spec["material_names"]),
                   f"{materials}, brief says {sorted(spec['material_names'])}")

    images = []
    for image in bpy.data.images:
        if image.size[0] == 0 and image.size[1] == 0:
            continue
        width, height = image.size[0], image.size[1]
        images.append({"name": image.name, "width": width, "height": height,
                       "packed": bool(image.packed_file)})
        pot = width > 0 and height > 0 and (width & (width - 1)) == 0 and (height & (height - 1)) == 0
        report.add(f"texture {image.name} is power-of-two", pot, f"{width}x{height}")
        report.add(f"texture {image.name} within the size the brief allows",
                   max(width, height) <= spec["max_texture_px"],
                   f"{width}x{height}, brief allows up to {spec['max_texture_px']}px")

    details = {}
    for name, obj_spec in spec["objects"].items():
        obj = meshes.get(name)
        if obj is None:
            report.add(f"{name} present", False, "no mesh object with this name")
            continue
        details[name] = check_object(report, obj, obj_spec, standards)

    # Pivot spacing: where each part actually sits in the assembled file. This is what proves
    # a hip-to-knee distance, which no single part's bounding box can show.
    for socket, want in (spec.get("sockets") or {}).items():
        obj = meshes.get(want["part"])
        if obj is None:
            continue
        actual = [abs(v) if i == 0 else v for i, v in enumerate(obj.matrix_world.translation)]
        expected = want["at"]
        worst = max(abs(a - e) for a, e in zip(actual, expected))
        report.add(f"socket {socket} position", worst <= standards["overlap_allowance_m"],
                   f"{want['part']} origin at "
                   f"({actual[0]:+.2f}, {actual[1]:+.2f}, {actual[2]:+.2f}), "
                   f"brief says ({expected[0]:+.2f}, {expected[1]:+.2f}, {expected[2]:+.2f}); "
                   f"worst axis off by {worst:.2f} m")

    # Hip pivot to sole. Deliberately not the overall bounding height: the brief's standing
    # height is measured to the torso roof, while a bounding box also takes in the exhaust
    # stacks, so comparing the two reports a model as oversized when it is exactly right.
    if spec.get("hip_to_sole_m"):
        zs = []
        for obj in meshes.values():
            matrix = obj.matrix_world
            zs.extend((matrix @ v.co).z for v in obj.data.vertices)
        if zs:
            span = -min(zs)
            top = max(zs)
            expected = spec["hip_to_sole_m"]
            off = (span - expected) / expected
            report.add("leg span, hip pivot to sole",
                       abs(off) <= standards["default_tolerance"],
                       f"{span:.2f} m, brief says {expected} m, {off:+.1%}"
                       f"  (top of model {top:.2f} m above the hip; whole model {span + top:.2f} m)")

    result = {
        "asset": args.asset_id,
        "brief": spec.get("brief"),
        "input": str(pathlib.Path(args.input).resolve()),
        "blender": bpy.app.version_string,
        "objects": details,
        "materials": materials,
        "images": images,
        "non_mesh_objects": others,
        "checks": report.checks,
        "failed": len(report.failures),
        "waived": len(report.waived_failures),
        "passed": sum(1 for c in report.checks if c["passed"]),
    }

    print(f"\n==== {args.asset_id}  ({spec.get('brief')}) ====")
    for c in report.checks:
        mark = "PASS" if c["passed"] else ("WAIVED" if c["waived"] else "FAIL")
        print(f"  {mark:6} {c['check']}: {c['detail']}")
    print(f"\n  {result['passed']} passed, {result['failed']} failed, {result['waived']} waived")

    if args.report:
        pathlib.Path(args.report).write_text(json.dumps(result, indent=2))
        print(f"  report: {args.report}")

    return 1 if report.failures else 0


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    try:
        sys.exit(main(argv))
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(2)
