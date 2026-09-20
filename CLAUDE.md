# CLAUDE.md

Project: **Scrap Titan** (working title). A dieselpunk mecha base defense game in the style of Mecha Fortress: Robot War TD. One giant player mecha defends against scrolling waves of enemies. All weapons auto fire at prioritized targets, with a manual drag override on the main cannon for precision shots, mid level upgrades, meta progression, multiple levels with bosses.

Read `docs/GAME_DESIGN.md` before implementing any gameplay feature. It is the source of truth for mechanics, content and balance intent. This file is the source of truth for code conventions and the build roadmap.

## Stack

- Phaser 3 (latest 3.x), TypeScript strict mode, Vite
- No other runtime dependencies unless approved in this file
- Target: desktop browser first, mobile touch second, Capacitor Android wrap in Phase 4
- Deploy target: static build, Netlify

## Commands

```
npm run dev        # Vite dev server with HMR
npm run build      # production build to dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
npm run sim        # headless balance simulation (Phase 3, see Balance section)
```

Always run `npm run typecheck` before declaring a task done.

## Directory layout

```
src/
  main.ts                 # Phaser game config, scene registration
  scenes/                 # one file per scene
    BootScene.ts
    PreloadScene.ts
    MainMenuScene.ts
    LevelSelectScene.ts
    BattleScene.ts
    HangarScene.ts
    ResultsScene.ts
  entities/
    Mecha.ts              # layered container: legs, torso, cannon, turret mounts
    Enemy.ts              # single Enemy class, driven entirely by EnemyDef data
    Projectile.ts
    Boss.ts               # extends Enemy, adds phase logic
  systems/
    WaveSpawner.ts        # reads LevelDef, spawns per timeline
    TargetingSystem.ts    # priority target selection shared by cannon and turrets + player focus target
    DamageSystem.ts       # damage type vs armor class matrix
    EconomySystem.ts      # in-run scrap, kill rewards
    VfxManager.ts         # particles, shake, hit flash, damage numbers
    AudioManager.ts
    SaveManager.ts        # localStorage, versioned save schema
  ui/                     # HUD, upgrade panel, aim line renderer
  data/
    schemas/              # JSON Schema files, do not break these
    enemies.json
    weapons.json
    pilots.json
    levels/level-XX.json  # one file per level
  types.ts                # TS interfaces mirroring the JSON schemas
```

## Hard rules

1. **Data driven everything.** Enemy stats, weapon stats, wave timelines, star criteria and economy tuning live in `src/data/*.json`, never as literals in code. Adding a level or enemy must require zero code changes. Every JSON file must validate against its schema in `src/data/schemas/`.
2. **Object pooling is mandatory** for projectiles, enemies, damage numbers and particle effects. No `new` inside the update loop. Pools live with their owning system. This game dies on mobile without it.
3. **One Enemy class.** Behavior differences come from `EnemyDef` fields (speed, range, behaviors array), not subclasses. The only exception is `Boss`.
4. **No magic numbers** in gameplay code. Tuning constants that are not per entity go in `src/data/tuning.json`.
5. **Placeholder art is generated, not skipped.** Until real sprites exist, generate textures at runtime in PreloadScene with `Graphics.generateTexture()` (simple shapes, correct silhouette and size). Gameplay is never blocked on assets. All texture keys go through one `AssetKeys` const so swapping in real sprite sheets later touches only PreloadScene.
6. **Fixed logic, framerate independent.** All movement and timers use delta time. Never assume 60fps.
7. **Keep scenes thin.** BattleScene wires systems together and owns the update order. Logic lives in systems, presentation in entities and VfxManager.
8. **Save schema is versioned.** Any change to save data bumps `SAVE_VERSION` and adds a migration in SaveManager.
9. Cannon control: the main cannon auto fires at the TargetingSystem's priority target (focus target if set, else ranged attackers already inside their own attack range, else closest). A pointer drag at any moment takes manual control: auto fire pauses, an aim line renders from the cannon, release fires a precision shot with the manual damage multiplier from tuning.json, and auto fire resumes after the resume delay. On mobile the drag origin is anywhere on the lower half of the screen so fingers do not cover the action.

## Damage model

Damage types: `kinetic`, `chemical`, `piercing`, `explosive`. Armor classes: `light`, `armored`, `shielded`, `swarm`. The multiplier matrix is defined once in `src/data/tuning.json` and applied only inside DamageSystem. See GAME_DESIGN.md section 5 for the intended matrix.

