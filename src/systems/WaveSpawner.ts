import Phaser from 'phaser';

import { getEnemyDef, tuning } from '../data';
import { Boss } from '../entities/Boss';
import { Enemy, type EnemyUpdateContext } from '../entities/Enemy';
import type { LevelDef, WaveEntry } from '../types';
import { Pool } from './Pool';

/**
 * Reads a LevelDef's wave timeline and owns the enemy lifecycle: the pool, the
 * live list, movement updates and recycling. Authoring a new level is a JSON
 * file and nothing else (hard rule 1).
 *
 * The boss sits outside the pool (there is only ever one) but is kept in the
 * same live list, so targeting, projectiles and the win check treat it like any
 * other enemy without special cases.
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
  readonly onBossSpawned: (boss: Boss) => void;
  /** Escort held lanes; enemies stop at the escort rather than the hull. */
  readonly blockXFor: (lane: number) => number | null;
}

export class WaveSpawner {
  private readonly pool: Pool<Enemy>;
  private readonly waves: WaveRuntime[] = [];
  private readonly laneY: readonly number[];
  private readonly spawnX: number;
  private readonly levelHpMultiplier: number;
  private readonly updateContext: EnemyUpdateContext;
  private readonly lastSpawnTime: number;
  private readonly onBossSpawned: (boss: Boss) => void;

  /** Everything alive right now, pooled trash and the boss alike. */
  private readonly live: Enemy[] = [];

  private readonly bossEntry: LevelDef['boss'] | undefined;
  private readonly boss: Boss | null;
  private bossSpawned = false;

  private elapsed = 0;

  constructor(options: WaveSpawnerOptions) {
    const { scene, level, laneY, spawnX, mechaX, onEnemyAttack, onBossSpawned, blockXFor } =
      options;

    this.laneY = laneY;
    this.spawnX = spawnX;
    this.levelHpMultiplier = level.hpMultiplier ?? 1;
    this.onBossSpawned = onBossSpawned;

    this.pool = new Pool<Enemy>(tuning.pools.enemies, () => new Enemy(scene));

    for (const entry of level.waves) {
      this.waves.push({
        entry,
        hpMultiplier: this.levelHpMultiplier * (entry.hpMultiplier ?? 1),
        spawned: 0,
        nextSpawnTime: entry.time,
      });
    }

    this.bossEntry = level.boss;
    // Built up front, never during the fight.
    this.boss = this.bossEntry ? new Boss(scene) : null;

    const lastWave = this.waves.reduce((latest, wave) => {
      const finish = wave.entry.time + wave.entry.interval * Math.max(0, wave.entry.count - 1);
      return Math.max(latest, finish);
    }, 0);
    this.lastSpawnTime = Math.max(lastWave, this.bossEntry?.time ?? 0);

    this.updateContext = {
      mechaX,
      meleeStandoff: tuning.world.meleeStandoff,
      onAttack: onEnemyAttack,
      onSpawnRequest: (parent, enemyId) => this.spawnFromParent(parent, enemyId),
      blockXFor,
    };
  }

  get activeEnemies(): readonly Enemy[] {
    return this.live;
  }

  get aliveCount(): number {
    return this.live.length;
  }

  get activeBoss(): Boss | null {
    return this.boss !== null && this.boss.isAlive ? this.boss : null;
  }

  get hasBoss(): boolean {
    return this.bossEntry !== undefined;
  }

  /** True once every timeline entry, and the boss if there is one, has spawned. */
  get isTimelineComplete(): boolean {
    for (const wave of this.waves) {
      if (wave.spawned < wave.entry.count) return false;
    }
    return this.bossEntry === undefined || this.bossSpawned;
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
    this.spawnBossIfDue();

    for (let i = this.live.length - 1; i >= 0; i -= 1) {
      this.live[i].update(deltaSeconds, this.updateContext);
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

    this.placeAndTrack(enemy, def, laneIndex, hpMultiplier, this.spawnXFor(def));
  }

  /**
   * A spawner enemy emitting its brood. They appear beside the parent rather
   * than at the spawn line, which is the point of a spawner.
   */
  private spawnFromParent(parent: Enemy, enemyId: string): void {
    const enemy = this.pool.obtain();
    if (enemy === null) return;

    const def = getEnemyDef(enemyId);
    const laneIndex = Phaser.Math.RND.between(0, this.laneY.length - 1);
    this.placeAndTrack(enemy, def, laneIndex, this.levelHpMultiplier, parent.x);
  }

  private placeAndTrack(
    enemy: Enemy,
    def: ReturnType<typeof getEnemyDef>,
    laneIndex: number,
    hpMultiplier: number,
    x: number,
  ): void {
    // Flyers ride above their lane so they read as airborne.
    const y = this.laneY[laneIndex] - (def.flying ? tuning.world.flyingYOffset : 0);
    enemy.spawn(def, x, y, laneIndex, hpMultiplier);
    this.live.push(enemy);
  }

  /** The `burrow` behaviour erupts mid field instead of walking in from the right. */
  private spawnXFor(def: ReturnType<typeof getEnemyDef>): number {
    if (!def.behaviors.includes('burrow')) return this.spawnX;
    return tuning.world.baseWidth * tuning.world.burrowSpawnXFraction;
  }

  private spawnBossIfDue(): void {
    const entry = this.bossEntry;
    const boss = this.boss;
    if (entry === undefined || boss === null || this.bossSpawned) return;
    if (this.elapsed < entry.time) return;

    const def = getEnemyDef(entry.enemyId);
    // Bosses walk the middle lane so they read as the centre of the fight.
    const laneIndex = Math.floor(this.laneY.length / 2);

    this.placeAndTrack(
      boss,
      def,
      laneIndex,
      this.levelHpMultiplier * (entry.hpMultiplier ?? 1),
      this.spawnX,
    );
    this.bossSpawned = true;
    this.onBossSpawned(boss);
  }

  despawn(enemy: Enemy): void {
    enemy.deactivate();
    this.removeFromLive(enemy);
    // The boss is a singleton, not a pool member.
    if (enemy !== this.boss) {
      this.pool.release(enemy);
    }
  }

  private removeFromLive(enemy: Enemy): void {
    const index = this.live.indexOf(enemy);
    if (index < 0) return;
    this.live[index] = this.live[this.live.length - 1];
    this.live.pop();
  }

  despawnAll(): void {
    for (let i = this.live.length - 1; i >= 0; i -= 1) {
      this.live[i].deactivate();
    }
    this.live.length = 0;
    this.pool.releaseAll();
  }
}
