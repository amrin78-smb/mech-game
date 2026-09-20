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
 * Known gaps, which make it conservative rather than optimistic for the
 * weapons concerned: piercing is not modelled, so the Railgun scores as if it
 * hit one target per shot, and lobbed arcs fly straight.
 *
 * Barriers are modelled, but the field here is one dimensional, so a shield
 * bearer screens every enemy behind it rather than only its own lane. That
 * overstates the screen, which again errs toward a harder rating than the game
 * actually gives.
 *
 * Burn zones are modelled as overlapping pools on the hull, exactly as the game
 * stacks them, since a fire that outlives its owner changes how much a slow
 * answer to an incinerator costs.
 *
 * Usage:
 *   npm run sim
 *   npm run sim -- --weapon=railgun --cards=2 --mounts=2 --hull=3
 *   npm run sim -- --level=level-10 --verbose
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { enemies, getEnemyDef, getWeaponDef, registerLevels, tuning } from '../src/data/core';
import { DamageSystem, type DamageTarget } from '../src/systems/DamageSystem';
import { evaluateStars } from '../src/systems/StarRating';
import type { EnemyDef, LevelDef, WeaponDef } from '../src/types';

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

/** The sim's stand-in for Enemy: the same contract DamageSystem needs. */
class SimEnemy implements DamageTarget {
  definition: EnemyDef | null;
  hp: number;
  shield: number;
  x: number;
  attackTimer = 0;
  inRange = false;
  spawnsRemaining: number;
  spawnTimer: number;
  /** Active damage over time pools left by chemical rounds. */
  dots: Array<{ dps: number; remaining: number; type: WeaponDef['damageType'] }> = [];

  constructor(def: EnemyDef, x: number, hpMultiplier: number) {
    this.definition = def;
    this.hp = def.hp * hpMultiplier;
    this.shield = def.behaviors.includes('shielded') ? (def.shieldHp ?? 0) * hpMultiplier : 0;
    this.x = x;
    this.spawnsRemaining = def.spawns?.count ?? 0;
    this.spawnTimer = def.spawns?.interval ?? 0;
  }

  get isAlive(): boolean {
    return this.hp > 0;
  }

  get hasShield(): boolean {
    return this.shield > 0;
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
  const live: SimEnemy[] = [];
  const shots: Shot[] = [];

  let scrap = level.economy.startingScrap;
  let earned = 0;
  let kills = 0;
  let leaked = 0;
  let damageTaken = 0;
  /** Burning ground left by burner enemies; each pool outlives its owner. */
  const burns: Array<{ dps: number; remaining: number }> = [];
  let time = 0;

  // Cooldowns start full so the first target is engaged immediately.
  let damageLevels = 0;
  let fireRateLevels = 0;
  let repairsBought = 0;

  let mainCooldown = 1 / (main.fireRate * mainBonus.fireRate);
  const turretCooldowns = new Array<number>(Math.max(0, options.mounts)).fill(
    1 / turret.fireRate,
  );

  const spawn = (def: EnemyDef, hpMultiplier: number, x: number): void => {
    live.push(new SimEnemy(def, x, hpMultiplier));
  };

  while (time < MAX_SECONDS) {
    time += STEP;

    // Spawns -------------------------------------------------------------
    for (const wave of waves) {
      while (wave.spawned < wave.entry.count && time >= wave.nextSpawnTime) {
        const def = getEnemyDef(wave.entry.enemyId);
        spawn(
          def,
          wave.hpMultiplier,
          def.behaviors.includes('burrow') ? baseWidth * burrowSpawnXFraction : spawnX,
        );
        wave.spawned += 1;
        wave.nextSpawnTime += wave.entry.interval;
      }
    }
    if (!bossSpawned && level.boss !== undefined && time >= level.boss.time) {
      spawn(getEnemyDef(level.boss.enemyId), levelHp * (level.boss.hpMultiplier ?? 1), spawnX);
      bossSpawned = true;
    }

    // Enemy movement, attacks and broods ---------------------------------
    for (const enemy of live) {
      const def = enemy.definition;
      if (def === null || !enemy.isAlive) continue;

      if (def.spawns !== undefined && enemy.spawnsRemaining > 0) {
        enemy.spawnTimer -= STEP;
        if (enemy.spawnTimer <= 0) {
          enemy.spawnTimer = def.spawns.interval;
          enemy.spawnsRemaining -= 1;
          spawn(getEnemyDef(def.spawns.enemyId), levelHp, enemy.x);
        }
      }

      const range = def.attackRange ?? 0;
      const stopX = range > 0 ? mechaX + range : mechaX + meleeStandoff;

      if (enemy.x > stopX) {
        enemy.inRange = false;
        enemy.x = Math.max(stopX, enemy.x - def.speed * STEP);
        continue;
      }

      enemy.inRange = true;
      enemy.attackTimer += STEP;
      while (enemy.attackTimer >= def.attackInterval) {
        enemy.attackTimer -= def.attackInterval;

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
        shots.push(makeShot(target, main, main.baseDamage * dmgMult, mechaX, time));
      }
    } else if (mainCooldown > mainInterval) {
      mainCooldown = mainInterval;
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
        shots.push(makeShot(target, turret, turret.baseDamage * turretDmgMult, mechaX, time));
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

      // Explosive and chemical rounds splash. Lanes are ignored, so this is a
      // slight overestimate of how many neighbours a blast catches.
      const aoe = shot.weapon.projectile.aoeRadius ?? 0;
      if (aoe > 0) {
        const impactX = shot.target.x;
        for (const other of live) {
          if (other === shot.target || !other.isAlive) continue;
          if (Math.abs(other.x - impactX) <= aoe) applyHit(other);
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

    const timelineDone = waves.every((wave) => wave.spawned >= wave.entry.count) && bossSpawned;
    if (timelineDone && live.length === 0) break;
  }

  leaked = live.filter((enemy) => enemy.inRange).length;
  const won = hull.hp > 0;
  const hullFraction = hullMax <= 0 ? 0 : hull.hp / hullMax;

  return {
    levelId: level.id,
    levelName: level.name,
    won,
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

  for (const level of selected) {
    const report = simulateLevel(level, options, damage);
    if (!report.won) failures += 1;

    console.log(
      [
        report.levelId.padEnd(9),
        report.levelName.slice(0, 22).padEnd(22),
        (report.won ? 'WIN' : 'LOSS').padEnd(7),
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
      (failures > 0 ? `, ${failures} loss(es)` : ''),
  );
}

main();
