import Phaser from 'phaser';

import { AssetKeys } from '../AssetKeys';
import type { DamageType } from '../types';
import { Depths } from '../ui/Depths';

/**
 * A shell in flight. Pooled, so the constructor runs once per pool slot and
 * `fire` only resets state. Travel time is real: the cannon leads nothing, a
 * shell can miss a fast target, which is the point of the manual precision shot.
 */
export class Projectile extends Phaser.GameObjects.Image {
  private velocityX = 0;
  private velocityY = 0;
  private lifeRemaining = 0;

  damage = 0;
  damageType: DamageType = 'kinetic';
  /** True for a released manual drag shot, kept for Phase 2 impact flavour. */
  isManualShot = false;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, AssetKeys.PROJECTILE_SHELL);
    this.setDepth(Depths.PROJECTILES);
    scene.add.existing(this);
    this.deactivate();
  }

  fire(
    x: number,
    y: number,
    rotation: number,
    speed: number,
    damage: number,
    damageType: DamageType,
    lifetimeSeconds: number,
    isManualShot: boolean,
  ): void {
    this.setPosition(x, y);
    this.setRotation(rotation);
    this.velocityX = Math.cos(rotation) * speed;
    this.velocityY = Math.sin(rotation) * speed;
    this.damage = damage;
    this.damageType = damageType;
    this.isManualShot = isManualShot;
    this.lifeRemaining = lifetimeSeconds;
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
  }
}
