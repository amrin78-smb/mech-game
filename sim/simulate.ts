/**
 * Headless balance simulation. `npm run sim`
 *
 * Pits a weapon configuration at given upgrade levels against each level's wave
 * timeline, using the same JSON data and the same DamageSystem the game runs,
 * and prints clear time, damage taken and scrap earned per level.
 *
 * It is not a pixel accurate replay of BattleScene. It models the parts that
 * decide balance: spawn timing, closing speed, target priority, fire rate,
 * shells with real travel time (so a shot at a dying target is wasted), the
 * armor matrix, shields, and the economy. Presentation is ignored.
 *
 * The field has lanes, as the game does, so a blast only catches neighbours
 * that are actually near it and a shield bearer only screens its own lane.
 * Lane assignment, like the game's, is random when a wave does not name one,
 * which is why the run is seeded: `--seed` reproduces a result exactly instead
 * of re-rolling it.
 *
 * Modelled: spawn timing and lanes, closing speed, target priority, fire rate,
 * shells with real travel time (so a shot at a dying target is wasted),
 * piercing beams down a lane, pellet cones that open with range, the armor
 * matrix, shields, frontal barriers, burn zones that outlive their owner,
 * escorts bought mid battle, and the economy. Presentation is ignored.
 *
 * Remaining gap, and it is in the game rather than here: `lobbed` is a
 * projectile kind in the data that nothing in the engine branches on, so the
 * Acid Spitter's designed arc flies straight in play. The sim flies it
 * straight too, which makes it accurate to the game and wrong against
 * GAME_DESIGN section 4.
 *
 * Usage:
 *   npm run sim
 *   npm run sim -- --weapon=railgun --cards=2 --mounts=2 --hull=3
 *   npm run sim -- --level=level-10 --verbose
 *   npm run sim -- --seed=1234        reproduce a run exactly
 *   npm run sim -- --escorts=false    without mid battle escort buying
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  enemies,
  escorts as escortDefs,
  getEnemyDef,
  getEscortDef,
  getWeaponDef,
  registerLevels,
  tuning,
} from '../src/data/core';
import { DamageSystem, type DamageTarget } from '../src/systems/DamageSystem';
import { evaluateStars } from '../src/systems/StarRating';
import type { EnemyDef, EscortDef, LevelDef, WeaponDef } from '../src/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = join(HERE, '..', 'src', 'data', 'levels');

/** Fixed step. Small enough that travel time and fire rate stay honest. */
const STEP = 1 / 60;
/** A run that never resolves is a balance failure, not an infinite loop. */
const MAX_SECONDS = 600;

interface Options {
  weaponId: string;
  turretId: string;
  cards: number;
  mounts: number;
  hullLevel: number;
  levelId: string | null;
  verbose: boolean;
  /** Whether the simulated pilot spends scrap mid battle, as a real one would. */
  spend: boolean;
  /** Whether that spending includes escorts. */
  escorts: boolean;
  /** Seeds lane rolls, so a run reproduces exactly. */
  seed: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    weaponId: 'autocannon',
    turretId: 'flak_turret',
    cards: 0,
    mounts: 1,
    hullLevel: 0,
    levelId: null,
    verbose: false,
    spend: true,
    escorts: true,
    seed: 1,
  };

  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    switch (key) {
      case 'weapon':
        options.weaponId = value;
        break;
      case 'turret':
        options.turretId = value;
        break;
      case 'cards':
        options.cards = Number(value);
        break;
      case 'mounts':
        options.mounts = Number(value);
        break;
      case 'hull':
        options.hullLevel = Number(value);
        break;
      case 'level':
        options.levelId = value;
        break;
      case 'verbose':
        options.verbose = true;
        break;
      case 'spend':
        options.spend = value !== 'none' && value !== 'false';
        break;
      case 'escorts':
        options.escorts = value !== 'none' && value !== 'false';
        break;
      case 'seed':
        options.seed = Number(value);
        break;
      default:
        break;
    }
  }
  return options;
}

function loadLevels(): LevelDef[] {
  return readdirSync(LEVELS_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(LEVELS_DIR, file), 'utf8')) as LevelDef);
}

/**
 * Small deterministic RNG. The game rolls a lane whenever a wave does not name
 * one, so without a seed two runs of the same level are not comparable.
 */
function makeRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/** The sim's stand-in for Enemy: the same contract DamageSystem needs. */
class SimEnemy implements DamageTarget {
  definition: EnemyDef | null;
  hp: number;
  shield: number;
  x: number;
  /** Index into tuning.mecha.lanesY, as in the game. */
  lane: number;
  attackTimer = 0;
  inRange = false;
  spawnsRemaining: number;
  spawnTimer: number;
  /** Active damage over time pools left by chemical rounds. */
  dots: Array<{ dps: number; remaining: number; type: WeaponDef['damageType'] }> = [];
  /** Destructible parts riding on this enemy, empty for everything but a carrier. */
  parts: SimEnemy[] = [];

  constructor(def: EnemyDef, x: number, hpMultiplier: number, lane: number) {
    this.definition = def;
    this.hp = def.hp * hpMultiplier;
    this.shield = def.behaviors.includes('shielded') ? (def.shieldHp ?? 0) * hpMultiplier : 0;
    this.x = x;
    this.lane = lane;
    this.spawnsRemaining = def.spawns?.count ?? 0;
    this.spawnTimer = def.spawns?.interval ?? 0;
  }

  get isAlive(): boolean {
    return this.hp > 0;
  }

  get hasShield(): boolean {
    return this.shield > 0;
  }

  /** A carrier shrugs off most of a hit while any of its parts still lives. */
  get damageTakenScale(): number {
    const factor = this.definition?.weakPoints?.bodyDamageFactor;
    if (factor === undefined || this.parts.length === 0) return 1;
    return this.parts.some((part) => part.isAlive) ? factor : 1;
  }

  absorbWithShield(amount: number): number {
    const absorbed = Math.min(this.shield, amount);
    this.shield -= absorbed;
    return amount - absorbed;
  }

  applyDamage(amount: number): boolean {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      return true;
    }
    return false;
  }
}

/**
 * An escort bought mid battle. It does the two things that change a balance
 * number: it holds its lane so enemies chew on it instead of the hull, and it
 * adds a gun. Everything cosmetic about it is ignored.
 */
class SimEscort {
  hp: number;
  cooldown = 0;

  constructor(
    readonly def: EscortDef,
    readonly lane: number,
    readonly blockX: number,
  ) {
    this.hp = def.hp;
  }

  get isAlive(): boolean {
    return this.hp > 0;
  }
}

class SimHull {
  constructor(public hp: number) {}

  applyDamage(amount: number): number {
    const applied = Math.min(amount, this.hp);
    this.hp -= applied;
    if (this.hp < 0) this.hp = 0;
    return applied;
  }
}

interface Shot {
  target: SimEnemy;
  impactAt: number;
  damage: number;
  weapon: WeaponDef;
}

export interface LevelReport {
  levelId: string;
  levelName: string;
  won: boolean;
  /** Hit the time cap with enemies still standing: not a win, and not a clean loss. */
  stalled: boolean;
  clearSeconds: number;
  damageTaken: number;
  hullRemaining: number;
  hullMax: number;
  scrapEarned: number;
  kills: number;
  leaked: number;
  stars: number;
  damageLevels: number;
  fireRateLevels: number;
  repairsBought: number;
}

/** Cumulative Hangar card bonuses, same rule BattleScene applies. */
function cardBonuses(weapon: WeaponDef, cards: number): { damage: number; fireRate: number } {
  let damage = 1;
  let fireRate = 1;
  for (let i = 0; i < cards && i < weapon.upgradeTrack.length; i += 1) {
    damage += weapon.upgradeTrack[i].damageBonus ?? 0;
    fireRate += weapon.upgradeTrack[i].fireRateBonus ?? 0;
  }
  return { damage, fireRate };
}

