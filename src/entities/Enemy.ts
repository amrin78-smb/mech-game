import Phaser from 'phaser';

import { AssetKeys } from '../AssetKeys';
import { bindArt } from '../ArtBinding';
import { tuning } from '../data';
import type { EnemyDef } from '../types';
import { Depths } from '../ui/Depths';

/**
 * Hard rule 3: there is exactly one Enemy class. Every difference between a
 * rustcrawler and a plated hulk comes out of its EnemyDef, never a subclass.
 * Boss is the single sanctioned exception, and it customises behaviour through
 * the protected hooks below rather than by rewriting update.
 *
 * Instances are pooled and reused, so the constructor builds the display objects
 * and `spawn` does nothing but reset state.
 */

const HP_BAR_HEIGHT = 5;
const HP_BAR_GAP = 9;
const HP_BAR_BG = 0x1a1512;
const HP_BAR_FILL = 0xc23b2a;
const SHIELD_BAR_FILL = 0x4a90a4;

export interface EnemyUpdateContext {
  /** World x of the mecha, what enemies advance towards. */
  readonly mechaX: number;
  /** px from the mecha centre at which melee attackers stop. */
  readonly meleeStandoff: number;
  /** Called every time an enemy's attack interval comes round while in range. */
  readonly onAttack: (enemy: Enemy) => void;
  /** Spawner behaviour asks the WaveSpawner for a unit; it owns the pool. */
  readonly onSpawnRequest: (parent: Enemy, enemyId: string) => void;
  /**
   * x at which an allied escort blocks this lane, or null when it is clear.
   * Melee enemies stop here instead of walking on to the hull.
   */
  readonly blockXFor: (lane: number) => number | null;
}

export class Enemy extends Phaser.GameObjects.Container {
  protected def: EnemyDef | null = null;
  protected hp = 0;
  protected hpMax = 0;
  protected attackTimer = 0;
  protected inRange = false;
  protected shield = 0;
  protected shieldMax = 0;

  private laneIndex = 0;
  private flashRemaining = 0;
  private spawnTimer = 0;
  private spawnsRemaining = 0;

  protected readonly sprite: Phaser.GameObjects.Image;
  private readonly hpBarBg: Phaser.GameObjects.Rectangle;
  private readonly hpBarFill: Phaser.GameObjects.Rectangle;
  private readonly shieldBarFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    this.sprite = bindArt(scene, scene.add.image(0, 0, AssetKeys.UI_PIXEL), AssetKeys.UI_PIXEL).setOrigin(0.5, 1);
    this.hpBarBg = scene.add.rectangle(0, 0, 1, HP_BAR_HEIGHT, HP_BAR_BG).setOrigin(0.5, 1);
    this.hpBarFill = scene.add.rectangle(0, 0, 1, HP_BAR_HEIGHT - 2, HP_BAR_FILL).setOrigin(0, 1);
    this.shieldBarFill = scene.add
      .rectangle(0, 0, 1, HP_BAR_HEIGHT - 2, SHIELD_BAR_FILL)
      .setOrigin(0, 1);

    this.add([this.sprite, this.hpBarBg, this.hpBarFill, this.shieldBarFill]);
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

  /** Bosses get a screen wide bar and a stinger; ordinary enemies do not. */
  get isBoss(): boolean {
    return false;
  }

  /** Collision radius used by projectile impact checks. */
  get radius(): number {
    return Math.max(this.sprite.displayWidth, this.sprite.displayHeight) * 0.5;
  }

  get bodyWidth(): number {
    return this.sprite.displayWidth;
  }

  get bodyHeight(): number {
    return this.sprite.displayHeight;
  }

  /** Centre of mass, what the cannon aims at rather than the feet. */
  get centerY(): number {
    return this.y - this.sprite.displayHeight * 0.5;
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
    return (
      this.def !== null && this.def.behaviors.includes('ranged') && (this.def.attackRange ?? 0) > 0
    );
  }

  get damagePerHit(): number {
    return this.def?.damage ?? 0;
  }

