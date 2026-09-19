import Phaser from 'phaser';

import { getEnemyDef, tuning } from '../data';
import { Enemy, type EnemyUpdateContext } from '../entities/Enemy';
import type { LevelDef, WaveEntry } from '../types';
import { Pool } from './Pool';

/**
 * Reads a LevelDef's wave timeline and owns the enemy lifecycle: the pool, the
 * live list, movement updates and recycling. Authoring a new level is a JSON
 * file and nothing else (hard rule 1).
 *
 * Boss blocks are read but not spawned yet: the Boss entity is Phase 2.
 */

/** One timeline entry's live state. Built once, never allocated during update. */
interface WaveRuntime {
  readonly entry: WaveEntry;
  readonly hpMultiplier: number;
  spawned: number;
  nextSpawnTime: number;
}

export interface WaveSpawnerOptions {
  readonly scene: Phaser.Scene;
  readonly level: LevelDef;
  /** Lane centres in world pixels, derived from tuning.mecha.lanesY. */
  readonly laneY: readonly number[];
  readonly spawnX: number;
  readonly mechaX: number;
  readonly onEnemyAttack: (enemy: Enemy) => void;
}

export class WaveSpawner {
  private readonly pool: Pool<Enemy>;
  private readonly waves: WaveRuntime[] = [];
  private readonly laneY: readonly number[];
  private readonly spawnX: number;
  private readonly levelHpMultiplier: number;
  private readonly updateContext: EnemyUpdateContext;
  private readonly lastSpawnTime: number;

  private elapsed = 0;

  constructor(options: WaveSpawnerOptions) {
    const { scene, level, laneY, spawnX, mechaX, onEnemyAttack } = options;

    this.laneY = laneY;
    this.spawnX = spawnX;
    this.levelHpMultiplier = level.hpMultiplier ?? 1;

    this.pool = new Pool<Enemy>(tuning.pools.enemies, () => new Enemy(scene));

    for (const entry of level.waves) {
      this.waves.push({
        entry,
        hpMultiplier: this.levelHpMultiplier * (entry.hpMultiplier ?? 1),
        spawned: 0,
        nextSpawnTime: entry.time,
      });
    }

    this.lastSpawnTime = this.waves.reduce((latest, wave) => {
      const finish = wave.entry.time + wave.entry.interval * Math.max(0, wave.entry.count - 1);
      return Math.max(latest, finish);
    }, 0);

    this.updateContext = {
      mechaX,
      meleeStandoff: tuning.world.meleeStandoff,
      onAttack: onEnemyAttack,
    };
  }

  get activeEnemies(): readonly Enemy[] {
    return this.pool.active;
  }

  get aliveCount(): number {
    return this.pool.activeCount;
  }

  /** True once every timeline entry has spawned its full count. */
  get isTimelineComplete(): boolean {
    for (const wave of this.waves) {
      if (wave.spawned < wave.entry.count) return false;
    }
    return true;
  }

  /** Wave progress for the HUD bar, 0 to 1 across the spawn timeline. */
  get progress(): number {
    if (this.lastSpawnTime <= 0) return 1;
    return Phaser.Math.Clamp(this.elapsed / this.lastSpawnTime, 0, 1);
  }

  get elapsedSeconds(): number {
    return this.elapsed;
  }

  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;
    this.spawnDueEnemies();

    const enemies = this.pool.active;
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      enemies[i].update(deltaSeconds, this.updateContext);
    }
  }

  private spawnDueEnemies(): void {
    for (const wave of this.waves) {
      const { entry } = wave;
      // A long frame can owe several spawns; catch all of them up this tick.
      while (wave.spawned < entry.count && this.elapsed >= wave.nextSpawnTime) {
        this.spawnOne(entry, wave.hpMultiplier);
        wave.spawned += 1;
        wave.nextSpawnTime += entry.interval;
      }
    }
  }

  private spawnOne(entry: WaveEntry, hpMultiplier: number): void {
    const enemy = this.pool.obtain();
    // Pool exhausted: skip rather than allocate mid frame (hard rule 2).
    if (enemy === null) return;

    const def = getEnemyDef(entry.enemyId);
    const laneIndex =
      entry.lane !== undefined
        ? Phaser.Math.Clamp(entry.lane, 0, this.laneY.length - 1)
        : Phaser.Math.RND.between(0, this.laneY.length - 1);

    enemy.spawn(def, this.spawnX, this.laneY[laneIndex], laneIndex, hpMultiplier);
  }

  despawn(enemy: Enemy): void {
    enemy.deactivate();
    this.pool.release(enemy);
  }

  despawnAll(): void {
    const enemies = this.pool.active;
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      enemies[i].deactivate();
    }
    this.pool.releaseAll();
  }
}
