import Phaser from 'phaser';

import { AssetKeys } from '../AssetKeys';
import { bindArt } from '../ArtBinding';
import type { EscortDef } from '../types';
import { Depths } from '../ui/Depths';

/**
 * An allied unit bought with scrap during a battle.
 *
 * It does two jobs. It shoots, sharing the cannon's target priority so a focus
 * tap swings everything at once, and it blocks: enemies in its lane stop at it
 * rather than walking on to the hull. The second job is the interesting one,
 * because it converts scrap into time.
 *
 * Pooled like everything else, so buying one mid fight allocates nothing.
 */

const HP_BAR_HEIGHT = 4;
const HP_BAR_GAP = 7;
const HP_BAR_BG = 0x1a1512;
const HP_BAR_FILL = 0x4a90a4;

export class Escort extends Phaser.GameObjects.Container {
  private def: EscortDef | null = null;
  private hp = 0;
  private hpMax = 0;
  private laneIndex = 0;

  /** Seconds until this escort's gun can fire again. */
  cooldown = 0;

  private readonly sprite: Phaser.GameObjects.Image;
  private readonly hpBarBg: Phaser.GameObjects.Rectangle;
  private readonly hpBarFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    this.sprite = bindArt(
      scene,
      scene.add.image(0, 0, AssetKeys.UI_PIXEL),
      AssetKeys.UI_PIXEL,
    ).setOrigin(0.5, 1);
    this.hpBarBg = scene.add.rectangle(0, 0, 1, HP_BAR_HEIGHT, HP_BAR_BG).setOrigin(0.5, 1);
    this.hpBarFill = scene.add.rectangle(0, 0, 1, HP_BAR_HEIGHT - 2, HP_BAR_FILL).setOrigin(0, 1);

    this.add([this.sprite, this.hpBarBg, this.hpBarFill]);
    scene.add.existing(this);
    this.deactivate();
  }

  get definition(): EscortDef | null {
    return this.def;
  }

  get isAlive(): boolean {
    return this.active && this.hp > 0;
  }

  get lane(): number {
    return this.laneIndex;
  }

  get healthFraction(): number {
    return this.hpMax <= 0 ? 0 : this.hp / this.hpMax;
  }

  /** Where enemies in this lane have to stop. */
  get blockX(): number {
    return this.x + this.sprite.displayWidth * 0.5;
  }

  get centerY(): number {
    return this.y - this.sprite.displayHeight * 0.5;
  }

  get muzzleX(): number {
    return this.x + this.sprite.displayWidth * 0.4;
  }

  get muzzleY(): number {
    return this.y - this.sprite.displayHeight * 0.6;
  }

  spawn(def: EscortDef, x: number, y: number, laneIndex: number, flip: boolean): void {
    this.def = def;
    this.laneIndex = laneIndex;
    this.hpMax = def.hp;
    this.hp = def.hp;
    this.cooldown = 0;

    bindArt(this.scene, this.sprite, def.spriteKey);
    this.sprite.setFlipX(flip);
    this.sprite.setPosition(0, 0);
    this.sprite.clearTint();

    const inner = this.sprite.displayWidth - 2;
    this.hpBarBg.setSize(this.sprite.displayWidth, HP_BAR_HEIGHT);
    this.hpBarBg.setPosition(0, -this.sprite.displayHeight - HP_BAR_GAP);
    this.hpBarFill.setSize(inner, HP_BAR_HEIGHT - 2);
    this.hpBarFill.setPosition(
      -this.sprite.displayWidth * 0.5 + 1,
      -this.sprite.displayHeight - HP_BAR_GAP - 1,
    );

    this.setPosition(x, y);
    this.setDepth(Depths.ENEMIES + laneIndex);
    this.setActive(true);
    this.setVisible(true);
    this.refreshBar();
  }

  /** Returns true when this hit destroyed it. */
  applyDamage(amount: number): boolean {
    if (!this.isAlive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      return true;
    }
    this.refreshBar();
    return false;
  }

  private refreshBar(): void {
    this.hpBarFill.width = Math.max(0, (this.sprite.displayWidth - 2) * this.healthFraction);
  }

  deactivate(): void {
    this.def = null;
    this.hp = 0;
    this.hpMax = 0;
    this.setActive(false);
    this.setVisible(false);
    this.setPosition(-1000, -1000);
  }
}
