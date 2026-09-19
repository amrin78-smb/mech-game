import Phaser from 'phaser';

import { AssetKeys } from '../AssetKeys';
import { getWeaponDef, tuning } from '../data';
import type { Enemy } from '../entities/Enemy';
import type { Mecha } from '../entities/Mecha';
import type { WeaponDef } from '../types';
import type { ProjectileSystem } from './ProjectileSystem';
import type { TargetingSystem } from './TargetingSystem';

/** How far a hitscan beam carries. The engagement line is the screen edge. */
const HITSCAN_RANGE = tuning.world.baseWidth * 1.2;

/**
 * The main cannon, exactly as hard rule 9 describes it.
 *
 * Auto fire is the default: the barrel tracks whatever TargetingSystem picks and
 * shoots at the weapon's fireRate. A pointer drag takes manual control at any
 * moment, which pauses auto fire and shows an aim line; releasing fires one
 * precision shot at tuning.targeting.manualShotDamageMultiplier and auto fire
 * resumes after autoFireResumeDelay.
 *
 * Shells come from the shared ProjectileSystem, so turrets and cannon draw on
 * one pool.
 */
export interface WeaponSystemOptions {
  readonly mecha: Mecha;
  readonly targeting: TargetingSystem;
  readonly projectiles: ProjectileSystem;
  /** Weapon id from src/data/weapons.json. */
  readonly weaponId: string;
  readonly onShotFired: (x: number, y: number, rotation: number, isManual: boolean) => void;
  /** Hitscan weapons draw a beam instead of a travelling shell. */
  readonly onBeam?: (x: number, y: number, rotation: number, length: number) => void;
}

export class WeaponSystem {
  private readonly mecha: Mecha;
  private readonly targeting: TargetingSystem;
  private readonly projectiles: ProjectileSystem;
  private readonly weapon: WeaponDef;
  private readonly onShotFired: (
    x: number,
    y: number,
    rotation: number,
    isManual: boolean,
  ) => void;
  private readonly onBeam:
    | ((x: number, y: number, rotation: number, length: number) => void)
    | undefined;

  /** Multipliers the in battle upgrade panel drives. */
  damageMultiplier = 1;
  fireRateMultiplier = 1;

  private cooldown = 0;
  private autoPauseRemaining = 0;
  /** Hitscan needs the live list at fire time, including on a manual release. */
  private lastEnemies: readonly Enemy[] = [];

  private manualAiming = false;
  private manualAimX = 0;
  private manualAimY = 0;

  /** Reused aim point so target leading never allocates in the update loop. */
  private readonly aimPoint = new Phaser.Math.Vector2();
  /** Reused shot spec, same reason. */
  private readonly spec: {
    textureKey: string;
    speed: number;
    damage: number;
    damageType: WeaponDef['damageType'];
    lifetimeSeconds: number;
    isManualShot: boolean;
    aoeRadius: number;
    pierce: boolean;
  };

  constructor(options: WeaponSystemOptions) {
    this.mecha = options.mecha;
    this.targeting = options.targeting;
    this.projectiles = options.projectiles;
    this.weapon = getWeaponDef(options.weaponId);
    this.onShotFired = options.onShotFired;
    this.onBeam = options.onBeam;

    this.spec = {
      textureKey: shellTextureFor(this.weapon),
      speed: this.weapon.projectile.speed,
      damage: 0,
      damageType: this.weapon.damageType,
      lifetimeSeconds: tuning.world.projectileLifetime,
      isManualShot: false,
      aoeRadius: this.weapon.projectile.aoeRadius ?? 0,
      pierce: this.weapon.projectile.pierce === true,
    };
  }

  get weaponName(): string {
    return this.weapon.name;
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

  /** The Railgun is hitscan: no shell, a beam resolved the moment it fires. */
  private get isHitscan(): boolean {
    return this.weapon.projectile.kind === 'hitscan';
  }

  update(deltaSeconds: number, enemies: readonly Enemy[]): void {
    this.lastEnemies = enemies;
    if (this.autoPauseRemaining > 0) {
      this.autoPauseRemaining -= deltaSeconds;
    }

    if (this.manualAiming) {
      this.mecha.aimAt(this.manualAimX, this.manualAimY);
      return;
    }
    this.updateAutoFire(deltaSeconds, enemies);
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

    leadTarget(this.aimPoint, target, muzzle.x, muzzle.y, this.weapon.projectile.speed);
    this.mecha.aimAt(this.aimPoint.x, this.aimPoint.y);

    if (this.autoPauseRemaining > 0) return;

    while (this.cooldown >= interval) {
      this.cooldown -= interval;
      this.fireShot(this.shotDamage, false);
    }
  }

  private fireShot(damage: number, isManual: boolean): void {
    const muzzle = this.mecha.getMuzzle();
    const rotation = this.mecha.aimRotation;

    this.spec.damage = damage;
    this.spec.isManualShot = isManual;

    if (this.isHitscan) {
      const reach = this.projectiles.fireHitscan(
        muzzle.x,
        muzzle.y,
        rotation,
        this.spec,
        this.lastEnemies,
        HITSCAN_RANGE,
      );
      this.mecha.kickCannon();
      this.onShotFired(muzzle.x, muzzle.y, rotation, isManual);
      this.onBeam?.(muzzle.x, muzzle.y, rotation, reach);
      return;
    }

    if (!this.projectiles.fire(muzzle.x, muzzle.y, rotation, this.spec)) return;

    this.mecha.kickCannon();
    this.onShotFired(muzzle.x, muzzle.y, rotation, isManual);
  }

  reset(): void {
    this.cooldown = 0;
    this.autoPauseRemaining = 0;
    this.manualAiming = false;
  }
}

/** Flak style rounds get the fatter shell so the two read apart in flight. */
export function shellTextureFor(weapon: WeaponDef): string {
  return (weapon.projectile.aoeRadius ?? 0) > 0
    ? AssetKeys.PROJECTILE_FLAK
    : AssetKeys.PROJECTILE_SHELL;
}

/**
 * Shells have travel time, so auto fire leads the target. Enemies only move
 * along x and stop once in attack range, which makes the intercept a single
 * refinement pass rather than a solver. Writes into `out` to avoid allocating.
 */
export function leadTarget(
  out: Phaser.Math.Vector2,
  target: Enemy,
  fromX: number,
  fromY: number,
  projectileSpeed: number,
): void {
  const targetY = target.centerY;
  const velocityX = -target.movementSpeed;

  if (velocityX === 0 || projectileSpeed <= 0) {
    out.set(target.x, targetY);
    return;
  }

  const flightTime = Phaser.Math.Distance.Between(fromX, fromY, target.x, targetY) / projectileSpeed;
  const predictedX = target.x + velocityX * flightTime;
  const refinedTime =
    Phaser.Math.Distance.Between(fromX, fromY, predictedX, targetY) / projectileSpeed;
  out.set(target.x + velocityX * refinedTime, targetY);
}