  get scrapReward(): number {
    return this.def?.reward ?? 0;
  }

  /**
   * Current closing speed in px per second. Auto fire reads this to lead its
   * shots, so a charging boss is led correctly rather than by its base speed.
   */
  get movementSpeed(): number {
    if (this.inRange || this.def === null) return 0;
    return this.def.speed;
  }

  spawn(def: EnemyDef, x: number, y: number, laneIndex: number, hpMultiplier: number): void {
    this.def = def;
    this.laneIndex = laneIndex;
    this.hpMax = def.hp * hpMultiplier;
    this.hp = this.hpMax;
    this.shieldMax = def.behaviors.includes('shielded') ? (def.shieldHp ?? 0) * hpMultiplier : 0;
    this.shield = this.shieldMax;
    this.attackTimer = 0;
    this.inRange = false;
    this.flashRemaining = 0;
    this.spawnsRemaining = def.spawns?.count ?? 0;
    this.spawnTimer = def.spawns?.interval ?? 0;

    // Textures are authored at the def's scale; bindArt only pays back the
    // supersample factor, so the on screen size is the same either way.
    bindArt(this.scene, this.sprite, def.spriteKey);
    this.sprite.setPosition(0, 0);
    this.sprite.clearTint();

    this.hpBarBg.setSize(this.sprite.displayWidth, HP_BAR_HEIGHT);
    this.hpBarBg.setPosition(0, -this.sprite.displayHeight - HP_BAR_GAP);
    this.hpBarFill.setSize(this.sprite.displayWidth - 2, HP_BAR_HEIGHT - 2);
    this.hpBarFill.setPosition(-this.sprite.displayWidth * 0.5 + 1, -this.sprite.displayHeight - HP_BAR_GAP - 1);
    this.shieldBarFill.setSize(this.sprite.displayWidth - 2, HP_BAR_HEIGHT - 2);
    this.shieldBarFill.setPosition(
      -this.sprite.displayWidth * 0.5 + 1,
      -this.sprite.displayHeight - HP_BAR_GAP - 1,
    );
    this.setHpBarVisible(false);

    this.setPosition(x, y);
    this.setDepth(Depths.ENEMIES + laneIndex);
    this.setActive(true);
    this.setVisible(true);
    this.onSpawned();
  }

  override update(deltaSeconds: number, ctx: EnemyUpdateContext): void {
    const def = this.def;
    if (!this.active || def === null) return;

    this.updateFlash(deltaSeconds);
    this.updateSpawner(deltaSeconds, ctx);
    this.updateBehavior(deltaSeconds, ctx);

    const stopX = this.stopDistanceX(def, ctx);
    if (this.x > stopX) {
      this.inRange = false;
      this.x = Math.max(stopX, this.x - this.travelSpeed(def) * deltaSeconds);
      return;
    }

    this.inRange = true;
    this.attackTimer += deltaSeconds;
    while (this.attackTimer >= def.attackInterval) {
      this.attackTimer -= def.attackInterval;
      ctx.onAttack(this);
    }
  }

  /**
   * The `spawner` behaviour: emits its `spawns` block on an interval while it
   * lives. The WaveSpawner owns the pool, so this only asks.
   */
  private updateSpawner(deltaSeconds: number, ctx: EnemyUpdateContext): void {
    const spawns = this.def?.spawns;
    if (spawns === undefined || this.spawnsRemaining <= 0) return;

    this.spawnTimer -= deltaSeconds;
    if (this.spawnTimer > 0) return;

    this.spawnTimer = spawns.interval;
    this.spawnsRemaining -= 1;
    ctx.onSpawnRequest(this, spawns.enemyId);
  }

  /** Hook for Boss phase logic. Runs before movement each frame. */
  protected updateBehavior(_deltaSeconds: number, _ctx: EnemyUpdateContext): void {
    // Ordinary enemies have no state beyond advance and attack.
  }