## Balance simulation (Phase 3)

`npm run sim` runs `sim/simulate.ts` under tsx: a headless loop that pits weapon configurations at given upgrade levels against each level's wave timeline using the same JSON data and DamageSystem, and prints clear time, damage taken and scrap earned per level. Use it whenever tuning enemies, weapons or waves. Balance changes are made in JSON and verified in the sim before manual play testing.

## Roadmap and definitions of done

Work strictly in phases. Do not start a later phase's features early unless asked.

**Phase 1, core loop.** Vite + Phaser + TS scaffold. BattleScene with three layer parallax background scrolling slowly (the mecha "advances"). Mecha as layered container with idle bob tween. Auto firing main cannon driven by TargetingSystem, with the manual drag override per hard rule 9 (drag pauses auto fire, shows the aim line, release fires a precision shot), projectiles with travel time and impact detection. WaveSpawner reading `level-01.json`, one enemy type (rustcrawler) advancing and attacking the mecha in melee. HP bars, death, scrap drops, win state (timeline complete) and lose state (mecha HP zero). Results screen with retry.
Done when: level 1 is playable start to finish in the browser with placeholder art and no console errors.

**Phase 2, feel and combat depth.** VfxManager: muzzle flash, cannon recoil tween, impact explosions (particle emitter), smoke trails, camera shake scaled by damage, hit flash tint, pooled floating damage numbers. AudioManager with CC0 sounds. Enemy types 2 and 3 (scavenger bike, plated hulk) and the armor matrix live in DamageSystem. One auto turret mount sharing the TargetingSystem (tap an enemy to set the focus target for cannon and turrets). In battle upgrade panel: spend scrap on fire rate, damage, repair. Boss 1 (The Compactor) with two phases.
Done when: level 3 ends in a boss fight and the game audibly and visibly "feels" like combat.

**Phase 3, meta and content.** LevelSelectScene as a zone map with lock/unlock and star display. Star criteria evaluated at level end. Persistent currency (cores) and SaveManager. HangarScene: weapon upgrade cards, second and third weapon types (acid spitter, railgun), pilot slots with two pilots and active cooldown abilities on the battle HUD. Author all 15 levels and remaining enemies per GAME_DESIGN.md sections 6 and 10, tuned via the sim.
Done when: a fresh save can progress from level 1 to 15 with meaningful upgrade decisions.

**Phase 4, polish and packaging.** Tutorial hints on level 1, settings (audio, shake toggle), pause. Performance pass: verify pooling, cap particle counts on mobile, texture atlas packing. Real art pass sprite swap. Capacitor Android wrap with touch review.
Done when: stable 60fps on a mid range Android phone through level 15.

**Phase 5, depth and content.** Phases 1 to 4 shipped the game; this phase is about making it deeper rather than bigger in surface area. Three tracks, in this order:

1. *Finish the designed combat.* Several enemies do not yet play the way GAME_DESIGN section 6 describes them. Incinerator tanks fire flame arcs that leave ground burn zones damaging the hull over time. The Leviathan Engine gets its three destructible weak points as targetable sub entities, enraging as each falls. WaveSpawner learns about more than one boss per level, which also gives endless elites real phases and a boss bar instead of being boss statted grunts.
2. *Zone 4 and new content.* A fourth zone: five levels, three enemies and a boss, plus further pilots and escorts. This is the data driven promise being cashed in, so it should be JSON authoring and balance work with close to no engine changes. If a zone 4 needs code, that is a bug in the data model, not a task.
3. *Sim and tooling fidelity.* The sim's known gaps each make it lie in a specific direction: piercing is unmodelled, lobbed arcs fly straight, escorts and lanes are absent, and burn zones will be too. Close them, and add a seeded replay so a balance result can be reproduced exactly rather than re-rolled.

Done when: zone 4 is playable and tuned, every enemy behaves as section 6 describes it, and the sim's output can be trusted without a mental correction factor.

Endless mode was built after phase 4 and is out of the phase order above; it lives in `EndlessTimeline.ts` and is tuned entirely through `tuning.endless`.

## Out of scope

Ads, IAP, offline idle earnings, multiplayer, cloud saves. Do not implement or scaffold these.
