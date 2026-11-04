# CLAUDE.md

Project: **Scrap Titan**. A dieselpunk mecha base defence game. One giant player mecha, the
Titan, holds the left of the screen while waves of scrap-built raider machines come in from
the right. All weapons auto fire at prioritised targets, with a manual drag override on the
main cannon for precision shots, mid-level upgrades, meta progression, multiple levels with
bosses.

**The engine changed on 2026-11-04.** Scrap Titan is being rebuilt as a native Android game
in Unity, in 2.5D, with an APK as the deliverable. Read `docs/unity/UNITY_PLAN.md` before
starting any work: it is the phased plan and the record of what is decided. Read
`docs/GAME_DESIGN.md` before implementing any gameplay feature; it remains the source of
truth for mechanics, content and balance intent. This file is the source of truth for code
conventions.

No more Phaser, Vite, Netlify or Capacitor work. The Phaser code stays in the repository as
the reference until the Unity version matches it, and is archived then. It is not deleted
and it is not extended.

## Stack

- Unity 6000.3.27f2 LTS, URP, C#
- Android only. IL2CPP, ARM64 + ARMv7, landscape
- Project at `ScrapTitan/`, inside this repository
- Content stays in `src/data/*.json`, imported into ScriptableObjects. The JSON is still the
  source of truth; the assets under `ScrapTitan/Assets/_Game/Data/Generated` are derived
- Models come from Kimi 3D Make, one brief per model in `docs/unity/KIMI_MODEL_PROMPTS/`

## Commands

```
scripts/unity-guard.sh                   # is it safe to start a Unity run?
scripts/unity-setup.sh                   # import src/data, rebuild the Phase 0 scene, apply Android settings
scripts/unity-test.sh                    # EditMode tests, report in Logs/editmode-results.xml
scripts/unity-build-apk.sh <version>     # build the APK into ScrapTitan/Builds/Android
scripts/release-apk.sh <version> <apk>   # publish it as a GitHub pre-release and verify the SHA-256
```

Always run `scripts/unity-test.sh` before declaring a task done.

## Hard rules

1. **Data driven everything.** Enemy stats, weapon stats, wave timelines, star criteria and
   economy tuning live in `src/data/*.json`, never as literals in code. Adding a level or an
   enemy must require zero code changes. Every JSON file must validate against its schema in
   `src/data/schemas/`, which the EditMode tests enforce. If zone 4 needed code, that was a
   bug in the data model, not a task.
2. **Object pooling is mandatory** for projectiles, enemies, damage numbers and effects. No
   allocation inside the update loop. Pools live with their owning system. This game dies on
   a Redmi A3 without it.
3. **One Enemy class.** Behaviour differences come from `EnemyDef` data (speed, range,
   behaviours array), not subclasses. The only exception is `Boss`.
4. **No magic numbers** in gameplay code. Tuning constants that are not per entity go in
   `src/data/tuning.json`.
5. **Placeholder art is generated, not skipped.** Until a Kimi model arrives, use simple
   shapes at the real size with the real pivots from the model's brief. Gameplay is never
   blocked on assets, and a placeholder is never shipped as final art.
6. **Frame-rate independent.** All movement and timers use delta time. Never assume 60fps;
   the Redmi target is 30.
7. **Keep scenes thin.** A scene wires systems together and owns the update order. Logic
   lives in systems, presentation in entities and the VFX manager.
8. **Save schema is versioned.** Any change to save data bumps the save version and adds a
   migration.
9. **Cannon control.** The main cannon auto fires at the targeting system's priority target
   (focus target if set, else ranged attackers already inside their own attack range, else
   closest). A drag at any moment takes manual control: auto fire pauses, an aim line renders
   from the cannon, release fires a precision shot with the manual damage multiplier from
   tuning.json, and auto fire resumes after the resume delay. The drag origin is anywhere on
   the lower half of the screen so fingers do not cover the action.

## Damage model

Damage types: `kinetic`, `chemical`, `piercing`, `explosive`. Armour classes: `light`,
`armored`, `shielded`, `swarm`. The multiplier matrix is defined once in
`src/data/tuning.json` and applied only inside the damage system. See GAME_DESIGN.md
section 5 for the intended matrix.

## Android rules

- **The Redmi A3 fix is not optional.** Graphics APIs are Vulkan then OpenGLES3, with a
  Vulkan Device Filter Lists asset denying `.*PowerVR.*` assigned in Player Settings. Its
  PowerVR GE8320 runs the first launch after installing and then closes on every launch
  after, so **testing means a full close and relaunch, not a fresh install.**
  `AndroidSettingsTests` keeps this from being lost in a merge.
- Both ABIs, ARM64 and ARMv7: a 64-bit-only APK is refused by phones on a 32-bit Android.
- Test phones: Samsung Galaxy S25 Ultra and Redmi A3. **Never claim anything works on a
  phone until the owner has tested it there.** A desktop or emulator run is not evidence.

## Shared computer

Roar Rally and abcwonderland also run Unity on this machine, and two Unity runs at once have
run it out of memory. `scripts/unity-guard.sh` checks for another Unity process and for free
memory, and every script calls it. If the system kills a run for low memory, **ask the owner
before restarting it.**

## Models from Kimi

- Check every delivery against its brief in `docs/unity/KIMI_MODEL_PROMPTS/` before importing
  it, with the checker adapted from Roar Rally's `BLENDER_PIPELINE/SCRIPTS/prepare_prop.py`.
- **Never loosen a limit to make a model pass.** Only the owner can accept a failed check,
  and it is recorded as a named waiver.
- Judge a model from frames of the running game, not from Kimi's renders.

## Originality

GAME_DESIGN.md names *Mecha Fortress: Robot War TD* as a reference. Mechanics shared with the
genre are fine. The Titan, the enemies, their names and the look must be our own, and must
not be modelled on that game or any other, or on any real brand, logo or insignia.

## APK delivery

A GitHub release on `amrin78-smb/mech-game`, tagged `demo-x.y.z`, with the tag on an
empty-tree commit by the GitHub noreply identity so no source is published, the APK attached,
marked pre-release. The APK is downloaded back and its SHA-256 compared with the local file.
`scripts/release-apk.sh` does all of this. Signing keys live outside the repository, in
`~/.scraptitan/`, and are passed to the editor only as environment variables.

## Out of scope

Ads, IAP, offline idle earnings, multiplayer, cloud saves. Do not implement or scaffold these.

## The Phaser version (reference only)

The browser build is complete through its own phases 1 to 5: 20 levels across four zones,
17 enemies, 6 weapons, endless mode, a balance simulation and an Android wrap. It is kept so
the Unity version can be checked against something that works, above all the balance: the
clear times its `npm run sim` reports are the numbers Unity's Phase 3 has to match.

Its code is in `src/`, its simulation in `sim/`, and its commands (`npm run dev`, `build`,
`sim`, `typecheck`) still work. **Do not add features to it.** Fix it only if a question
about intended behaviour can be answered no other way.
