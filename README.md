# Scrap Titan, repo starter kit

This folder is a specification kit, not code yet. It gives Claude Code everything it needs to build the game consistently across sessions: conventions and roadmap in `CLAUDE.md`, mechanics and content in `docs/GAME_DESIGN.md`, and the data contracts in `src/data/`.

## Setup

```
npm create vite@latest scrap-titan -- --template vanilla-ts
cd scrap-titan
npm install
npm install phaser
npm install -D tsx ajv
```

Then copy the contents of this starter folder into the project root, merging `src/` (keep Vite's generated config files, delete its sample `src` contents except `main.ts` which will be replaced). Commit, then open Claude Code in the project root.

## First session prompt for Claude Code

Paste this to start Phase 1:

> Read CLAUDE.md and docs/GAME_DESIGN.md fully before writing anything. Then implement Phase 1 exactly as defined in the roadmap: project scaffold per the directory layout, BattleScene with three layer parallax, the layered mecha with the auto firing cannon plus manual drag override per hard rule 9, WaveSpawner driven by src/data/levels/level-01.json, the rustcrawler enemy from src/data/enemies.json, damage, scrap, win and lose states, results screen. Generate all placeholder textures at runtime as described in hard rule 5. Validate loaded JSON against the schemas in src/data/schemas at startup in dev mode using ajv. Finish by running npm run typecheck and telling me how to play it.

Subsequent sessions: "Continue with Phase 2 from CLAUDE.md", and so on. When adding content, ask for it in data terms, for example: "Author levels 2 to 4 per GAME_DESIGN.md section 10, JSON only, then run the sim and show me clear times."

## What is in here

```
CLAUDE.md                      conventions, hard rules, phased roadmap with done criteria
docs/GAME_DESIGN.md            full game design document, 15 level content plan
src/data/tuning.json           damage matrix, economy and VFX budgets
src/data/enemies.json          zone 1 enemies plus first boss, ready for Phase 1 and 2
src/data/weapons.json          four weapons with upgrade tracks
src/data/pilots.json           two launch pilots
src/data/levels/level-01.json  first playable level timeline
src/data/levels/level-05.json  first boss level, shows the boss block
src/data/schemas/*.json        JSON Schema contracts for all of the above
```

## House rules that keep quality up

Keep sessions scoped to one phase or one system. Always let Claude Code run `npm run typecheck` before accepting work. Any balance change goes into JSON, never into code, and gets verified with `npm run sim` once Phase 3 lands. If a session drifts from the conventions, point it back to CLAUDE.md rather than correcting piecemeal.
