# Scrap Titan in Unity: phased plan

Owner decision (2026-11-04): Scrap Titan becomes a native Android game built in Unity, in 2.5D, with an APK as the deliverable, like Roar Rally. The Phaser and browser version stops; its repo stays as the reference until the Unity version matches it, then it is archived (not deleted).

Status: **approved by the owner on 2026-11-04.** Nothing below is built yet; Phase 0 is next.

## Decisions

| Area | Choice |
|---|---|
| Engine | Unity 6000.3.27f2 LTS, URP (same as Roar Rally) |
| Look | 2.5D: gameplay on a 2D plane (lanes, waves, aiming); everything drawn as lit 3D models; fixed side-on camera, slightly above |
| Platform | Android only. IL2CPP, ARM64 + ARMv7 (the 32-bit Redmi A3). Landscape |
| Test phones | Samsung Galaxy S25 Ultra and Redmi A3 |
| Redmi A3 | From day one: graphics APIs Vulkan then OpenGLES3, Vulkan device filter denying `.*PowerVR.*`. Always test a full close and relaunch |
| Models | Kimi 3D Make, one prompt per model in `docs/unity/KIMI_MODEL_PROMPTS/`. Models come as separate parts with pivots at the joints; the game animates them in code (no rigs) |
| Model check | A Blender checker, adapted from Roar Rally's `prepare_prop.py`, checks each delivery against its brief before import. Only the owner can accept a failed check (named waiver) |
| Data | Today's JSON (enemies, weapons, pilots, escorts, levels, tuning) moves across with the same fields and numbers, imported into ScriptableObjects and validated by tests |
| Balance | The headless sim becomes EditMode tests that report level clear times. Phase 3 has to match the Phaser sim's numbers |
| APK delivery | GitHub release on `amrin78-smb/mech-game`, tag `demo-x.y.z` on an empty-tree commit, APK attached, pre-release. Same as Roar Rally |
| Source | Keep the repo's current practice; ask before any change to what is pushed |
| Shared computer | Roar Rally and abcwonderland also run Unity here. Before any build or test run, check no other Unity batch run is going; if the system kills a run for low memory, do not restart it without asking |

Rules carried over from the Phaser version: data-driven content (a new level or enemy needs no code), one Enemy class driven by data (bosses excepted), pooling for everything spawned in battle, frame-rate independent logic, versioned saves.

## Phases

Each phase ends with an APK on both phones, published on GitHub, and a short owner playtest. A phase is not done until the owner has played it.

### Phase 0: Set-up (small)
- New Unity project `ScrapTitan/` inside the repo; URP; Android settings above; a new signing key kept outside the repo.
- Build script, test runner and the GitHub release flow, proven with an empty scene.
- Data import: the JSON files load into ScriptableObjects, with tests that every file validates.

**Done when:** a "hello" APK installs and relaunches on both phones, and all data imports and validates.

### Phase 1: First playable battle (grey-box)
- Battle scene: side-on camera, three lanes, a scrolling ground and two background layers.
- The Titan built from simple placeholder parts with the real pivots from the brief, walking and bobbing.
- Autocannon: auto fire at the priority target, and the drag override (aim line, precision shot, resume delay). Touch first; drag starts anywhere on the lower half of the screen.
- Rustcrawler, the wave spawner from `level-01`, damage, scrap drops, win and lose, results screen with retry.

Placeholders are allowed here only so gameplay is never blocked. They are replaced in Phase 2 and are never shipped as final art.

**Done when:** level 1 can be won and lost on both phones, at 30 fps or better on the Redmi.

### Phase 2: It looks like Scrap Titan (first Kimi models)
- Models: Titan chassis, autocannon, Gatling turret, Rustcrawler, Scavenger Bike, Plated Hulk, The Compactor, scrap pickups, and the Rust Flats ground and ruins (prompts 01, 02, 06, 10 to 12, 22, 27, 28 and 29).
- The model checker and import pipeline; frames from the running game checked for each model.
- Lighting and the zone 1 look; VFX (muzzle flash, recoil, tracers, impacts, debris, hit flash, camera shake, colour-coded damage numbers); audio from the CC0 set.
- Zone 1 complete: levels 1 to 5, the in-battle upgrade panel, the Compactor's two phases.

**Done when:** zone 1 plays start to finish with real models, and the owner judges it looks and feels better than the Phaser version.

### Phase 3: Full combat (zones 2 and 3)
- Models: the other main cannons, the Flak Array, both escorts, the zone 2 and 3 enemies, Iron Matriarch, the Leviathan Engine and its vents, and the Ash Canyons and Furnace scenery (prompts 03 to 05, 07 to 09, 13 to 18, 23 to 25, 30 to 33).
- Every weapon, the damage matrix, focus targeting, escorts, both pilots and their abilities.
- Every enemy behaviour (ranged, shielded and barrier, burrow, spawner, burner with burn zones, anchored weak points), and the bosses' phases.
- Levels 6 to 15. The sim as tests, matching the Phaser numbers.

**Done when:** levels 1 to 15 play as in the Phaser version, and the sim's clear times match.

### Phase 4: Meta, zone 4 and endless
- Level select map, stars, cores, Hangar (weapon cards, turret mounts, hull, pilot levels), versioned save.
- Zone 4 models (prompts 19 to 21, 26, 34 and 35), levels 16 to 20, The Dredge.
- Endless mode.

**Done when:** everything in the Phaser version is in the Unity version.

### Phase 5: Polish and release candidate
- Tutorial hints, settings (audio, camera shake), pause, the Android back button, app icon and splash.
- Performance pass on the Redmi: draw calls, triangle counts on screen in the worst wave, pooled effects, texture sizes.
- Archive the Phaser version.

**Done when:** the owner signs off a release candidate APK.

## Performance budget (Redmi A3)

Worst wave on screen: the Titan (about 9,000 triangles with weapons), 30 raiders at up to 1,500 each, 40 drones at about 190, scenery about 6,000. That comes to roughly 70,000 triangles, a comfortable load for the Redmi's GPU at 30 fps. The triangle limits in the Kimi prompts are set from this. Everything sits at one camera distance, so the models need no detail levels.

## Risks

- **Kimi parts that do not fit.** Pivots that are off, or gaps at joints, show only once animated. The checker measures pivots, and frames from the game are reviewed before sign-off.
- **A rewrite drifts from the tuned balance.** Phase 3 has to match the Phaser sim before new tuning begins.
- **Memory on the shared computer.** Take turns with the other Unity projects.
- **Originality.** The design notes name *Mecha Fortress: Robot War TD* as the reference. Mechanics in the genre are fine; the Titan, enemies, names and look must be our own.
