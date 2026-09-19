import Phaser from 'phaser';

import { AssetKeys } from '../AssetKeys';
import { bindArt } from '../ArtBinding';
import type { Enemy } from '../entities/Enemy';
import { Depths } from './Depths';

/**
 * Brackets around the player's focus target, so "this one dies first" is
 * readable at a glance. One reused image that follows the focused enemy.
 */

const PULSE_SCALE = 0.08;
const PULSE_SPEED = 4;

export class FocusMarker {
  private readonly image: Phaser.GameObjects.Image;
  /** Captured before any scaling, so the fit maths cannot feed back on itself. */
  private readonly baseWidth: number;
  private elapsed = 0;

  constructor(scene: Phaser.Scene) {
    this.image = scene.add
      .image(0, 0, AssetKeys.FOCUS_MARKER)
      .setDepth(Depths.AIM_LINE)
      .setVisible(false);
    bindArt(scene, this.image, AssetKeys.FOCUS_MARKER);
    this.baseWidth = this.image.displayWidth;
  }

  /** Call once per frame with the current focus target, or null when there is none. */
  update(target: Enemy | null, deltaSeconds: number): void {
    if (target === null) {
      if (this.image.visible) this.image.setVisible(false);
      return;
    }

    this.elapsed += deltaSeconds;
    const fit = (Math.max(target.radius, 1) * 2.4) / this.baseWidth;
    this.image.setVisible(true);
    this.image.setPosition(target.x, target.centerY);
    this.image.setScale(fit * (1 + Math.sin(this.elapsed * PULSE_SPEED) * PULSE_SCALE));
  }
}
