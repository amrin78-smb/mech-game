import Phaser from 'phaser';

import { AssetKeys } from '../AssetKeys';
import { tuning } from '../data';
import { Depths } from '../ui/Depths';

/**
 * The player mecha: a layered container rather than frame animation, exactly as
 * GAME_DESIGN section 4 describes. Legs carry the body, an inner "upper"
 * container carries torso and cannon so the idle bob moves both, and the sway
 * is applied to the torso alone so it never skews the cannon's aim.
 *
 * Presentation lives here. Hull arithmetic is deliberately plain so systems can
 * drive it; damage multipliers are DamageSystem's job.
 */

/** Cannon pivot offset from the top of the torso, as a fraction of torso size. */
const CANNON_ANCHOR_X = 0.14;
const CANNON_ANCHOR_Y = -0.62;
/** The breech end of the barrel is the pivot, so the origin sits near its left edge. */
const CANNON_ORIGIN_X = 0.08;
/** How far the legs and torso overlap, so the join does not show a seam. */
const TORSO_OVERLAP = 14;

export class Mecha extends Phaser.GameObjects.Container {
  readonly hullMax: number;
  private hull: number;

  private readonly legs: Phaser.GameObjects.Image;
  private readonly torso: Phaser.GameObjects.Image;
  private readonly cannon: Phaser.GameObjects.Image;
  private readonly upper: Phaser.GameObjects.Container;

  /** Reused so getMuzzle never allocates inside the update loop. */
  private readonly muzzlePoint = new Phaser.Math.Vector2();
  private readonly muzzleLength: number;

  constructor(scene: Phaser.Scene, x: number, groundY: number, hullMax: number) {
    super(scene, x, groundY);

    this.hullMax = hullMax;
    this.hull = hullMax;

    this.legs = scene.add.image(0, 0, AssetKeys.MECHA_LEGS).setOrigin(0.5, 1);

    this.upper = scene.add.container(0, -this.legs.height + TORSO_OVERLAP);
    this.torso = scene.add.image(0, 0, AssetKeys.MECHA_TORSO).setOrigin(0.5, 1);
    this.cannon = scene.add
      .image(
        this.torso.width * CANNON_ANCHOR_X,
        this.torso.height * CANNON_ANCHOR_Y,
        AssetKeys.MECHA_CANNON,
      )
      .setOrigin(CANNON_ORIGIN_X, 0.5);
    this.upper.add([this.torso, this.cannon]);

    this.add([this.legs, this.upper]);
    this.setDepth(Depths.MECHA);
    scene.add.existing(this);

    this.muzzleLength = this.cannon.width * (1 - CANNON_ORIGIN_X);
    this.startIdleAnimation(scene);
  }

  /** Torso bob and a slower sway, so the machine reads as alive while idle. */
  private startIdleAnimation(scene: Phaser.Scene): void {
    const { bobAmplitude, bobPeriod, swayAmplitude, swayPeriod } = tuning.mecha;

    scene.tweens.add({
      targets: this.upper,
      y: this.upper.y - bobAmplitude,
      duration: (bobPeriod * 1000) / 2,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    scene.tweens.add({
      targets: this.torso,
      angle: { from: -swayAmplitude, to: swayAmplitude },
      duration: (swayPeriod * 1000) / 2,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** Points the barrel at a world position. The container itself never rotates. */
  aimAt(worldX: number, worldY: number): void {
    const muzzleOriginX = this.x + this.upper.x + this.cannon.x;
    const muzzleOriginY = this.y + this.upper.y + this.cannon.y;
    this.cannon.rotation = Math.atan2(worldY - muzzleOriginY, worldX - muzzleOriginX);
  }

  get aimRotation(): number {
    return this.cannon.rotation;
  }

  /** World position of the barrel tip. Returns a shared vector, do not retain it. */
  getMuzzle(): Phaser.Math.Vector2 {
    const rotation = this.cannon.rotation;
    return this.muzzlePoint.set(
      this.x + this.upper.x + this.cannon.x + Math.cos(rotation) * this.muzzleLength,
      this.y + this.upper.y + this.cannon.y + Math.sin(rotation) * this.muzzleLength,
    );
  }

  /** Where enemies walk to and aim at: the hull centre, not the feet. */
  get hullCenterY(): number {
    return this.y - this.legs.height * 0.5 - this.torso.height * 0.3;
  }

  get hullHp(): number {
    return this.hull;
  }

  get hullFraction(): number {
    return this.hullMax <= 0 ? 0 : this.hull / this.hullMax;
  }

  get isDestroyed(): boolean {
    return this.hull <= 0;
  }

  /** Returns the damage actually absorbed, which matters once repairs exist. */
  applyDamage(amount: number): number {
    const applied = Math.min(amount, this.hull);
    this.hull -= applied;
    if (this.hull < 0) this.hull = 0;
    return applied;
  }

  repair(amount: number): number {
    const healed = Math.min(amount, this.hullMax - this.hull);
    this.hull += healed;
    return healed;
  }
}
