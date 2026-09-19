import Phaser from 'phaser';

import { AssetKeys } from '../AssetKeys';
import { bindArt } from '../ArtBinding';
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
/**
 * Measured from the generated art: the centroid of the opaque pixels in the
 * breech end, which is where the bolted mounting hub sits. The barrel axis is
 * above the sprite's vertical centre, hence the Y that is not 0.5.
 */
const CANNON_ORIGIN_X = 0.092;
const CANNON_ORIGIN_Y = 0.392;
/** The turret swings around its round base, not its breech. */
const TURRET_ORIGIN_X = 0.418;
const TURRET_ORIGIN_Y = 0.86;
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

  private walkPhase = 0;
  private lastStep = -1;
  private walkStarted = false;
  private elapsed = 0;
  private upperRestY = 0;
  private torsoSwayAngle = 0;
  /** Fired on each footfall so the scene can kick dust and shake the camera. */
  onFootfall: ((x: number, y: number) => void) | undefined;

  constructor(
    scene: Phaser.Scene,
    x: number,
    groundY: number,
    hullMax: number,
    cannonArt: string = AssetKeys.MECHA_CANNON,
  ) {
    super(scene, x, groundY);

    this.hullMax = hullMax;
    this.hull = hullMax;

    this.legs = bindArt(
      scene,
      scene.add.image(0, 0, AssetKeys.MECHA_LEGS),
      AssetKeys.MECHA_LEGS,
    ).setOrigin(0.5, 1);
    // The generated legs art faces left; the torso and cannon face right.
    this.legs.setFlipX(tuning.mecha.legsFaceLeft);

    this.upper = scene.add.container(0, -this.legs.displayHeight + TORSO_OVERLAP);
    this.torso = bindArt(
      scene,
      scene.add.image(0, 0, AssetKeys.MECHA_TORSO),
      AssetKeys.MECHA_TORSO,
    ).setOrigin(0.5, 1);

    const cannonImage = bindArt(
      scene,
      scene.add.image(
        this.torso.displayWidth * CANNON_ANCHOR_X,
        this.torso.displayHeight * CANNON_ANCHOR_Y,
        cannonArt,
      ),
      cannonArt,
    ).setOrigin(CANNON_ORIGIN_X, CANNON_ORIGIN_Y);
    this.cannon = {
      image: cannonImage,
      baseX: cannonImage.x,
      baseY: cannonImage.y,
      muzzleLength: cannonImage.displayWidth * (1 - CANNON_ORIGIN_X),
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
    const image = bindArt(
      scene,
      scene.add.image(offsetX, offsetY, AssetKeys.MECHA_TURRET),
      AssetKeys.MECHA_TURRET,
    ).setOrigin(TURRET_ORIGIN_X, TURRET_ORIGIN_Y);
    this.upper.add(image);

    this.turrets.push({
      image,
      baseX: offsetX,
      baseY: offsetY,
      muzzleLength: image.displayWidth * (1 - TURRET_ORIGIN_X),
      recoil: 0,
    });
    return this.turrets.length - 1;
  }

  get turretCount(): number {
    return this.turrets.length;
  }

  /**
   * Captures the rest pose the walk animates around. Replaces the old pair of
   * looping tweens: they drove the same y and angle the walk now owns, and two
   * writers on one property is a fight nobody wins.
   */
  private startIdleAnimation(_scene: Phaser.Scene): void {
    this.upperRestY = this.upper.y;
  }

  /** Decays recoil and advances the walk. Called once per frame by BattleScene. */
  override update(deltaSeconds: number): void {
    const decay = Math.exp(-tuning.vfx.recoilRecovery * deltaSeconds);
    this.applyRecoil(this.cannon, decay);
    for (const turret of this.turrets) {
      this.applyRecoil(turret, decay);
    }
    this.updateWalk(deltaSeconds);
  }

  /**
   * The mecha never moves, the world scrolls past it, so the walk has to be
   * sold entirely by secondary motion: the hull rises and falls twice per
   * stride, rocks fore and aft a degree or so, and reports each footfall so the
   * scene can kick dust and shake the camera.
   *
   * Two beats per cycle, because a biped plants a foot twice per stride.
   */
  private updateWalk(deltaSeconds: number): void {
    const { walkPeriod, walkBob, walkPitch, swayAmplitude, swayPeriod } = tuning.mecha;
    this.elapsed += deltaSeconds;
    this.walkPhase = (this.walkPhase + deltaSeconds / walkPeriod) % 1;
    this.torsoSwayAngle = Math.sin((this.elapsed / swayPeriod) * Math.PI * 2) * swayAmplitude;

    const beat = this.walkPhase * 2;
    const rise = Math.abs(Math.sin(beat * Math.PI));
    // Feet stay planted; the hull is what rises and falls over them.
    this.upper.y = this.upperRestY - walkBob * rise;
    this.torso.angle = this.torsoSwayAngle + Math.sin(this.walkPhase * Math.PI * 2) * walkPitch;

    const step = Math.floor(beat);
    if (step !== this.lastStep) {
      this.lastStep = step;
      // Skip the very first frame so a spawn does not stomp immediately.
      if (this.walkStarted) this.onFootfall?.(this.x, this.y);
      this.walkStarted = true;
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
    return this.x - this.torso.displayWidth * 0.2;
  }

  get exhaustY(): number {
    return this.y + this.upper.y - this.torso.displayHeight * 0.92;
  }

  /** Where enemies walk to and aim at: the hull centre, not the feet. */
  get hullCenterY(): number {
    return this.y - this.legs.displayHeight * 0.5 - this.torso.displayHeight * 0.3;
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
