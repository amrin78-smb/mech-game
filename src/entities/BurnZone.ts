import Phaser from 'phaser';

import { Depths } from '../ui/Depths';

/**
 * A patch of burning ground left by an incinerator tank's flame arc
 * (GAME_DESIGN section 6).
 *
 * Pooled like everything else (hard rule 2): the constructor builds the two
 * ellipses once and `ignite` only resets state, so a battle full of fire
 * allocates nothing.
 *
 * The point of a zone rather than plain damage is that it outlives its owner.
 * Killing the tank does not put the fire out, so a slow answer to an
 * incinerator keeps costing hull after the thing is scrap.
 */

const OUTER_COLOR = 0x7c1d0a;
const OUTER_EDGE = 0xffd166;
const CORE_COLOR = 0xff9a1f;
const OUTER_ALPHA = 0.62;
const CORE_ALPHA = 0.85;
/** Flatten the circle into a ground patch seen in perspective. */
const VERTICAL_SQUASH = 0.42;
/** Flicker cycles per second, and how much of the alpha it swings. */
const FLICKER_HZ = 7;
const FLICKER_DEPTH = 0.22;
/** Fraction of the lifetime spent fading out at the end. */
const FADE_TAIL = 0.35;

export class BurnZone {
  private readonly outer: Phaser.GameObjects.Ellipse;
  private readonly core: Phaser.GameObjects.Ellipse;

  private remaining = 0;
  private duration = 0;
  private elapsed = 0;
  private dps = 0;

  constructor(scene: Phaser.Scene) {
    // Zone 3's ground is already orange and cracked with lava, so the patch
    // needs a bright rim and a dark scorch body to read as a hazard rather
    // than as more background.
    this.outer = scene.add
      .ellipse(0, 0, 1, 1, OUTER_COLOR, OUTER_ALPHA)
      .setStrokeStyle(3, OUTER_EDGE, 0.95)
      .setDepth(Depths.BG_GROUND + 1)
      .setVisible(false);
    this.core = scene.add
      .ellipse(0, 0, 1, 1, CORE_COLOR, CORE_ALPHA)
      .setDepth(Depths.BG_GROUND + 2)
      .setVisible(false);
  }

  get isActive(): boolean {
    return this.remaining > 0;
  }

  ignite(x: number, y: number, radius: number, damagePerSecond: number, duration: number): void {
    this.remaining = duration;
    this.duration = duration;
    this.elapsed = 0;
    this.dps = damagePerSecond;

    const height = radius * 2 * VERTICAL_SQUASH;
    this.outer.setPosition(x, y).setSize(radius * 2, height).setVisible(true);
    // A hot pool filling most of the scorch ring, so it reads as fire rather
    // than as a plate lying on the ground.
    this.core
      .setPosition(x, y)
      .setSize(radius * 1.5, height * 0.68)
      .setVisible(true);
  }

  /** Advances the fire and returns the hull damage it did this frame. */
  update(deltaSeconds: number): number {
    if (this.remaining <= 0) return 0;

    this.elapsed += deltaSeconds;
    const burned = Math.min(deltaSeconds, this.remaining);
    this.remaining -= deltaSeconds;

    // Steady while it burns, dying away over the tail so it does not just blink out.
    const life = this.duration <= 0 ? 0 : Math.max(0, this.remaining) / this.duration;
    const fade = life >= FADE_TAIL ? 1 : life / FADE_TAIL;
    const flicker = 1 - FLICKER_DEPTH + FLICKER_DEPTH * Math.sin(this.elapsed * FLICKER_HZ * Math.PI * 2);

    this.outer.setAlpha(OUTER_ALPHA * fade * flicker);
    this.core.setAlpha(CORE_ALPHA * fade * flicker);

    if (this.remaining <= 0) this.extinguish();

    return this.dps * burned;
  }

  extinguish(): void {
    this.remaining = 0;
    this.dps = 0;
    this.outer.setVisible(false);
    this.core.setVisible(false);
  }
}
