import Phaser from 'phaser';

import { tuning } from '../data';
import type { Enemy } from '../entities/Enemy';
import { Projectile, type ProjectileSpec } from '../entities/Projectile';
import type { DamageResult, DamageSystem } from './DamageSystem';
import { Pool } from './Pool';

/**
 * Owns the one shell pool shared by the main cannon and every turret mount, and
 * resolves impacts, because that is where shells die. Weapons ask it to fire;
 * they never touch the pool themselves.
 *
 * Explosive rounds (the flak turret) splash: the direct hit takes full damage
 * and everything inside aoeRadius takes it too, each through DamageSystem so
 * the armor matrix still decides the number.
 */
export interface ProjectileSystemOptions {
  readonly scene: Phaser.Scene;
  readonly damage: DamageSystem;
  readonly onEnemyKilled: (enemy: Enemy) => void;
  readonly onEnemyHit: (enemy: Enemy, result: DamageResult) => void;
  /** heavy drives the bigger impact burst: manual shots, blasts and beams. */
  readonly onImpact: (x: number, y: number, heavy: boolean, hitSomething: boolean) => void;
}

export class ProjectileSystem {
  private readonly pool: Pool<Projectile>;
  private readonly damage: DamageSystem;
  private readonly onEnemyKilled: (enemy: Enemy) => void;
  private readonly onEnemyHit: (enemy: Enemy, result: DamageResult) => void;
  private readonly onImpact: (x: number, y: number, heavy: boolean, hitSomething: boolean) => void;

  private readonly minX: number;
  private readonly maxX: number;
  private readonly maxY: number;

  /** Reused between frames: splash victims are collected without allocating. */
  private readonly splashVictims: Enemy[] = [];

  constructor(options: ProjectileSystemOptions) {
    this.damage = options.damage;
    this.onEnemyKilled = options.onEnemyKilled;
    this.onEnemyHit = options.onEnemyHit;
    this.onImpact = options.onImpact;

    const { baseWidth, baseHeight, despawnXFraction, spawnXFraction } = tuning.world;
    this.minX = baseWidth * despawnXFraction;
    this.maxX = baseWidth * (spawnXFraction + 0.1);
    this.maxY = baseHeight;

    this.pool = new Pool<Projectile>(
      tuning.pools.projectiles,
      () => new Projectile(options.scene),
    );
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }

  /**
   * A hitscan weapon (the Railgun) resolves along its aim ray the instant it
   * fires, rather than launching a shell. With `pierce` it keeps going through
   * everything on the line, which is the whole reason to own one.
   *
   * Returns the distance to the furthest thing hit, so the beam can be drawn to
   * where it actually stopped, or the full range when it hit nothing.
   */
  fireHitscan(
    x: number,
    y: number,
    rotation: number,
    spec: ProjectileSpec,
    enemies: readonly Enemy[],
    maxRange: number,
  ): number {
    const dirX = Math.cos(rotation);
    const dirY = Math.sin(rotation);
    const shellRadius = tuning.world.projectileRadius;

    this.splashVictims.length = 0;

    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;

      // Project the enemy onto the ray; behind the muzzle does not count.
      // interceptX is the barrier when one is up, so a screen eats the beam.
      const toX = enemy.interceptX - x;
      const toY = enemy.centerY - y;
      const along = toX * dirX + toY * dirY;
      if (along < 0 || along > maxRange) continue;

      // Perpendicular distance from the ray to the enemy centre.
      const perpX = toX - dirX * along;
      const perpY = toY - dirY * along;
      const reach = enemy.interceptRadius + shellRadius;
      if (perpX * perpX + perpY * perpY > reach * reach) continue;

      this.splashVictims.push(enemy);
    }

    if (this.splashVictims.length === 0) {
      return maxRange;
    }

    // Nearest first, so a non piercing shot stops at the right target.
    this.splashVictims.sort((a, b) => {
      const da = (a.interceptX - x) * dirX + (a.centerY - y) * dirY;
      const db = (b.interceptX - x) * dirX + (b.centerY - y) * dirY;
      return da - db;
    });

