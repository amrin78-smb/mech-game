"""Curved, chunky shapes for the Scrap Titan model pipeline.

The approach is the one that worked in littleburgerworld on this machine
(`Assets/_LittleBurgerWorld/Scripts/Core/MeshFactory.cs`): rounded boxes, lathed profiles,
capsules and tori, combined into a part. It is ported into Blender rather than C# for one
reason: the output is a .blend and a .fbx, so it goes through tools/model-check against its
brief before anything imports it, exactly as a Kimi delivery does.

Everything is in the briefs' convention: metres, Z up, the model's front facing -Y, its left
facing +X. A part is built as a list of shapes with local transforms, then fitted so its
bounding box is exactly what the brief states and its origin sits where the brief puts it.
"""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# How far a fit may stretch a shape before it is a distortion rather than a correction.
MAX_FIT_CORRECTION = 0.05


# ------------------------------------------------------------------ primitive shapes


def rounded_box(size, bevel=0.12, segments=3):
    """A box with softened edges. The briefs ask for exactly this: 'softened bevels on big
    edges'. `bevel` is in metres and is clamped so it cannot eat the box."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    limit = min(size) * 0.45
    width = min(bevel, limit)
    if width > 1e-4 and segments > 0:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            offset=width,
            offset_type="OFFSET",
            segments=segments,
            profile=0.5,
            affect="EDGES",
        )
    return bm


def lathe(profile, segments=16, arc=1.0):
    """Revolves a profile around the Z axis. `profile` is (radius, z) pairs, bottom to top; a
    radius of 0 at an end closes the shape. This is the shape that makes drums, collars,
    tanks, pistons and exhaust stacks read as turned metal rather than as boxes."""
    bm = bmesh.new()
    rows = []
    for radius, z in profile:
        if abs(radius) < 1e-6:
            rows.append([bm.verts.new((0.0, 0.0, z))])
            continue
        ring = []
        for i in range(segments):
            a = arc * 2.0 * math.pi * i / segments
            ring.append(bm.verts.new((radius * math.cos(a), radius * math.sin(a), z)))
        rows.append(ring)

    for lower, upper in zip(rows, rows[1:]):
        if len(lower) == 1 and len(upper) == 1:
            continue
        if len(lower) == 1:
            for i in range(len(upper)):
                bm.faces.new((lower[0], upper[i], upper[(i + 1) % len(upper)]))
            continue
        if len(upper) == 1:
            for i in range(len(lower)):
                bm.faces.new((lower[(i + 1) % len(lower)], lower[i], upper[0]))
            continue
        for i in range(len(lower)):
            j = (i + 1) % len(lower)
            bm.faces.new((lower[i], lower[j], upper[j], upper[i]))

    # Cap a profile that did not close itself, so the mesh stays solid.
    for row in (rows[0], rows[-1]):
        if len(row) > 2:
            bm.faces.new(row if row is rows[-1] else list(reversed(row)))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def cylinder(radius, length, bevel=0.06, segments=14, axis="z"):
    """A drum. `bevel` rounds both rims so it catches light like turned metal."""
    r, b = radius, min(bevel, radius * 0.45, length * 0.45)
    half = length / 2.0
    if b <= 1e-4:
        # Without this the four rows below collapse into two pairs at the same height, which
        # makes zero-area faces and doubled vertices: both of them checker failures.
        profile = [(r, -half), (r, half)]
    else:
        profile = [(r - b, -half), (r, -half + b), (r, half - b), (r - b, half)]
    bm = lathe(profile, segments=segments)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    if axis == "y":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                         matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
    elif axis == "x":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                         matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
    return bm


def capsule(radius, length, segments=12, cap_steps=3, axis="z"):
    """A rounded bar: a leg segment, a piston, a barrel sleeve."""
    straight = max(length - 2.0 * radius, 0.0)
    half = straight / 2.0
    profile = []
    for i in range(cap_steps + 1):
        a = (math.pi / 2) * i / cap_steps
        profile.append((radius * math.sin(a), -half - radius * math.cos(a)))
    for i in range(cap_steps + 1):
        a = (math.pi / 2) * i / cap_steps
        profile.append((radius * math.cos(a), half + radius * math.sin(a)))
    bm = lathe(profile, segments=segments)
    if axis == "y":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                         matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
    elif axis == "x":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                         matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
    return bm


def torus(major, minor, major_segments=16, minor_segments=8):
    """A coil ring, a collar band, a track roller."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=0.0001)
    bm.clear()
    rings = []
    for i in range(major_segments):
        a = 2.0 * math.pi * i / major_segments
        centre = Vector((major * math.cos(a), major * math.sin(a), 0.0))
        out = Vector((math.cos(a), math.sin(a), 0.0))
        ring = []
        for j in range(minor_segments):
            b = 2.0 * math.pi * j / minor_segments
            p = centre + out * (minor * math.cos(b)) + Vector((0, 0, minor * math.sin(b)))
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for i in range(major_segments):
        a, b = rings[i], rings[(i + 1) % major_segments]
        for j in range(minor_segments):
            k = (j + 1) % minor_segments
            bm.faces.new((a[j], a[k], b[k], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


# ------------------------------------------------------------------ assembling a part


def _span(size, rule):
    """Where a part's bounding box sits along one axis, given the brief's origin rule."""
    if rule == "centre":
        return -size / 2.0, size / 2.0
    if rule == "min":
        return 0.0, size
    if rule == "max":
        return -size, 0.0
    raise ValueError(f"unknown origin rule {rule!r}")


def combine(name, pieces):
    """One bmesh from (shape, translation) or (shape, translation, rotation_euler) pieces."""
    out = bmesh.new()
    for piece in pieces:
        shape, where = piece[0], Vector(piece[1])
        rotation = piece[2] if len(piece) > 2 else None
        if rotation is not None:
            bmesh.ops.rotate(shape, verts=shape.verts, cent=(0, 0, 0),
                             matrix=Euler(rotation).to_matrix())
        bmesh.ops.translate(shape, verts=shape.verts, vec=where)
        mesh = bpy.data.meshes.new(f"_tmp_{name}")
        shape.to_mesh(mesh)
        shape.free()
        out.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    return out


def bounds(bm):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for v in bm.verts:
        for i in range(3):
            lo[i] = min(lo[i], v.co[i])
            hi[i] = max(hi[i], v.co[i])
    return lo, hi


def fit(bm, size, origin, part_name=""):
    """Puts the part exactly where its brief says: bounding box `size`, origin per `origin`.

    Shapes are built at the briefed size already, so this is a correction of a few
    millimetres from bevels and rounding, not a resize. A correction larger than
    MAX_FIT_CORRECTION means the shape was built wrong and is raised rather than stretched,
    because silently stretching a part to pass its own size check is the one thing the model
    rules forbid.
    """
    lo, hi = bounds(bm)
    for axis in range(3):
        want = size[axis]
        if want is None:
            continue
        have = hi[axis] - lo[axis]
        if have < 1e-6:
            raise ValueError(f"{part_name}: zero extent on axis {axis}")
        factor = want / have
        if abs(factor - 1.0) > MAX_FIT_CORRECTION:
            raise ValueError(
                f"{part_name}: axis {axis} was built {have:.3f} m but the brief says "
                f"{want:.3f} m, a {abs(factor - 1.0):.1%} correction. Build it at the briefed "
                f"size; fit() will not stretch it that far."
            )
        for v in bm.verts:
            v.co[axis] *= factor

    lo, hi = bounds(bm)
    for axis in range(3):
        want = size[axis]
        if want is None:
            # No briefed extent on this axis, so honour the origin rule against what is there.
            want = hi[axis] - lo[axis]
        target_lo, _ = _span(want, origin[axis])
        shift = target_lo - lo[axis]
        for v in bm.verts:
            v.co[axis] += shift
    return bm


def solidify_surface(bm, floor):
    """Closes an open surface by dropping its boundary to `floor` and capping it.

    The briefs forbid thin one-sided panels and the checker requires a closed mesh. The
    ground's underside is never seen, so the skirt and the cap are as cheap as they can be:
    one quad per boundary edge and one triangulated cap.
    """
    boundary = [e for e in bm.edges if len(e.link_faces) == 1]
    if not boundary:
        return bm
    result = bmesh.ops.extrude_edge_only(bm, edges=boundary)
    new_verts = [v for v in result["geom"] if isinstance(v, bmesh.types.BMVert)]
    for v in new_verts:
        v.co.z = floor
    hole = [e for e in bm.edges if len(e.link_faces) == 1]
    bmesh.ops.holes_fill(bm, edges=hole)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def make_object(name, bm, location=(0.0, 0.0, 0.0), smooth_angle=35.0):
    """Turns a finished bmesh into a scene object with its origin at (0,0,0) locally."""
    # Shapes are combined by position, so two that meet exactly leave a pair of vertices in
    # the same place. Welding them is what the checker's "no doubled vertices" asks for.
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate()
    # Shade smooth with an angle split, so a drum is round and a panel edge stays crisp.
    mesh.shade_smooth()
    mesh.set_sharp_from_angle(angle=math.radians(smooth_angle))
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return obj


def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)