function simulateLevel(level: LevelDef, options: Options, damage: DamageSystem): LevelReport {
  const { baseWidth, spawnXFraction, mechaXFraction, meleeStandoff, burrowSpawnXFraction } =
    tuning.world;
  const mechaX = baseWidth * mechaXFraction;
  const spawnX = baseWidth * spawnXFraction;
  const engageMaxX = baseWidth;

  const laneY = tuning.mecha.lanesY.map((fraction) => fraction * tuning.world.baseHeight);
  const rng = makeRng(options.seed);
  const rollLane = (): number => Math.min(laneY.length - 1, Math.floor(rng() * laneY.length));
  const hitscanRange = baseWidth * tuning.world.hitscanRangeFactor;

  const main = getWeaponDef(options.weaponId);
  const turret = getWeaponDef(options.turretId);
  const mainBonus = cardBonuses(main, options.cards);

  const hullMax = Math.round(
    tuning.mecha.baseHullHp * (1 + options.hullLevel * tuning.meta.hullUpgrade.bonusPerLevel),
  );
  const hull = new SimHull(hullMax);

  const levelHp = level.hpMultiplier ?? 1;
  const waves = level.waves.map((entry) => ({
    entry,
    hpMultiplier: levelHp * (entry.hpMultiplier ?? 1),
    spawned: 0,
    nextSpawnTime: entry.time,
  }));

  let bossSpawned = level.boss === undefined;
  let cleared = false;
  const live: SimEnemy[] = [];
  const shots: Shot[] = [];

  let scrap = level.economy.startingScrap;
  let earned = 0;
  let kills = 0;
  let leaked = 0;
  let damageTaken = 0;
  /** Burning ground left by burner enemies; each pool outlives its owner. */
  const burns: Array<{ dps: number; remaining: number }> = [];
  const allies: SimEscort[] = [];
  /** Per escort id, how many have been bought; the price climbs with each. */
  const escortsBought = new Map<string, number>();
  /** Escorts take lanes in turn, as EscortSystem hands them out. */
  let nextEscortLane = 0;
  let time = 0;

  // Cooldowns start full so the first target is engaged immediately.
  let damageLevels = 0;
  let fireRateLevels = 0;
  let repairsBought = 0;

  let mainCooldown = 1 / (main.fireRate * mainBonus.fireRate);
  const turretCooldowns = new Array<number>(Math.max(0, options.mounts)).fill(
    1 / turret.fireRate,
  );

  /** The frontmost living escort in a lane, which is what stops enemies there. */
  const blockerFor = (lane: number): SimEscort | null => {
    let best: SimEscort | null = null;
    for (const ally of allies) {
      if (!ally.isAlive || ally.lane !== lane) continue;
      if (best === null || ally.blockX > best.blockX) best = ally;
    }
    return best;
  };

  const spawn = (def: EnemyDef, hpMultiplier: number, x: number, lane: number): SimEnemy => {
    const enemy = new SimEnemy(def, x, hpMultiplier, lane);
    live.push(enemy);
    return enemy;
  };

  while (time < MAX_SECONDS) {
    time += STEP;

    // Spawns -------------------------------------------------------------
    for (const wave of waves) {
      while (wave.spawned < wave.entry.count && time >= wave.nextSpawnTime) {
        const def = getEnemyDef(wave.entry.enemyId);
        const lane =
          wave.entry.lane !== undefined
            ? Math.min(Math.max(wave.entry.lane, 0), laneY.length - 1)
            : rollLane();
        spawn(
          def,
          wave.hpMultiplier,
          def.behaviors.includes('burrow') ? baseWidth * burrowSpawnXFraction : spawnX,
          lane,
        );
        wave.spawned += 1;
        wave.nextSpawnTime += wave.entry.interval;
      }
    }
    if (!bossSpawned && level.boss !== undefined && time >= level.boss.time) {
      const bossDef = getEnemyDef(level.boss.enemyId);
      // Bosses walk the middle lane, as WaveSpawner places them.
      const bossLane = Math.floor(laneY.length / 2);
      const boss = spawn(bossDef, levelHp * (level.boss.hpMultiplier ?? 1), spawnX, bossLane);
      bossSpawned = true;

      // Carried parts ride at the carrier's x, so the 1d field puts them in
      // front of it and the closest first rule picks them up naturally.
      const carried = bossDef.weakPoints;
      if (carried !== undefined) {
        const partDef = getEnemyDef(carried.enemyId);
        for (let i = 0; i < carried.mounts.length; i += 1) {
          boss.parts.push(spawn(partDef, levelHp, spawnX, bossLane));
        }
      }
    }

    // Carried parts ride their carrier rather than walking, so they come into
    // engagement range with it. Without this they sit at the spawn line where
    // nothing can shoot them, and the carrier stays shielded for ever.
    for (const enemy of live) {
      if (enemy.parts.length === 0 || !enemy.isAlive) continue;
      for (const part of enemy.parts) {
        part.x = enemy.x;
      }
    }

    // Enemy movement, attacks and broods ---------------------------------
    for (const enemy of live) {
      const def = enemy.definition;
      if (def === null || !enemy.isAlive) continue;
      if (def.behaviors.includes('anchored')) continue;

      if (def.spawns !== undefined && enemy.spawnsRemaining > 0) {
        enemy.spawnTimer -= STEP;
        if (enemy.spawnTimer <= 0) {
          enemy.spawnTimer = def.spawns.interval;
          enemy.spawnsRemaining -= 1;
          spawn(getEnemyDef(def.spawns.enemyId), levelHp, enemy.x, rollLane());
        }
      }

      const range = def.attackRange ?? 0;
      const atMecha = range > 0 ? mechaX + range : mechaX + meleeStandoff;
      // An escort is only a wall while it stands closer than where they were
      // already heading, which is the rule Enemy.stopDistanceX applies.
      const blocker = blockerFor(enemy.lane);
      // An escort only blocks what would otherwise have come closer than it
      // stands. A ranged enemy halts further out and shoots straight past,
      // which is why escorts do not answer gunners, lancers or incinerators.
      const blocked = blocker !== null && blocker.blockX >= atMecha;
      const stopX = blocked ? (blocker as SimEscort).blockX : atMecha;

      if (enemy.x > stopX) {
        enemy.inRange = false;
        enemy.x = Math.max(stopX, enemy.x - def.speed * STEP);
        continue;
      }

      enemy.inRange = true;
      enemy.attackTimer += STEP;
      while (enemy.attackTimer >= def.attackInterval) {
        enemy.attackTimer -= def.attackInterval;

        // Whatever is holding this lane takes the hit instead of the hull.
        if (blocked && blocker !== null && blocker.isAlive) {
          blocker.hp -= def.damage;
          continue;
        }

        // A burner lights the ground instead of biting; the fire bills the
        // hull below for as long as it lasts, and outlives the enemy.
        if (def.burnZone !== undefined) {
          burns.push({ dps: def.burnZone.damagePerSecond, remaining: def.burnZone.duration });
          continue;
        }

        damageTaken += damage.applyToMecha(hull, def.damage);
      }
    }

    // Burning ground, billed once per step like the game bills it per frame.
    for (let i = burns.length - 1; i >= 0; i -= 1) {
      const burn = burns[i];
      const seconds = Math.min(STEP, burn.remaining);
      damageTaken += damage.applyToMecha(hull, burn.dps * seconds);
      burn.remaining -= STEP;
      if (burn.remaining <= 0) burns.splice(i, 1);
    }

    if (hull.hp <= 0) break;

    // Targeting: the same priority order the game uses -------------------
    const target = selectTarget(live, engageMaxX);

    // Firing --------------------------------------------------------------
    const dmgMult = mainBonus.damage + damageLevels * tuning.inBattleUpgrades.damage.bonusPerLevel;
    const rofMult =
      mainBonus.fireRate + fireRateLevels * tuning.inBattleUpgrades.fireRate.bonusPerLevel;
    const turretDmgMult = 1 + damageLevels * tuning.inBattleUpgrades.damage.bonusPerLevel;
    const turretRofMult = 1 + fireRateLevels * tuning.inBattleUpgrades.fireRate.bonusPerLevel;

    const mainInterval = 1 / (main.fireRate * rofMult);
    mainCooldown += STEP;
    if (target !== null) {
      while (mainCooldown >= mainInterval) {
        mainCooldown -= mainInterval;
        pushRounds(shots, target, main, main.baseDamage * dmgMult, mechaX, time, live, hitscanRange);
      }
    } else if (mainCooldown > mainInterval) {
      mainCooldown = mainInterval;
    }

    // Escort guns. They share the mecha's target, as EscortSystem does.
    for (const ally of allies) {
      if (!ally.isAlive) continue;
      const allyWeapon = getWeaponDef(ally.def.weaponId);
      const interval = 1 / allyWeapon.fireRate;
      ally.cooldown += STEP;
      if (target === null) {
        if (ally.cooldown > interval) ally.cooldown = interval;
        continue;
      }
      while (ally.cooldown >= interval) {
        ally.cooldown -= interval;
        pushRounds(
          shots,
          target,
          allyWeapon,
          allyWeapon.baseDamage * (ally.def.damageScale ?? 1),
          ally.blockX,
          time,
          live,
          hitscanRange,
        );
      }
    }

    const turretInterval = 1 / (turret.fireRate * turretRofMult);
    for (let i = 0; i < turretCooldowns.length; i += 1) {
      turretCooldowns[i] += STEP;
      if (target === null) {
        if (turretCooldowns[i] > turretInterval) turretCooldowns[i] = turretInterval;
        continue;
      }
      while (turretCooldowns[i] >= turretInterval) {
        turretCooldowns[i] -= turretInterval;
        pushRounds(
          shots,
          target,
          turret,
          turret.baseDamage * turretDmgMult,
          mechaX,
          time,
          live,
          hitscanRange,
        );
      }
    }

    // Impacts -------------------------------------------------------------
    for (let i = shots.length - 1; i >= 0; i -= 1) {
      const shot = shots[i];
      if (time < shot.impactAt) continue;
      shots.splice(i, 1);

      // A shell arriving at a corpse is simply wasted, as in the real game.
      if (!shot.target.isAlive) continue;

      const registerKill = (victim: SimEnemy): void => {
        kills += 1;
        const reward = victim.definition?.reward ?? 0;
        const payout = reward * (level.economy.rewardMultiplier ?? 1);
        scrap += payout;
        earned += payout;
      };

      const applyHit = (victim: SimEnemy): void => {
        const result = damage.applyToEnemy(victim, shot.damage, shot.weapon.damageType);
        if (result.killed) registerKill(victim);

        const dot = shot.weapon.projectile.dot;
        if (dot !== undefined && victim.isAlive) {
          victim.dots.push({
            dps: dot.dps,
            remaining: dot.duration,
            type: shot.weapon.damageType,
          });
        }
      };

      // A shield bearer's screen eats shots aimed at anything behind it, so
      // the shot lands on the bearer instead until its shield is gone.
      applyHit(screenFor(shot.target, live) ?? shot.target);

      // Explosive and chemical rounds splash, across lanes only as far as the
      // radius actually reaches.
      const aoe = shot.weapon.projectile.aoeRadius ?? 0;
      if (aoe > 0) {
        const impactX = shot.target.x;
        const impactY = laneY[shot.target.lane];
        for (const other of live) {
          if (other === shot.target || !other.isAlive) continue;
          const dx = other.x - impactX;
          const dy = laneY[other.lane] - impactY;
          if (dx * dx + dy * dy <= aoe * aoe) applyHit(other);
        }
      }
    }

    // Damage over time pools --------------------------------------------
    for (const enemy of live) {
      if (enemy.dots.length === 0 || !enemy.isAlive) continue;
      for (let i = enemy.dots.length - 1; i >= 0; i -= 1) {
        const dot = enemy.dots[i];
        const result = damage.applyToEnemy(enemy, dot.dps * STEP, dot.type);
        if (result.killed) {
          kills += 1;
          const reward = enemy.definition?.reward ?? 0;
          const payout = reward * (level.economy.rewardMultiplier ?? 1);
          scrap += payout;
          earned += payout;
        }
        dot.remaining -= STEP;
        if (dot.remaining <= 0) enemy.dots.splice(i, 1);
      }
    }

    // Trickle and cleanup --------------------------------------------------
    const income = level.economy.trickle * STEP;
    scrap += income;
    earned += income;

    // In battle spending. A real player does this constantly, and it is a large
    // compounding multiplier, so leaving it out makes every level look harder
    // than it plays. Policy: repair when badly hurt, otherwise keep damage and
    // fire rate roughly level with each other.
    if (options.spend) {
      const config = tuning.inBattleUpgrades;
      const repairCost = Math.round(
        config.repair.baseCost * Math.pow(config.repair.costGrowth, repairsBought),
      );
      if (hull.hp < hullMax * 0.4 && scrap >= repairCost) {
        scrap -= repairCost;
        repairsBought += 1;
        hull.hp = Math.min(hullMax, hull.hp + hullMax * config.repair.healFraction);
      }

      // Escorts first when a lane is unheld and one is affordable: a real
      // player buys them to take a wave off the hull, and the sim ignoring
      // that made every level look harder than it plays.
      if (options.escorts && allies.filter((ally) => ally.isAlive).length < laneY.length) {
        for (const escortDef of escortDefs) {
          const owned = escortsBought.get(escortDef.id) ?? 0;
          const cost = Math.round(escortDef.cost * Math.pow(escortDef.costGrowth, owned));
          if (scrap < cost) continue;
          scrap -= cost;
          escortsBought.set(escortDef.id, owned + 1);
          const lane = nextEscortLane % laneY.length;
          nextEscortLane += 1;
          allies.push(new SimEscort(getEscortDef(escortDef.id), lane, mechaX + escortDef.standoffX));
          break;
        }
      }

      const damageCost = Math.round(
        config.damage.baseCost * Math.pow(config.damage.costGrowth, damageLevels),
      );
      const fireRateCost = Math.round(
        config.fireRate.baseCost * Math.pow(config.fireRate.costGrowth, fireRateLevels),
      );
      if (damageLevels <= fireRateLevels && scrap >= damageCost) {
        scrap -= damageCost;
        damageLevels += 1;
      } else if (scrap >= fireRateCost) {
        scrap -= fireRateCost;
        fireRateLevels += 1;
      }
    }

    for (let i = live.length - 1; i >= 0; i -= 1) {
      if (!live[i].isAlive) live.splice(i, 1);
    }
    for (let i = allies.length - 1; i >= 0; i -= 1) {
      if (!allies[i].isAlive) allies.splice(i, 1);
    }

    const timelineDone = waves.every((wave) => wave.spawned >= wave.entry.count) && bossSpawned;
    if (timelineDone && live.length === 0) {
      cleared = true;
      break;
    }
  }

  leaked = live.filter((enemy) => enemy.inRange).length;
  // Surviving the clock with the field still full is a stall, not a victory.
  // Scoring it as a win hid a boss that simply could not be chewed through.
  const stalled = !cleared && hull.hp > 0;
  const won = hull.hp > 0 && cleared;
  const hullFraction = hullMax <= 0 ? 0 : hull.hp / hullMax;

  return {
    levelId: level.id,
    levelName: level.name,
    won,
    stalled,
    clearSeconds: time,
    damageTaken,
    hullRemaining: hull.hp,
    hullMax,
    scrapEarned: Math.floor(earned),
    kills,
    leaked,
    stars: evaluateStars(level, won, hullFraction, repairsBought),
    damageLevels,
    fireRateLevels,
    repairsBought,
  };
}

