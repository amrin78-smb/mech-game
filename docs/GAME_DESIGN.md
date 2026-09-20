# Scrap Titan, Game Design Document

Working title: **Scrap Titan**. Genre: single hero unit tower defense with manual aiming. Reference: Mecha Fortress: Robot War TD (NOXGAMES). Platform: web first, Android via Capacitor. Session length target: 3 to 5 minutes per level. No ads, no IAP.

## 1. Vision and pillars

A colossal dieselpunk mecha walks slowly through a ruined wasteland while waves of scrap raiders throw themselves at it. The player is the gunner, not the driver. Three pillars, in priority order:

1. **Shooting feels heavy.** Every shot has recoil, flash, noise and consequence. Juice is a feature, not polish.
2. **The guns fight, the player commands.** Every weapon auto fires, so a level can be played nearly hands off, but the player who intervenes wins harder: manual precision shots land bonus damage, and picking the focus target decides which threats die first.
3. **Every level changes the question.** New enemy compositions force different weapon and upgrade answers. No level should be beaten by the same loadout mindlessly.

## 2. Core loop

In battle: enemies stream in from the right on three loose lanes, the mecha holds the left. The main cannon and turrets auto fire at their priority targets, and the player can drag at any moment to take manual aim (aim line shown, release fires a precision shot at bonus damage, then auto fire resumes). Kills drop scrap. Scrap is spent mid battle in a compact upgrade panel (damage, fire rate, repair). Survive the wave timeline, beat the boss where present, get 1 to 3 stars.

Between battles: stars gate level unlocks, cores (meta currency awarded per star and first clear) are spent in the Hangar on permanent weapon upgrade cards and pilot levels.

## 3. Controls

All weapons auto fire by default. Auto targeting priority: the focus target first, then ranged enemies already inside their own attack range (they chip the hull for free if ignored), then the closest enemy. Desktop: click an enemy to set the focus target for every weapon, click drag anywhere to take manual aim of the main cannon (auto fire pauses, release fires a precision shot with the manual damage bonus, then auto fire resumes after a short delay), number keys for pilot abilities. Mobile: tap an enemy to focus, drag on the lower half of the screen for manual aim (offset so the finger never covers the target), ability buttons bottom corners. The mecha is never steered; it advances at the level's scroll speed automatically, which drives the parallax background.

## 4. The mecha

Built as layered sprites so it animates without frame animation: legs (walk cycle bob), torso (breathing sway), main cannon (rotates to aim, recoils on fire, barrel heat glow at high fire rates), up to three turret mounts, exhaust stacks with continuous smoke particles. Mecha stats: hull HP, repair cost curve, base scrap generation trickle.

Weapons (main cannon is swappable in the Hangar, turrets are purchased mounts):

| Weapon | Damage type | Character |
|---|---|---|
| Autocannon | kinetic | fast fire, shreds light targets, default starter |
| Acid Spitter | chemical | slow arcing lob, melts armored targets, damage over time pool |
| Railgun | piercing | slow, hitscan line, pierces all enemies in a row, breaks shields |
| Flak Array | explosive | area burst, clears swarms, poor single target |
| Scattergun | kinetic | a fan of rounds per shot, brutal at contact range, wasteful once the cone opens |
| Gatling Pod | kinetic | turret; fast and light where the Flak Array is slow and explosive, for single targets rather than crowds |

## 5. Damage matrix

Multipliers applied by DamageSystem, defined in `tuning.json`:

| | light | armored | shielded | swarm |
|---|---|---|---|---|
| kinetic | 1.5 | 0.5 | 1.0 | 1.0 |
| chemical | 1.0 | 1.75 | 0.5 | 0.75 |
| piercing | 0.75 | 1.0 | 2.0 | 0.5 |
| explosive | 1.0 | 0.5 | 0.75 | 2.0 |

The matrix is the strategic heart: wave composition tells the player which weapons and turret mix to run.

## 6. Enemies

All enemies are defined in `enemies.json` against `enemy.schema.json`. Behaviors are composable flags: `melee`, `ranged` (stops at attackRange and shoots, must be prioritized or it chips the hull for free), `burrow` (spawns at mid field), `spawner` (emits swarm units), `shielded` (shield HP pool that only piercing damages at full value).

