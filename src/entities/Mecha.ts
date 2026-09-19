import Phaser from 'phaser';

import { ATLAS, AssetKeys } from '../AssetKeys';
import { tuning } from '../data';
import { Depths } from '../ui/Depths';

/**
 * The player mecha: a layered container rather than frame animation, exactly as
 * GAME_DESIGN section 4 describes. Legs carry the body, an inner "upper"
 * container carries torso, cannon and turret mounts so the idle bob moves them
 * together, and the sway is applied to the torso alone so it never skews aim.
 *
 * Recoil is a decaying offset advanced in update, not a tween per shot: at
 * several shots a second, spawning tweens would allocate inside the loop.
 */

/** Cannon pivot offset from the top of the torso, as a fraction of torso size. */
const CANNON_ANCHOR_X = 0.14;
const CANNON_ANCHOR_Y = -0.62;
/** The breech end of the barrel is the pivot, so the origin sits near its left edge. */
const CANNON_ORIGIN_X = 0.08;
const TURRET_ORIGIN_X = 0.15;
/** How far the legs and torso overlap, so the join does not show a seam. */
const TORSO_OVERLAP = 14;

interface Mount {
  readonly image: Phaser.GameObjects.Image;
  readonly baseX: number;
  readonly baseY: number;
  readonly muzzleLength: number;
  recoil: number;
}

export class Mecha extends Phaser.GameObjects.Container {
  readonly hullMax: number;
  private hull: number;
  private absorb = 0;

  private readonly legs: Phaser.GameObjects.Image;
  private readonly torso: Phaser.GameObjects.Image;
  private readonly upper: Phaser.GameObjects.Container;
  private readonly cannon: Mount;
  private readonly turrets: Mount[] = [];

  /** Reused so muzzle lookups never allocate inside the update loop. */
  private readonly muzzlePoint = new Phaser.Math.Vector2();

  constructor(scene: Phaser.Scene, x: number, groundY: number, hullMax: number) {
    super(scene, x, groundY);

    this.hullMax = hullMax;
    this.hull = hullMax;

    this.legs = scene.add.image(0, 0, ATLAS, AssetKeys.MECHA_LEGS).setOrigin(0.5, 1);

    this.upper = scene.add.container(0, -this.legs.height + TORSO_OVERLAP);
    this.torso = scene.add.image(0, 0, ATLAS, AssetKeys.MECHA_TORSO).setOrigin(0.5, 1);

    const cannonImage = scene.add
      .image(
        this.torso.width * CANNON_ANCHOR_X,
        this.torso.height * CANNON_ANCHOR_Y,
        ATLAS,
        AssetKeys.MECHA_CANNON,
      )
      .setOrigin(CANNON_ORIGIN_X, 0.5);
    this.cannon = {
      image: cannonImage,
      baseX: cannonImage.x,
      baseY: cannonImage.y,
      muzzleLength: cannonImage.width * (1 - CANNON_ORIGIN_X),
      recoil: 0,
    };

    this.upper.add([this.torso, cannonImage]);
    this.add([this.legs, this.upper]);
    this.setDepth(Depths.MECHA);
    scene.add.existing(this);

    this.startIdleAnimation(scene);
  }

  /**
   * Turret mounts are bought in the Hangar in Phase 3; Phase 2 fits mount 0.
   * Offsets come from tuning.mecha.turretMountOffsets.
   */
  addTurretMount(scene: Phaser.Scene, mountIndex: number): number {
    const offsets = tuning.mecha.turretMountOffsets;
    if (mountIndex < 0 || mountIndex >= offsets.length) {
      throw new Error(
        `Turret mount ${mountIndex} is not defined in tuning.mecha.turretMountOffsets`,
      );
    }
    const [offsetX, offsetY] = offsets[mountIndex];
    const image = scene.add
      .image(offsetX, offsetY, ATLAS, AssetKeys.MECHA_TURRET)
      .setOrigin(TURRET_ORIGIN_X, 0.5);
    this.upper.add(image);

    this.turrets.push({
      image,
      baseX: offsetX,
      baseY: offsetY,
      muzzleLength: image.width * (1 - TURRET_ORIGIN_X),
      recoil: 0,
    });
    return this.turrets.length - 1;
  }