/** How wide a target is, from the same numbers the art generator sizes it with. */
function targetWidth(target: SimEnemy): number {
  const def = target.definition;
  if (def === null) return 1;
  return tuning.world.enemyBaseSize[def.armorClass].width * def.scale;
}

/**
 * A trigger pull: one round for most weapons, a fan of them for a scattergun.
 * Each pellet carries full damage, and only the ones still inside the target
 * at that range land, which is the whole trade the weapon makes.
 */
function pushRounds(
  shots: Shot[],
  target: SimEnemy,
  weapon: WeaponDef,
  damageAmount: number,
  fromX: number,
  now: number,
  live: SimEnemy[],
  hitscanRange: number,
): void {
  // A piercing beam does not stop at the first body: everything in that lane
  // within reach takes the hit, which is the whole reason to own a Railgun.
  if (weapon.projectile.pierce === true && weapon.projectile.kind === 'hitscan') {
    const maxX = fromX + hitscanRange;
    for (const enemy of live) {
      if (!enemy.isAlive || enemy.lane !== target.lane) continue;
      if (enemy.x < fromX || enemy.x > maxX) continue;
      shots.push(makeShot(enemy, weapon, damageAmount, fromX, now));
    }
    return;
  }

  const pellets = weapon.projectile.pellets ?? 1;
  if (pellets <= 1) {
    shots.push(makeShot(target, weapon, damageAmount, fromX, now));
    return;
  }

  const halfAngle = ((weapon.projectile.spreadDegrees ?? 0) * Math.PI) / 180;
  const distance = Math.abs(target.x - fromX);
  const reach = targetWidth(target) * 0.5;

  for (let i = 0; i < pellets; i += 1) {
    const t = (i / (pellets - 1)) * 2 - 1;
    // Lateral miss distance of this pellet at the target's range.
    const offset = Math.abs(Math.tan(t * halfAngle) * distance);
    if (offset > reach) continue;
    shots.push(makeShot(target, weapon, damageAmount, fromX, now));
  }
}

