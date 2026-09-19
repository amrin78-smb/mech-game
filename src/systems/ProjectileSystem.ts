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
  readonly onEnemyHit: (enemy: Enemy, result: DamageResult, projectile: Projectile) => void;
  readonly onImpact: (x: number, y: number, projectile: Projectile, hitSomething: boolean) => void;
}

export class ProjectileSystem {
  private readonly pool: Pool<Projectile>;
  private readonly damage: DamageSystem;
  private readonly onEnemyKilled: (enemy: Enemy) => void;
  private readonly onEnemyHit: (enemy: Enemy, result: DamageResult, projectile: Projectile) => void;
  private readonly onImpact: (
    x: number,
    y: number,
    projectile: Projectile,
    hitSomething: boolean,
  ) => void;

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
          this.onImpact(projectile.x, projectile.y, projectile, false);
        }
        this.recycle(projectile);
        continue;
      }

      const hit = this.findHit(projectile, enemies, shellRadius);
      if (hit === null) continue;

      const impactX = projectile.x;
      const impactY = projectile.y;
      this.resolveHit(projectile, hit, enemies);
      this.onImpact(impactX, impactY, projectile, true);
      this.recycle(projectile);
    }
  }

  private resolveHit(projectile: Projectile, hit: Enemy, enemies: readonly Enemy[]): void {
    this.applyTo(hit, projectile);

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
      this.applyTo(victim, projectile);
    }
    this.splashVictims.length = 0;
  }

  private applyTo(enemy: Enemy, projectile: Projectile): void {
    const result = this.damage.applyToEnemy(enemy, projectile.damage, projectile.damageType);
    this.onEnemyHit(enemy, result, projectile);
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
      const dx = enemy.x - projectile.x;
      const dy = enemy.centerY - projectile.y;
      const reach = enemy.radius + shellRadius;
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