    const pierce = spec.pierce === true;
    const victims = pierce ? this.splashVictims : this.splashVictims.slice(0, 1);
    let furthest = 0;

    for (const victim of victims) {
      const along = (victim.interceptX - x) * dirX + (victim.centerY - y) * dirY;
      furthest = Math.max(furthest, along);
      this.applyTo(victim, spec.damage, spec.damageType, spec.isManualShot);
    }

    this.splashVictims.length = 0;
    return pierce ? maxRange : furthest;
  }

  /** Returns false when the pool is dry, so the caller can skip its muzzle VFX. */
  fire(x: number, y: number, rotation: number, spec: ProjectileSpec): boolean {
    const projectile = this.pool.obtain();
    // Pool exhausted: drop the shot rather than allocate mid frame (hard rule 2).
    if (projectile === null) return false;
    projectile.fire(x, y, rotation, spec);
    return true;
  }

  update(deltaSeconds: number, enemies: readonly Enemy[]): void {
    const active = this.pool.active;
    const shellRadius = tuning.world.projectileRadius;

    for (let i = active.length - 1; i >= 0; i -= 1) {
      const projectile = active[i];
      const alive = projectile.advance(deltaSeconds);

      if (
        !alive ||
        projectile.x < this.minX ||
        projectile.x > this.maxX ||
        projectile.y < 0 ||
        projectile.y > this.maxY
      ) {
        // A timed out explosive round still goes off where it died.
        if (!alive && projectile.aoeRadius > 0) {
          this.onImpact(projectile.x, projectile.y, true, false);
        }
        this.recycle(projectile);
        continue;
      }

      const hit = this.findHit(projectile, enemies, shellRadius);
      if (hit === null) continue;

      const impactX = projectile.x;
      const impactY = projectile.y;
      this.resolveHit(projectile, hit, enemies);
      this.onImpact(impactX, impactY, projectile.isManualShot || projectile.aoeRadius > 0, true);
      this.recycle(projectile);
    }
  }

  private resolveHit(projectile: Projectile, hit: Enemy, enemies: readonly Enemy[]): void {
    this.applyTo(hit, projectile.damage, projectile.damageType, projectile.isManualShot);

    if (projectile.aoeRadius <= 0) return;

    // Collect first, then apply: killing inside the scan would mutate the list.
    this.splashVictims.length = 0;
    const radiusSq = projectile.aoeRadius * projectile.aoeRadius;
    for (const enemy of enemies) {
      if (enemy === hit || !enemy.isAlive) continue;
      const dx = enemy.x - projectile.x;
      const dy = enemy.centerY - projectile.y;
      if (dx * dx + dy * dy <= radiusSq) {
        this.splashVictims.push(enemy);
      }
    }
    for (const victim of this.splashVictims) {
      this.applyTo(victim, projectile.damage, projectile.damageType, projectile.isManualShot);
    }
    this.splashVictims.length = 0;
  }

  private applyTo(
    enemy: Enemy,
    damageAmount: number,
    damageType: Projectile['damageType'],
    _isManual: boolean,
  ): void {
    const result = this.damage.applyToEnemy(enemy, damageAmount, damageType);
    this.onEnemyHit(enemy, result);
    if (result.killed) {
      this.onEnemyKilled(enemy);
    }
  }

  private findHit(
    projectile: Projectile,
    enemies: readonly Enemy[],
    shellRadius: number,
  ): Enemy | null {
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      // A raised barrier is what the shell meets, which is how a shield bearer
      // screens the enemies sheltering behind it.
      const dx = enemy.interceptX - projectile.x;
      const dy = enemy.centerY - projectile.y;
      const reach = enemy.interceptRadius + shellRadius;
      if (dx * dx + dy * dy <= reach * reach) return enemy;
    }
    return null;
  }

  private recycle(projectile: Projectile): void {
    projectile.deactivate();
    this.pool.release(projectile);
  }

  reset(): void {
    const active = this.pool.active;
    for (let i = active.length - 1; i >= 0; i -= 1) {
      active[i].deactivate();
    }
    this.pool.releaseAll();
  }
}
