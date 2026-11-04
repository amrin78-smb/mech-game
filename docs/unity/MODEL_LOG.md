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

## 2026-11-04: batch 2 — every Titan weapon

Delivered as `Kimi_Agent_Scrap Titan 二批.zip`. Seven model folders, but three of them —
`titan_chassis`, `titan_cannon_autocannon` and `titan_cannon_acid` — are byte-identical to
batch 1 (SHA-256 compared on the .blend), so they were carried along, not revised. The two
vertices sharing a position in `Autocannon_Barrel` are therefore still there.

Four are new: `titan_cannon_railgun`, `titan_cannon_scattergun`, `titan_turret_gatling` and
`titan_turret_flak` (briefs 04 to 07). With these, every weapon the game has a model brief
for is delivered: four main cannons and both turrets.

**145 checks passed, 11 failed, 0 waived so far.** Awaiting the owner's decision on the 11.

Two of the four are Phase 3 models (railgun, scattergun) and the flak turret is Phase 3 as
well; only the Gatling Pod is needed for Phase 2.

### What the checker confirmed

| | |
|---|---|
| Pivots | Every socket exact to the centimetre. Railgun and scattergun barrels at (0, −0.60, 0); the Gatling gun at Z = 0.80 and its barrel cluster at (0, −1.00, 1.30); the flak gun at Z = 0.70 |
| Barrel lengths | Railgun 8.00 m, scattergun 3.80 m, both exactly as briefed |
| Assembled Gatling | Pod plus barrels 2.60 m along −Y, exactly the brief's figure |
| Triangles | All inside budget: railgun 468/800 and 592/700, scattergun 324/900 and 536/700, Gatling 228/250, 360/450 and 236/250, flak 228/250 and 568/600 |
| Materials | One each, named as briefed: `Railgun_Mat`, `Scattergun_Mat`, `Gatling_Mat`, `Flak_Mat` |
| Textures | Exactly the briefed sizes: 1024 for the two cannons, 512 for the two turrets |
| Meshes | Transforms applied, closed, normals outward, UVs present, no zero-area faces, no loose or doubled vertices anywhere in the four |
| Silhouettes | Clearly distinct, which the cannon briefs require: barrels of 8.00, 5.00, 3.80 and 3.60 m, the scattergun's a 3.02 m wide fan |
| Palette | Within half a percentage point of batch 1 on every colour, so the house look is consistent |

### Triangle budget

The assembled Titan comes to about 7,700 triangles: torso 1,824, legs and feet 2,320 for
the pair, a main cannon about 1,060, and three Gatling pods 2,472. The plan's budget allows
about 9,000, so the weapons fit with room to spare.

### What failed

Eleven checks, in three kinds.

**Real, and worth watching when it animates (2):**

- **`Flak_Gun`'s aim pivot sits 0.66 m behind the centre of the gun** (bounding box −1.90 to
  +0.58 along Y), where the brief asks for the centre of its underside. Kimi put the trunnion
  near the breech with the barrels projecting forward, which is arguably truer to the thing
  than the brief's own wording, but it is a deviation and it is the largest in the batch. At
  the briefed 50 degrees of elevation the muzzle rises about 1.45 m and swings back about
  0.7 m. **Watch whether the flak turret looks like it pivots about a point inside itself.**
- **`Gatling_Gun`'s aim pivot sits 0.41 m behind the pod's centre**, against an allowance of
  0.35 m. The pod is 1.22 m long and the pivot is 0.20 m from its rear face. **Watch the join
  between the pod and its pedestal as the turret elevates through its 40 degrees, for a gap.**

**A bounding box taking in a feature the brief asks for but does not exclude from the
dimension — the same thing that was waived across batch 1 (3):**

- **`Railgun_Housing` measures 3.37 m across against 2.2 m.** Symmetric, −1.68 to +1.68,
  which is the "heavy capacitor banks on the housing" the brief requires. **Watch whether it
  reads at phone size and sits properly in the Titan's 2.0 m collar.** It is the second
  widest housing, after the acid spitter's 3.62 m.
- **`Scattergun_Housing` measures 2.71 m tall against 2.0 m**, and its origin therefore sits
  0.35 m above the bounding box's midpoint. Both are one cause: the armoured block is exactly
  2.00 m (−1.00 to +1.00) and the extra 0.71 m above it is the "shell hopper on top" the
  brief asks for. The trunnion is dead centre of the block itself.
- **`Gatling_Gun` measures 1.52 m wide against 1.0 m.** Asymmetric, −0.63 to +0.89, which is
  the "ammo box on the side" the brief requires.