Zone 1, The Rust Flats: **rustcrawler** (light, melee grunt), **scavenger bike** (light, very fast, low HP), **plated hulk** (armored, slow, heavy melee). Boss: **The Compactor**, armored crusher, phase 1 slow advance with slam attacks, phase 2 below 50% HP it charges in bursts.

Zone 2, The Ash Canyons: **gunner walker** (armored, ranged, sits at range and fires while trash screens it), **drone swarm** (swarm, flying, fast, spawned in clusters), **shield bearer** (shielded, projects a frontal shield that blocks shots for enemies behind it). Boss: **Iron Matriarch**, shielded, alternates shield up phases (piercing check) with vulnerable vent phases, spawns drone swarms.

Zone 3, The Furnace: **incinerator tank** (armored, ranged flame arcs that create ground burn zones damaging the hull over time), **burrower** (light, erupts at close range, punishes tunnel vision on the back field), **elite vanguard** (shielded and armored, slow, all stats high). Boss: **The Leviathan Engine**, a screen tall crawler with three destructible weak points (each a targetable sub entity), enrages as each is destroyed.

## 7. Waves, levels and stars

A level is a timed wave timeline (see `level.schema.json`): entries specify spawn time, enemy id, count, spawn interval and lane. Difficulty ramps inside a level (calm, pressure, spike, breather, boss). Star criteria per level, always these three: 1 star to win, 2 stars to win with hull above the level's threshold, 3 stars to win without using in battle repair. Stars are re-earnable on replay; best result is saved.

## 8. Economy and meta progression

In battle: scrap from kills plus a small trickle; prices for in battle upgrades escalate per purchase within the run and reset next run. Meta: cores from stars and first clears; Hangar spends cores on weapon cards (per weapon damage, fire rate, special stat tracks defined in `weapons.json`), turret mount unlocks (mounts 2 and 3), hull upgrades, and pilot levels.

## 9. Pilots

Two at launch, active abilities on the battle HUD with cooldowns. **Vex** (offense): ability Overdrive, 8 seconds of +75% fire rate, 45 second cooldown; passive +5% cannon damage per pilot level. **Mara** (defense): ability Aegis Field, absorbs all damage for 5 seconds, 60 second cooldown; passive +4% hull per level.

## 10. Content plan, 15 levels

Zone 1 (levels 1 to 5): teach the auto battle flow, manual precision shots, focus targeting and scrap spending, armor matrix via plated hulks in level 3, bikes teach when a manual precision shot beats waiting for auto fire in level 4, level 5 boss Compactor. Zone 2 (6 to 10): gunner walkers teach focus targeting in 6, swarms sell the Flak Array in 7, shield bearers sell the Railgun in 8, combined arms in 9, level 10 boss Iron Matriarch. Zone 3 (11 to 15): burn zones and burrowers punish static play, elite vanguards check total upgrade investment, 14 is a horde gauntlet remix, 15 boss Leviathan Engine as the full exam.

## 11. Presentation

Dieselpunk palette: rust, brass, ash sky, oil smoke. Three layer parallax per zone (sky, ruins, ground). VFX checklist per shot: muzzle flash, recoil tween, tracer or projectile trail, impact explosion particles, debris, camera shake scaled to damage, hit flash tint on the victim, pooled floating damage numbers color coded by effectiveness (bright for multiplier above 1, grey below 1, teaching the matrix wordlessly). Audio: layered thumps for the cannon, distinct death sounds per armor class, low engine drone bed, boss stingers. All CC0 sourced (Kenney, freesound.org) or synthesized.

## 12. Out of scope at launch

Ads, IAP, idle offline earnings, multiplayer, cloud saves.

Endless mode was the first post launch candidate and is now built, exactly as predicted here: it reuses the spawner with a generated timeline (`src/systems/EndlessTimeline.ts`), unlocks after the level in `tuning.endless.unlockAfterLevel`, and pays cores only for waves beyond your previous best so it cannot be farmed.
