# Model log

One entry per delivery from Kimi. Records what arrived, what the checker measured, and what
the owner decided. A model is never edited to make it pass, and a failed check only becomes
acceptable as a named waiver in `tools/model-check/standards.json`, which carries the
reason and the date.

Run the checker with:

```
tools/model-check/check-all.sh <dir-of-model-folders> [asset-id ...]
```

It needs Blender 5.2.3, installed at `~/.local/bin/blender`. Kimi authors in 5.2, and an
older Blender will not open the sources.

## 2026-11-04: batch 1 — `titan_chassis`, `titan_cannon_autocannon`, `titan_cannon_acid`

Delivered as `Kimi_Agent_Scrap Titan 3D Models.zip`: .blend, .fbx, .glb, a texture folder
and side, front, three-quarter and exploded previews for each. `titan_cannon_acid` is a
Phase 3 model that arrived ahead of the Phase 2 set.

**121 checks passed, 15 failed, all 15 waived by the owner on 2026-11-04.**

What the checker confirmed:

| | |
|---|---|
| Pivots | Every socket exact to the centimetre: hip, knee and ankle at (2.20, 0, 0), (2.20, 0, −3.40), (2.20, 0, −6.80); both cannon barrels at (0, −0.60, 0) |
| Leg span | Hip pivot to sole 7.70 m, exactly as briefed; exhaust stacks exactly 9.00 m above the hip |
| Triangles | All well inside budget: torso 1824/3500, thigh 440/900, shin 368/900, foot 352/500, autocannon housing 516/900 and barrel 552/600, acid housing 660/900 and barrel 412/500 |
| Materials | One each, named as the briefs require: `Titan_Mat`, `Autocannon_Mat`, `Acid_Mat` |
| Textures | Exactly the briefed power-of-two sizes: 2048 for the chassis, 1024 for the cannons |
| Meshes | Transforms applied, closed, normals outward, UVs present, no zero-area faces, no loose vertices |
| Emissive | `#54C8C0`, the briefs' player teal `#2F8F8A` brightened, which is right for an emissive |

What was waived, and what settles it in Phase 1:

- **The legs run about 45% longer than their briefed pivot spacing** (thigh 5.10 m against
  3.4 m, shin 4.86 m against 3.4 m), as large drum ends overlapping each joint. The briefs
  require that overlap; what measurement cannot settle is whether this much of it scissors
  when the knee bends through its 0 to 45 degrees. **Watch the knee and hip when the Titan
  walks.**
- **The cannon housings are wider than their briefed block** (acid 3.62 m and autocannon
  2.80 m against "about 2.2 m"), because a bounding box also takes in the tanks and the
  ammunition drum the briefs ask for but do not exclude from the dimension. **Watch whether
  the cannon reads at phone size and sits properly in the Titan's 2.0 m collar.**
- **The torso measures 7.74 m front-to-back against 7.0 m**, which is the exhaust stacks:
  the brief excludes them from the height but not the length. **Watch the silhouette.**
- **The torso hangs 0.44 m below the hip axle**, which is the armour skirts the brief asks
  for. **Watch whether the skirts clip the thighs as they swing.**
- **`Autocannon_Barrel` has two vertices sharing a position.** Harmless and a one-click
  merge, but the delivery is not edited in place; it is left for the next revision.

Not settled by this check, and deliberately not called yet: the art. The texture measures
about 22% gunmetal, 7 to 16% brass and 3% rust, with hazard yellow at 0.1 to 0.3%, and the
briefs ask for hazard-yellow stripes on the feet and hip skirts that are not obviously
there. The design also reads plainer than the briefs describe. That is judged from frames
of the running game under our own lighting, not from Kimi's renders, so it waits for
Phase 1.

A correction worth keeping: the first run of the checker reported the Titan as 19% too
tall. It was not. The briefs' 14 m standing height is the torso roof, while a bounding box
also takes in the stacks, and 16.7 m is the briefs' own arithmetic. The check now measures
hip pivot to sole.