  /** Hook so a charging boss can move faster than its EnemyDef speed. */
  protected travelSpeed(def: EnemyDef): number {
    return def.speed;
  }

  /** Hook for one time setup after a spawn, e.g. a boss entrance. */
  protected onSpawned(): void {
    // Nothing by default.
  }

  /**
   * Ranged enemies halt at their own attack range, melee at contact standoff,
   * and either stops early at an escort holding the lane. The escort is only a
   * wall while it is closer than where they were already heading.
   */
  private stopDistanceX(def: EnemyDef, ctx: EnemyUpdateContext): number {
    const range = def.attackRange ?? 0;
    const atMecha =
      range > 0
        ? ctx.mechaX + range
        : ctx.mechaX + ctx.meleeStandoff + this.sprite.displayWidth * 0.5;

    const block = ctx.blockXFor(this.lane);
    if (block === null) return atMecha;
    return Math.max(atMecha, block + this.sprite.displayWidth * 0.5);
  }

  get hasShield(): boolean {
    return this.shield > 0;
  }

  get shieldFraction(): number {
    return this.shieldMax <= 0 ? 0 : this.shield / this.shieldMax;
  }

  /**
   * Feeds a shield pool first. DamageSystem decides how much of the hit the
   * shield actually takes, since only piercing gets through at full value.
   * Returns the damage the shield did not absorb.
   */
  absorbWithShield(amount: number): number {
    if (this.shield <= 0) return amount;
    const absorbed = Math.min(this.shield, amount);
    this.shield -= absorbed;
    this.flash();
    this.refreshBars();
    return amount - absorbed;
  }

  /** Boss hook: drop the shield entirely, opening a vulnerable window. */
  protected collapseShield(): void {
    this.shield = 0;
    this.refreshBars();
  }

  /** Boss hook: bring the shield back up to full. */
  protected restoreShield(): void {
    this.shield = this.shieldMax;
    this.refreshBars();
  }

  /** Raw damage, already multiplied by DamageSystem. Returns true if it died. */
  applyDamage(amount: number): boolean {
    if (!this.isAlive) return false;
    this.hp -= amount;
    this.flash();

    if (this.hp <= 0) {
      this.hp = 0;
      return true;
    }
    this.refreshBars();
    return false;
  }

  /** The bars only appear once an enemy has actually been hurt. */
  private refreshBars(): void {
    this.setHpBarVisible(true);
    const inner = this.sprite.displayWidth - 2;
    this.hpBarFill.width = Math.max(0, inner * this.healthFraction);
    this.shieldBarFill.width = Math.max(0, inner * this.shieldFraction);
    this.shieldBarFill.setVisible(this.shield > 0);
  }

  /**
   * White hot tint on hit, cleared by the timer in update.
   *
   * Re-flashing while one is already running is skipped: a boss under three
   * turrets takes hits faster than the flash expires, and holding the fill on
   * turns it into a solid silhouette-less blob.
   */
  flash(): void {
    if (this.flashRemaining > 0) return;
    this.flashRemaining = tuning.vfx.hitFlashDuration;
    this.sprite.setTintFill(tuning.vfx.hitFlashTint);
  }

  private updateFlash(deltaSeconds: number): void {
    if (this.flashRemaining <= 0) return;
    this.flashRemaining -= deltaSeconds;
    if (this.flashRemaining <= 0) {
      this.sprite.clearTint();
    }
  }

  deactivate(): void {
    this.def = null;
    this.hp = 0;
    this.hpMax = 0;
    this.shield = 0;
    this.shieldMax = 0;
    this.spawnsRemaining = 0;
    this.inRange = false;
    this.flashRemaining = 0;
    this.sprite.clearTint();
    this.setActive(false);
    this.setVisible(false);
    this.setPosition(-1000, -1000);
  }

  private setHpBarVisible(visible: boolean): void {
    this.hpBarBg.setVisible(visible);
    this.hpBarFill.setVisible(visible);
    this.shieldBarFill.setVisible(visible && this.shield > 0);
  }
}
