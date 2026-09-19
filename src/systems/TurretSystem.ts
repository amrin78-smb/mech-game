import Phaser from 'phaser';

import { getWeaponDef, tuning } from '../data';
import type { Enemy } from '../entities/Enemy';
import type { Mecha } from '../entities/Mecha';
import type { WeaponDef } from '../types';
import type { ProjectileSystem } from './ProjectileSystem';
import type { TargetingSystem } from './TargetingSystem';
import { leadTarget, shellTextureFor } from './WeaponSystem';

/**
 * Auto turret mounts. They share the TargetingSystem with the main cannon, so
 * setting a focus target swings everything onto it at once (GAME_DESIGN
 * section 3), and they share the shell pool through ProjectileSystem.
 *
 * Turrets never take manual control; the drag override is the cannon's alone.
 * Phase 2 fits one mount, Phase 3 sells mounts 2 and 3 in the Hangar.
 */
interface Mount {
  readonly index: number;
  cooldown: number;
}

export interface TurretSystemOptions {
  readonly mecha: Mecha;
  readonly targeting: TargetingSystem;
  readonly projectiles: ProjectileSystem;
  /** Turret slot weapon id from src/data/weapons.json. */
  readonly weaponId: string;
  readonly onShotFired: (x: number, y: number, rotation: number) => void;
}

export class TurretSystem {
  private readonly mecha: Mecha;
  private readonly targeting: TargetingSystem;
  private readonly projectiles: ProjectileSystem;
  private readonly weapon: WeaponDef;
  private readonly onShotFired: (x: number, y: number, rotation: number) => void;
  private readonly mounts: Mount[] = [];

  damageMultiplier = 1;
  fireRateMultiplier = 1;

  private readonly aimPoint = new Phaser.Math.Vector2();
  private readonly spec: {
    textureKey: string;
    speed: number;
    damage: number;
    damageType: WeaponDef['damageType'];
    lifetimeSeconds: number;
    isManualShot: boolean;
    aoeRadius: number;
  };

  constructor(options: TurretSystemOptions) {
    this.mecha = options.mecha;
    this.targeting = options.targeting;
    this.projectiles = options.projectiles;
    this.weapon = getWeaponDef(options.weaponId);
    this.onShotFired = options.onShotFired;

    if (this.weapon.slot !== 'turret') {
      throw new Error(`Weapon "${this.weapon.id}" is not a turret slot weapon`);
    }

    this.spec = {
      textureKey: shellTextureFor(this.weapon),
      speed: this.weapon.projectile.speed,
      damage: 0,
      damageType: this.weapon.damageType,
      lifetimeSeconds: tuning.world.projectileLifetime,
      isManualShot: false,
      aoeRadius: this.weapon.projectile.aoeRadius ?? 0,
    };
  }

  get weaponName(): string {
    return this.weapon.name;
  }

  get mountCount(): number {
    return this.mounts.length;
  }

  /** Fits a turret to one of the mecha's mount points. */
  addMount(scene: Phaser.Scene, mountIndex: number): void {
    const handle = this.mecha.addTurretMount(scene, mountIndex);
    // Stagger the opening shots so mounts do not fire in lockstep.
    this.mounts.push({ index: handle, cooldown: (handle * 0.5) / this.fireRate });
  }

  private get fireRate(): number {
    return this.weapon.fireRate * this.fireRateMultiplier;
  }

  private get shotDamage(): number {
    return this.weapon.baseDamage * this.damageMultiplier;
  }

  update(deltaSeconds: number, enemies: readonly Enemy[]): void {
    if (this.mounts.length === 0) return;

    const interval = 1 / this.fireRate;

    for (const mount of this.mounts) {
      const muzzle = this.mecha.getTurretMuzzle(mount.index);
      const target = this.targeting.selectTarget(enemies, muzzle.x, muzzle.y);

      mount.cooldown += deltaSeconds;

      if (target === null) {
        if (mount.cooldown > interval) mount.cooldown = interval;
        continue;
      }

      leadTarget(this.aimPoint, target, muzzle.x, muzzle.y, this.weapon.projectile.speed);
      this.mecha.aimTurretAt(mount.index, this.aimPoint.x, this.aimPoint.y);

      while (mount.cooldown >= interval) {
        mount.cooldown -= interval;
        this.fireShot(mount);
      }
    }
  }

  private fireShot(mount: Mount): void {
    const muzzle = this.mecha.getTurretMuzzle(mount.index);
    const rotation = this.mecha.turretRotation(mount.index);

    this.spec.damage = this.shotDamage;
    if (!this.projectiles.fire(muzzle.x, muzzle.y, rotation, this.spec)) return;

    this.mecha.kickTurret(mount.index);
    this.onShotFired(muzzle.x, muzzle.y, rotation);
  }

  reset(): void {
    for (const mount of this.mounts) {
      mount.cooldown = 0;
    }
  }
}
