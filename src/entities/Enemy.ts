import Phaser from 'phaser';

import { AssetKeys } from '../AssetKeys';
import type { EnemyDef } from '../types';
import { Depths } from '../ui/Depths';

/**
 * Hard rule 3: there is exactly one Enemy class. Every difference between a
 * rustcrawler and a plated hulk comes out of its EnemyDef, never a subclass.
 *
 * Instances are pooled and reused, so the constructor builds the display objects
 * and `spawn` does nothing but reset state.
 */

const HP_BAR_HEIGHT = 5;
const HP_BAR_GAP = 9;
const HP_BAR_BG = 0x1a1512;
const HP_BAR_FILL = 0xc23b2a;

export interface EnemyUpdateContext {
  /** World x of the mecha, what enemies advance towards. */
  readonly mechaX: number;
  /** px from the mecha centre at which melee attackers stop. */
  readonly meleeStandoff: number;
  /** Called every time an enemy's attack interval comes round while in range. */
  readonly onAttack: (enemy: Enemy) => void;
}

export class Enemy extends Phaser.GameObjects.Container {
  private def: EnemyDef | null = null;
  private hp = 0;
  private hpMax = 0;
  private attackTimer = 0;
  private laneIndex = 0;
  private inRange = false;

  private readonly sprite: Phaser.GameObjects.Image;
  private readonly hpBarBg: Phaser.GameObjects.Rectangle;
  private readonly hpBarFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    this.sprite = scene.add.image(0, 0, AssetKeys.UI_PIXEL).setOrigin(0.5, 1);
    this.hpBarBg = scene.add.rectangle(0, 0, 1, HP_BAR_HEIGHT, HP_BAR_BG).setOrigin(0.5, 1);
    this.hpBarFill = scene.add.rectangle(0, 0, 1, HP_BAR_HEIGHT - 2, HP_BAR_FILL).setOrigin(0, 1);

    this.add([this.sprite, this.hpBarBg, this.hpBarFill]);
    scene.add.existing(this);
    this.deactivate();
  }

  get definition(): EnemyDef | null {
    return this.def;
  }

  get isAlive(): boolean {
    return this.active && this.hp > 0;
  }

  get healthFraction(): number {
    return this.hpMax <= 0 ? 0 : this.hp / this.hpMax;
  }

  get lane(): number {
    return this.laneIndex;
  }

  /** Collision radius used by projectile impact checks. */
  get radius(): number {
    return Math.max(this.sprite.width, this.sprite.height) * 0.5;
  }

  /** Centre of mass, what the cannon aims at rather than the feet. */
  get centerY(): number {
    return this.y - this.sprite.height * 0.5;
  }

  /** True once this enemy has stopped and is chewing on the hull. */
  get isAttacking(): boolean {
    return this.inRange;
  }

  /** A ranged enemy sitting inside its own attack range, the priority 2 rule. */
  get isRangedInRange(): boolean {
    return this.inRange && this.hasRangedAttack;
  }

  get hasRangedAttack(): boolean {
    return this.def !== null && this.def.behaviors.includes('ranged') && (this.def.attackRange ?? 0) > 0;
  }

  get damagePerHit(): number {
    return this.def?.damage ?? 0;
  }

  get scrapReward(): number {
    return this.def?.reward ?? 0;
  }

  spawn(def: EnemyDef, x: number, y: number, laneIndex: number, hpMultiplier: number): void {
    this.def = def;
    this.laneIndex = laneIndex;
    this.hpMax = def.hp * hpMultiplier;
    this.hp = this.hpMax;
    this.attackTimer = 0;
    this.inRange = false;

    // Textures are baked at the def's scale, so the sprite is never scaled here.
    this.sprite.setTexture(def.spriteKey);
    this.sprite.setPosition(0, 0);

    this.hpBarBg.setSize(this.sprite.width, HP_BAR_HEIGHT);
    this.hpBarBg.setPosition(0, -this.sprite.height - HP_BAR_GAP);
    this.hpBarFill.setSize(this.sprite.width - 2, HP_BAR_HEIGHT - 2);
    this.hpBarFill.setPosition(-this.sprite.width * 0.5 + 1, -this.sprite.height - HP_BAR_GAP - 1);
    this.setHpBarVisible(false);

    this.setPosition(x, y);
    this.setDepth(Depths.ENEMIES + laneIndex);
    this.setActive(true);
    this.setVisible(true);
  }

  override update(deltaSeconds: number, ctx: EnemyUpdateContext): void {
    const def = this.def;
    if (!this.active || def === null) return;

    const stopX = this.stopDistanceX(def, ctx);
    if (this.x > stopX) {
      this.inRange = false;
      this.x = Math.max(stopX, this.x - def.speed * deltaSeconds);
      return;
    }

    this.inRange = true;
    this.attackTimer += deltaSeconds;
    while (this.attackTimer >= def.attackInterval) {
      this.attackTimer -= def.attackInterval;
      ctx.onAttack(this);
    }
  }

  /** Ranged enemies halt at their own attack range, melee at contact standoff. */
  private stopDistanceX(def: EnemyDef, ctx: EnemyUpdateContext): number {
    const range = def.attackRange ?? 0;
    if (range > 0) return ctx.mechaX + range;
    return ctx.mechaX + ctx.meleeStandoff + this.sprite.width * 0.5;
  }

  /** Raw damage, already multiplied by DamageSystem. Returns true if it died. */
  applyDamage(amount: number): boolean {
    if (!this.isAlive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      return true;
    }
    // The bar only appears once an enemy has actually been hurt.
    this.setHpBarVisible(true);
    this.hpBarFill.width = Math.max(0, (this.sprite.width - 2) * this.healthFraction);
    return false;
  }

  deactivate(): void {
    this.def = null;
    this.hp = 0;
    this.hpMax = 0;
    this.inRange = false;
    this.setActive(false);
    this.setVisible(false);
    this.setPosition(-1000, -1000);
  }

  private setHpBarVisible(visible: boolean): void {
    this.hpBarBg.setVisible(visible);
    this.hpBarFill.setVisible(visible);
  }
}
