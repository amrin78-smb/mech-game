import Phaser from 'phaser';

import { getEscortDef, getWeaponDef, tuning } from '../data';
import type { Enemy } from '../entities/Enemy';
import { Escort } from '../entities/Escort';
import type { EscortDef, WeaponDef } from '../types';
import { Pool } from './Pool';
import type { ProjectileSystem } from './ProjectileSystem';
import type { TargetingSystem } from './TargetingSystem';
import { leadTarget, shellTextureFor } from './WeaponSystem';

/**
 * Allied escorts bought with scrap during a battle.
 *
 * They are deliberately consumable rather than a Hangar purchase. Turret mounts
 * already cover "permanently more guns"; escorts are the tactical version, a
 * reason to bank scrap instead of spending it on damage the instant you can
 * afford it, and a way to buy time when a wave is about to land.
 *
 * Each one takes a lane, spreading across lanes as more are bought, so they
 * cover different approaches rather than stacking.
 */
export interface EscortSystemOptions {
  readonly scene: Phaser.Scene;
  readonly targeting: TargetingSystem;
  readonly projectiles: ProjectileSystem;
  readonly mechaX: number;
  readonly laneY: readonly number[];
  readonly onShotFired: (x: number, y: number, rotation: number) => void;
  readonly onDestroyed: (x: number, y: number) => void;
}

/** Escorts are few; a small pool covers any sane amount of spending. */
const POOL_SIZE = 8;
/** Sprites that were drawn facing left need flipping to face the enemy. */
const FLIPPED_SPRITES = new Set(['escort_scrap_hound']);

export class EscortSystem {
  private readonly pool: Pool<Escort>;
  private readonly targeting: TargetingSystem;
  private readonly projectiles: ProjectileSystem;
  private readonly mechaX: number;
  private readonly laneY: readonly number[];
  private readonly onShotFired: (x: number, y: number, rotation: number) => void;
  private readonly onDestroyed: (x: number, y: number) => void;

  /** How many of each id have been bought this run, for the price ramp. */
  private readonly bought = new Map<string, number>();
  private readonly aimPoint = new Phaser.Math.Vector2();
  private nextLane = 0;

  constructor(options: EscortSystemOptions) {
    this.targeting = options.targeting;
    this.projectiles = options.projectiles;
    this.mechaX = options.mechaX;
    this.laneY = options.laneY;
    this.onShotFired = options.onShotFired;
    this.onDestroyed = options.onDestroyed;

    this.pool = new Pool<Escort>(POOL_SIZE, () => new Escort(options.scene));
  }

  get active(): readonly Escort[] {
    return this.pool.active;
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }

  /** Scrap price of the next one of this id, escalating within the run. */
  costOf(escortId: string): number {
    const def = getEscortDef(escortId);
    const owned = this.bought.get(escortId) ?? 0;
    return Math.round(def.cost * Math.pow(def.costGrowth, owned));
  }

  /** True when the pool has room; the panel greys out at the cap. */
  get hasRoom(): boolean {
    return this.pool.freeCount > 0;
  }

  /** Called after the scrap has already been taken. */
  deploy(escortId: string): boolean {
    const escort = this.pool.obtain();
    if (escort === null) return false;

    const def = getEscortDef(escortId);
    const lane = this.nextLane % this.laneY.length;
    this.nextLane += 1;

    escort.spawn(
      def,
      this.mechaX + def.standoffX,
      this.laneY[lane],
      lane,
      FLIPPED_SPRITES.has(def.spriteKey),
    );
    this.bought.set(escortId, (this.bought.get(escortId) ?? 0) + 1);
    return true;
  }

  /**
   * The x at which enemies in this lane must stop, or null when the lane is
   * clear and they walk all the way to the hull.
   */
  blockXFor(lane: number): number | null {
    let furthest: number | null = null;
    for (const escort of this.pool.active) {
      if (!escort.isAlive || escort.lane !== lane) continue;
      // The frontmost escort in the lane is the one that stops them.
      if (furthest === null || escort.blockX > furthest) furthest = escort.blockX;
    }
    return furthest;
  }

  /** The escort an enemy in this lane is up against, if any. */
  blockerFor(lane: number): Escort | null {
    let best: Escort | null = null;
    for (const escort of this.pool.active) {
      if (!escort.isAlive || escort.lane !== lane) continue;
      if (best === null || escort.blockX > best.blockX) best = escort;
    }
    return best;
  }

  damage(escort: Escort, amount: number): void {
    if (escort.applyDamage(amount)) {
      this.onDestroyed(escort.x, escort.centerY);
      escort.deactivate();
      this.pool.release(escort);
    }
  }

  update(deltaSeconds: number, enemies: readonly Enemy[]): void {
    const live = this.pool.active;
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const escort = live[i];
      if (!escort.isAlive) continue;

      const def = escort.definition;
      if (def === null) continue;
      const weapon = getWeaponDef(def.weaponId);

      const target = this.targeting.selectTarget(enemies, escort.muzzleX, escort.muzzleY);
      const interval = 1 / weapon.fireRate;
      escort.cooldown += deltaSeconds;

      if (target === null) {
        if (escort.cooldown > interval) escort.cooldown = interval;
        continue;
      }

      while (escort.cooldown >= interval) {
        escort.cooldown -= interval;
        this.fire(escort, def, weapon, target, enemies);
      }
    }
  }

  private fire(
    escort: Escort,
    def: EscortDef,
    weapon: WeaponDef,
    target: Enemy,
    enemies: readonly Enemy[],
  ): void {
    leadTarget(
      this.aimPoint,
      target,
      escort.muzzleX,
      escort.muzzleY,
      weapon.projectile.speed,
    );
    const rotation = Math.atan2(
      this.aimPoint.y - escort.muzzleY,
      this.aimPoint.x - escort.muzzleX,
    );

    const spec = {
      textureKey: shellTextureFor(weapon),
      speed: weapon.projectile.speed,
      damage: weapon.baseDamage * (def.damageScale ?? 1),
      damageType: weapon.damageType,
      lifetimeSeconds: tuning.world.projectileLifetime,
      isManualShot: false,
      aoeRadius: weapon.projectile.aoeRadius ?? 0,
      pierce: weapon.projectile.pierce === true,
    };

    if (weapon.projectile.kind === 'hitscan') {
      this.projectiles.fireHitscan(
        escort.muzzleX,
        escort.muzzleY,
        rotation,
        spec,
        enemies,
        tuning.world.baseWidth * 1.2,
      );
      this.onShotFired(escort.muzzleX, escort.muzzleY, rotation);
      return;
    }

    if (!this.projectiles.fire(escort.muzzleX, escort.muzzleY, rotation, spec)) return;
    this.onShotFired(escort.muzzleX, escort.muzzleY, rotation);
  }

  reset(): void {
    const live = this.pool.active;
    for (let i = live.length - 1; i >= 0; i -= 1) {
      live[i].deactivate();
    }
    this.pool.releaseAll();
    this.bought.clear();
    this.nextLane = 0;
  }
}