function makeShot(
  target: SimEnemy,
  weapon: WeaponDef,
  damageAmount: number,
  fromX: number,
  now: number,
): Shot {
  const speed = weapon.projectile.speed;
  const distance = Math.abs(target.x - fromX);
  const travel = speed > 0 ? distance / speed : 0;
  return { target, impactAt: now + travel, damage: damageAmount, weapon };
}

/** tuning.targeting.priorityOrder, minus the focus target the sim never sets. */
/**
 * The nearest living barrier bearer standing between the mecha and `target`,
 * or null when the shot has a clear line.
 */
function screenFor(target: SimEnemy, live: SimEnemy[]): SimEnemy | null {
  let screen: SimEnemy | null = null;

  for (const enemy of live) {
    if (enemy === target || !enemy.isAlive || enemy.shield <= 0) continue;
    if (enemy.lane !== target.lane) continue;
    if (enemy.definition?.barrier === undefined) continue;
    if (enemy.x >= target.x) continue;
    if (screen === null || enemy.x > screen.x) screen = enemy;
  }

  return screen;
}

function selectTarget(live: SimEnemy[], engageMaxX: number): SimEnemy | null {
  let rangedInRange: SimEnemy | null = null;
  let closest: SimEnemy | null = null;

  for (const enemy of live) {
    const def = enemy.definition;
    if (def === null || !enemy.isAlive || enemy.x > engageMaxX) continue;

    if (enemy.inRange && def.behaviors.includes('ranged') && (def.attackRange ?? 0) > 0) {
      if (rangedInRange === null || enemy.x < rangedInRange.x) rangedInRange = enemy;
    }
    if (closest === null || enemy.x < closest.x) closest = enemy;
  }

  return rangedInRange ?? closest;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const allLevels = loadLevels();
  registerLevels(allLevels);

  const selected = options.levelId
    ? allLevels.filter((level) => level.id === options.levelId)
    : allLevels;

  if (selected.length === 0) {
    console.error(`No level matched "${options.levelId}".`);
    process.exitCode = 1;
    return;
  }

  const damage = new DamageSystem();

  console.log(
    `Scrap Titan balance sim\n` +
      `  main ${options.weaponId} cards ${options.cards}, ` +
      `turret ${options.turretId} x${options.mounts}, hull level ${options.hullLevel}\n` +
      `  escorts ${options.escorts ? 'bought' : 'off'}, seed ${options.seed}\n` +
      `  ${enemies.length} enemy defs, ${selected.length} level(s)\n`,
  );

  const header = [
    'level'.padEnd(9),
    'name'.padEnd(22),
    'result'.padEnd(7),
    'time'.padStart(7),
    'taken'.padStart(8),
    'hull'.padStart(11),
    'scrap'.padStart(7),
    'kills'.padStart(6),
    'stars'.padStart(6),
    'buys'.padStart(9),
  ].join(' ');
  console.log(header);
  console.log('-'.repeat(header.length));

  let failures = 0;
  let stalls = 0;

  for (const level of selected) {
    const report = simulateLevel(level, options, damage);
    if (!report.won) failures += 1;
    if (report.stalled) stalls += 1;

    console.log(
      [
        report.levelId.padEnd(9),
        report.levelName.slice(0, 22).padEnd(22),
        (report.won ? 'WIN' : report.stalled ? 'STALL' : 'LOSS').padEnd(7),
        `${report.clearSeconds.toFixed(1)}s`.padStart(7),
        Math.round(report.damageTaken).toString().padStart(8),
        `${Math.round(report.hullRemaining)}/${report.hullMax}`.padStart(11),
        report.scrapEarned.toString().padStart(7),
        report.kills.toString().padStart(6),
        report.stars.toString().padStart(6),
        `d${report.damageLevels}/r${report.fireRateLevels}/h${report.repairsBought}`.padStart(9),
      ].join(' '),
    );

    if (options.verbose && report.leaked > 0) {
      console.log(`           ${report.leaked} enemy(s) still chewing on the hull at the end`);
    }
  }

  console.log(
    `\n${selected.length - failures} / ${selected.length} cleared` +
      (failures > 0 ? `, ${failures} loss(es)` : '') +
      (stalls > 0 ? `, ${stalls} of those a stall at the ${MAX_SECONDS}s cap` : ''),
  );
}

main();
