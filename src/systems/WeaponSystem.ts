import Phaser from 'phaser';

import { getWeaponDef, tuning } from '../data';
import type { Enemy } from '../entities/Enemy';
import type { Mecha } from '../entities/Mecha';
import { Projectile } from '../entities/Projectile';
import type { WeaponDef } from '../types';
import type { DamageResult, DamageSystem } from './DamageSystem';
import { Pool } from './Pool';
import type { TargetingSystem } from './TargetingSystem';

/**
 * The main cannon, exactly as hard rule 9 describes it.
 *
 * Auto fire is the default: the barrel tracks whatever TargetingSystem picks and
 * shoots at the weapon's fireRate. A pointer drag takes manual control at any
 * moment, which pauses auto fire and shows an aim line; releasing fires one
 * precision shot at tuning.targeting.manualShotDamageMultiplier and auto fire
 * resumes after autoFireResumeDelay.
 *
 * Owns the projectile pool and resolves impacts, since that is where shells die.
 */

export interface WeaponSystemOptions {
  readonly scene: Phaser.Scene;
  readonly mecha: Mecha;
  readonly targeting: TargetingSystem;
  readonly damage: DamageSystem;
  /** Weapon id from src/data/weapons.json. */
  readonly weaponId: string;
  readonly onEnemyKilled: (enemy: Enemy) => void;
  readonly onEnemyHit?: (enemy: Enemy, result: DamageResult) => void;
  readonly onShotFired?: (isManual: boolean) => void;
}

export class WeaponSystem {
  private readonly mecha: Mecha;
  private readonly targeting: TargetingSystem;
  private readonly damage: DamageSystem;
  private readonly weapon: WeaponDef;
  private readonly projectiles: Pool<Projectile>;
  private readonly onEnemyKilled: (enemy: Enemy) => void;
  private readonly onEnemyHit: ((enemy: Enemy, result: DamageResult) => void) | undefined;
  private readonly onShotFired: ((isManual: boolean) => void) | undefined;

  private readonly minX: number;
  private readonly maxX: number;
  private readonly maxY: number;

  /** Multipliers the Phase 2 upgrade panel will drive. */
  damageMultiplier = 1;
  fireRateMultiplier = 1;

  private cooldown = 0;
  private autoPauseRemaining = 0;

  private manualAiming = false;
  private manualAimX = 0;
  private manualAimY = 0;

  /** Reused aim point so target leading never allocates in the update loop. */
  private readonly aimPoint = new Phaser.Math.Vector2();

  constructor(options: WeaponSystemOptions) {
    this.mecha = options.mecha;
    this.targeting = options.targeting;
    this.damage = options.damage;
    this.weapon = getWeaponDef(options.weaponId);
    this.onEnemyKilled = options.onEnemyKilled;
    this.onEnemyHit = options.onEnemyHit;
    this.onShotFired = options.onShotFired;

    const { baseWidth, baseHeight, despawnXFraction, spawnXFraction } = tuning.world;
    this.minX = baseWidth * despawnXFraction;
    this.maxX = baseWidth * (spawnXFraction + 0.1);
    this.maxY = baseHeight;

    this.projectiles = new Pool<Projectile>(
      tuning.pools.projectiles,
      () => new Projectile(options.scene),
    );
  }

  get isManualAiming(): boolean {
    return this.manualAiming;
  }

  get manualAimPointX(): number {
    return this.manualAimX;
  }

  get manualAimPointY(): number {
    return this.manualAimY;
  }

  get activeProjectiles(): readonly Projectile[] {
    return this.projectiles.active;
  }

  /** Shots per second after upgrades. */
  private get fireRate(): number {
    return this.weapon.fireRate * this.fireRateMultiplier;
  }

  private get shotDamage(): number {
    return this.weapon.baseDamage * this.damageMultiplier;
  }

  beginManualAim(worldX: number, worldY: number): void {
    this.manualAiming = true;
    this.updateManualAim(worldX, worldY);
  }

  updateManualAim(worldX: number, worldY: number): void {
    this.manualAimX = worldX;
    this.manualAimY = worldY;
  }