**Trivially over the 5% tolerance (6):** `Scattergun_Housing` 2.40 m wide against 2.2 m
(20 cm); `Gatling_Gun` 1.06 m tall against 1.0 m (6 cm); `Gatling_Barrels` 0.64 m across
against 0.6 m, on two axes (4 cm each, and "0.6 m across" for a six-barrel cluster is
approximate by its nature); `Flak_Gun` 1.48 m wide against 1.4 m (8 cm, which is 5.4% where
5% passes).

### Two corrections to the checker, not to the models

Both are cases where the first run reported a failure and the model turned out to be right.

- **The Gatling pod measured 1.22 m long where the brief says 2.6 m.** The brief dimensions
  "the pod ... 2.6 m long including barrels", and the same brief makes the barrels a separate
  object, so the figure belongs to the pod and the barrels together. Assembled, they span
  exactly 2.60 m. The checker gained an `assembled_size` check for dimensions a brief states
  across several parts.
- **That check then measured 3.15 m**, because it took in the pedestal as well, which stands
  0.75 m behind the pod and is not part of the brief's phrase. `assembled_size` now names the
  parts the phrase covers.

This is the third and fourth time a first run accused a correct model, after batch 1's
standing height and its emissive teal. A failure is read before it is believed.

## 2026-11-04: the models move in-house — `tools/modelgen/`

The owner asked whether the models could be built here instead, and chose that route. The
technique is the one that worked in littleburgerworld on this machine
(`Assets/_LittleBurgerWorld/Scripts/Core/MeshFactory.cs`): rounded boxes, lathed profiles,
capsules and tori. It is ported into Blender rather than C# so the output is a .blend and a
.fbx that goes through the same checker as a delivery, against the same `standards.json`.

**The five Phase 1 assets pass their briefs with 0 failures and 0 waivers.** Kimi's seven
needed 13.

| Asset | Parts, triangles against cap |
|---|---|
| `titan_chassis` | torso 984/3500, thigh 348/900, shin 348/900, foot 432/500 |
| `titan_cannon_autocannon` | housing 340/900, barrel 412/600 |
| `enemy_rustcrawler` | body 636/700, leg 40/80 |
| `pickup_scrap` | 104, 60 and 36, each against 120 |
| `env_rust_flats_ground` | tile 578/1200 |

### What the paint measures

| | generated | Kimi batch 1 | the brief asks for |
|---|---|---|---|
| Titan brass | 45.3% | 7.4% | "clean brass and gunmetal" |
| Titan gunmetal | 35.8% | 21.9% | as above |
| Titan oil black | 8.8% | 66.6% | one of six palette colours |
| Titan teal | 3.4% | 0.2% | "teal accents and lights" |
| Titan hazard yellow | 3.7% | 0.3% | "hazard-yellow stripes on the feet and hip skirts" |
| Titan rust | 0.8% | 3.3% | the raiders' colour, not the Titan's |
| Rustcrawler rust | 54.8% | not delivered | "patched rust plates" |
| Rustcrawler signal red | 3.4% | not delivered | "signal red accents" |

The hazard stripes batch 1 was missing are now on the feet, because the brief is the script's
input rather than a description to interpret. A first pass measured 36% rust on the Titan,
which is the raiders' colour and would have broken friend-from-foe at a glance; it was caught
by the palette check and corrected.

### What is not settled

The look itself, which is judged from frames of the running game at the Phase 1 playtest. The
Kimi autocannon and the generated autocannon are the same brief built two ways, and both are
in the repository, so that comparison can be made directly rather than argued about.

Where the generated route is expected to run out: the four bosses and anything organic. Code
that assembles boxes, drums and plates suits the weapons, the vehicles, the pickups and the
environment — about 29 of the 35 briefs. The Compactor, the Iron Matriarch, the Leviathan
Engine and The Dredge are sculptural, and that is where a generator or Kimi still earns its
place.

### Five of my own mistakes the checker caught

Worth recording, because they are the argument for running our own output through the same
gate as a delivery rather than trusting it.

1. Rustcrawler claws reaching past the briefed 3.2 m body length, which includes them.
2. Two scrap lumps whose extent I varied to tell them apart, where the brief says all three
   are about 0.8 m in every direction. They vary by an inner nub instead.
3. A cannon collar on the torso that had to protrude past the front face to be seen, breaking
   the briefed 7.0 m length. Dropped: the cannon's own housing fills that space.
4. A one-sided ground surface, where the briefs forbid thin panels and the checker requires a
   closed mesh. It now has a skirt and a cap.
5. Two muzzle brakes meeting at exactly x = 0, whose weld left an edge shared by three faces.

A real bug in the shape library came out of the same runs: `cylinder()` with a zero bevel
collapsed two profile rows onto each other, making zero-area faces and doubled vertices.
