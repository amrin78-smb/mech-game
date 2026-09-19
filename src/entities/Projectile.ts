import Phaser from 'phaser';

import { AssetKeys } from '../AssetKeys';
import { bindArt } from '../ArtBinding';
import type { DamageType } from '../types';
import { Depths } from '../ui/Depths';

/**
 * A shell in flight. Pooled, so the constructor runs once per pool slot and
 * `fire` only resets state. Travel time is real: a shell can miss a fast target,
 * which is the point of the manual precision shot.
 */
export interface ProjectileSpec {
  readonly textureKey: string;
  readonly speed: number;
  readonly damage: number;
  readonly damageType: DamageType;
  readonly lifetimeSeconds: number;
  readonly isManualShot: boolean;
  /** Above 0 turns the impact into a blast that also hits nearby enemies. */
  readonly aoeRadius: number;
  /** Hitscan only: pass through every target on the line. */
  readonly pierce?: boolean;
}

export class Projectile extends Phaser.GameObjects.Image {
  private velocityX = 0;
  private velocityY = 0;
  private lifeRemaining = 0;

  damage = 0;
  damageType: DamageType = 'kinetic';
  aoeRadius = 0;
  /** True for a released manual drag shot; drives the heavier impact VFX. */
  isManualShot = false;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, AssetKeys.PROJECTILE_SHELL);
    this.setDepth(Depths.PROJECTILES);
    scene.add.existing(this);
    this.deactivate();
  }

  fire(x: number, y: number, rotation: number, spec: ProjectileSpec): void {
    bindArt(this.scene, this, spec.textureKey);
    this.setPosition(x, y);
    this.setRotation(rotation);
    this.velocityX = Math.cos(rotation) * spec.speed;
    this.velocityY = Math.sin(rotation) * spec.speed;
    this.damage = spec.damage;
    this.damageType = spec.damageType;
    this.aoeRadius = spec.aoeRadius;
    this.isManualShot = spec.isManualShot;
    this.lifeRemaining = spec.lifetimeSeconds;
    this.setActive(true);
    this.setVisible(true);
  }

  /** Returns false when the shell has timed out and should be recycled. */
  advance(deltaSeconds: number): boolean {
    this.x += this.velocityX * deltaSeconds;
    this.y += this.velocityY * deltaSeconds;
    this.lifeRemaining -= deltaSeconds;
    return this.lifeRemaining > 0;
  }

  deactivate(): void {
    this.setActive(false);
    this.setVisible(false);
    this.setPosition(-1000, -1000);
    this.velocityX = 0;
    this.velocityY = 0;
    this.lifeRemaining = 0;
    this.aoeRadius = 0;
  }
}