  /** Releasing the drag is the shot. Auto fire stays paused for the resume delay. */
  releaseManualAim(): void {
    if (!this.manualAiming) return;
    this.manualAiming = false;
    this.autoPauseRemaining = tuning.targeting.autoFireResumeDelay;

    this.mecha.aimAt(this.manualAimX, this.manualAimY);
    this.fireShot(this.shotDamage * tuning.targeting.manualShotDamageMultiplier, true);
    this.cooldown = 0;
  }

  /** Drag abandoned (pointer left the canvas): no shot, but auto fire resumes. */
  cancelManualAim(): void {
    if (!this.manualAiming) return;
    this.manualAiming = false;
    this.autoPauseRemaining = tuning.targeting.autoFireResumeDelay;
  }

  update(deltaSeconds: number, enemies: readonly Enemy[]): void {
    if (this.autoPauseRemaining > 0) {
      this.autoPauseRemaining -= deltaSeconds;
    }

    if (this.manualAiming) {
      this.mecha.aimAt(this.manualAimX, this.manualAimY);
    } else {
      this.updateAutoFire(deltaSeconds, enemies);
    }

    this.updateProjectiles(deltaSeconds, enemies);
  }

  private updateAutoFire(deltaSeconds: number, enemies: readonly Enemy[]): void {
    const muzzle = this.mecha.getMuzzle();
    const target = this.targeting.selectTarget(enemies, muzzle.x, muzzle.y);

    const interval = 1 / this.fireRate;
    this.cooldown += deltaSeconds;

    if (target === null) {
      // Stay loaded but do not bank shots for a burst when a target appears.
      if (this.cooldown > interval) this.cooldown = interval;
      return;
    }

    this.aimAtLead(target, muzzle.x, muzzle.y);
    this.mecha.aimAt(this.aimPoint.x, this.aimPoint.y);

    if (this.autoPauseRemaining > 0) return;

    while (this.cooldown >= interval) {
      this.cooldown -= interval;
      this.fireShot(this.shotDamage, false);
    }
  }

  /**
   * Shells have travel time, so auto fire leads the target. Enemies only move
   * along x, and stop once they are in attack range, which makes the intercept a
   * single refinement pass rather than a solver.
   */
  private aimAtLead(target: Enemy, fromX: number, fromY: number): void {
    const def = target.definition;
    const targetY = target.centerY;
    const velocityX = def === null || target.isAttacking ? 0 : -def.speed;
    const projectileSpeed = this.weapon.projectile.speed;

    if (velocityX === 0 || projectileSpeed <= 0) {
      this.aimPoint.set(target.x, targetY);
      return;
    }

    const flightTime = Phaser.Math.Distance.Between(fromX, fromY, target.x, targetY) / projectileSpeed;
    const predictedX = target.x + velocityX * flightTime;
    const refinedTime = Phaser.Math.Distance.Between(fromX, fromY, predictedX, targetY) / projectileSpeed;
    this.aimPoint.set(target.x + velocityX * refinedTime, targetY);
  }

  private fireShot(damage: number, isManual: boolean): void {
    const projectile = this.projectiles.obtain();
    // Pool exhausted: drop the shot rather than allocate mid frame.
    if (projectile === null) return;

    const muzzle = this.mecha.getMuzzle();
    projectile.fire(
      muzzle.x,
      muzzle.y,
      this.mecha.aimRotation,
      this.weapon.projectile.speed,
      damage,
      this.weapon.damageType,
      tuning.world.projectileLifetime,
      isManual,
    );
    this.onShotFired?.(isManual);
  }

  private updateProjectiles(deltaSeconds: number, enemies: readonly Enemy[]): void {
    const active = this.projectiles.active;
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
        this.recycle(projectile);
        continue;
      }

      const hit = this.findHit(projectile, enemies, shellRadius);
      if (hit === null) continue;

      const result = this.damage.applyToEnemy(hit, projectile.damage, projectile.damageType);
      this.onEnemyHit?.(hit, result);
      if (result.killed) {
        this.onEnemyKilled(hit);
      }
      this.recycle(projectile);
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
    this.projectiles.release(projectile);
  }

  reset(): void {
    const active = this.projectiles.active;
    for (let i = active.length - 1; i >= 0; i -= 1) {
      active[i].deactivate();
    }
    this.projectiles.releaseAll();
    this.cooldown = 0;
    this.autoPauseRemaining = 0;
    this.manualAiming = false;
  }
}