  get turretCount(): number {
    return this.turrets.length;
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

  /** Decays recoil on every mount. Called once per frame by BattleScene. */
  override update(deltaSeconds: number): void {
    const decay = Math.exp(-tuning.vfx.recoilRecovery * deltaSeconds);
    this.applyRecoil(this.cannon, decay);
    for (const turret of this.turrets) {
      this.applyRecoil(turret, decay);
    }
  }

  private applyRecoil(mount: Mount, decay: number): void {
    if (mount.recoil <= 0.01) {
      if (mount.recoil !== 0) {
        mount.recoil = 0;
        mount.image.setPosition(mount.baseX, mount.baseY);
      }
      return;
    }
    mount.recoil *= decay;
    const rotation = mount.image.rotation;
    mount.image.setPosition(
      mount.baseX - Math.cos(rotation) * mount.recoil,
      mount.baseY - Math.sin(rotation) * mount.recoil,
    );
  }

  /** Points the barrel at a world position. The container itself never rotates. */
  aimAt(worldX: number, worldY: number): void {
    this.aimMount(this.cannon, worldX, worldY);
  }

  aimTurretAt(index: number, worldX: number, worldY: number): void {
    this.aimMount(this.turrets[index], worldX, worldY);
  }

  private aimMount(mount: Mount, worldX: number, worldY: number): void {
    const originX = this.x + this.upper.x + mount.baseX;
    const originY = this.y + this.upper.y + mount.baseY;
    mount.image.rotation = Math.atan2(worldY - originY, worldX - originX);
  }

  get aimRotation(): number {
    return this.cannon.image.rotation;
  }

  turretRotation(index: number): number {
    return this.turrets[index].image.rotation;
  }

  /** World position of the barrel tip. Returns a shared vector, do not retain it. */
  getMuzzle(): Phaser.Math.Vector2 {
    return this.muzzleOf(this.cannon);
  }

  getTurretMuzzle(index: number): Phaser.Math.Vector2 {
    return this.muzzleOf(this.turrets[index]);
  }

  private muzzleOf(mount: Mount): Phaser.Math.Vector2 {
    const rotation = mount.image.rotation;
    return this.muzzlePoint.set(
      this.x + this.upper.x + mount.image.x + Math.cos(rotation) * mount.muzzleLength,
      this.y + this.upper.y + mount.image.y + Math.sin(rotation) * mount.muzzleLength,
    );
  }

  kickCannon(): void {
    this.cannon.recoil = tuning.vfx.cannonRecoilPixels;
  }

  kickTurret(index: number): void {
    this.turrets[index].recoil = tuning.vfx.turretRecoilPixels;
  }

  /** World position of the exhaust stacks, where the smoke bed is emitted. */
  get exhaustX(): number {
    return this.x - this.torso.width * 0.2;
  }

  get exhaustY(): number {
    return this.y + this.upper.y - this.torso.height * 0.92;
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

  /** Mara's Aegis Field: a pool that eats damage before the hull does. */
  grantAbsorb(amount: number): void {
    this.absorb = Math.max(this.absorb, amount);
  }

  clearAbsorb(): void {
    this.absorb = 0;
  }

  get absorbRemaining(): number {
    return this.absorb;
  }

  /** Returns the damage that actually reached the hull, after any absorb pool. */
  applyDamage(amount: number): number {
    let incoming = amount;

    if (this.absorb > 0) {
      const eaten = Math.min(this.absorb, incoming);
      this.absorb -= eaten;
      incoming -= eaten;
      if (incoming <= 0) return 0;
    }

    const applied = Math.min(incoming, this.hull);
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
