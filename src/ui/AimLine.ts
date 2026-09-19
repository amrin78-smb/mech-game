import Phaser from 'phaser';

import { Depths } from './Depths';

/**
 * The manual aim line drawn from the muzzle to the pointer while a drag is held
 * (hard rule 9). One Graphics object, cleared and redrawn in place, so holding
 * the drag costs no allocations.
 */

const LINE_COLOR = 0xc9a227;
const LINE_ALPHA = 0.8;
const LINE_WIDTH = 2;
const DASH_LENGTH = 14;
const DASH_GAP = 10;
const RETICLE_RADIUS = 14;

export class AimLine {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(Depths.AIM_LINE);
    this.graphics.setVisible(false);
  }

  draw(fromX: number, fromY: number, toX: number, toY: number): void {
    const g = this.graphics;
    g.clear();
    g.setVisible(true);
    g.lineStyle(LINE_WIDTH, LINE_COLOR, LINE_ALPHA);

    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length <= 0) return;

    const stepX = dx / length;
    const stepY = dy / length;
    const stride = DASH_LENGTH + DASH_GAP;

    for (let travelled = 0; travelled < length; travelled += stride) {
      const end = Math.min(travelled + DASH_LENGTH, length);
      g.lineBetween(
        fromX + stepX * travelled,
        fromY + stepY * travelled,
        fromX + stepX * end,
        fromY + stepY * end,
      );
    }

    g.strokeCircle(toX, toY, RETICLE_RADIUS);
    g.lineBetween(toX - RETICLE_RADIUS - 6, toY, toX - RETICLE_RADIUS + 2, toY);
    g.lineBetween(toX + RETICLE_RADIUS - 2, toY, toX + RETICLE_RADIUS + 6, toY);
  }

  hide(): void {
    this.graphics.clear();
    this.graphics.setVisible(false);
  }
}
