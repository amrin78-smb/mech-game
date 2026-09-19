import Phaser from 'phaser';

import type { Boss } from '../entities/Boss';
import { Depths } from './Depths';

/**
 * The wide bar that appears when a boss walks on. Its own band across the top so
 * a boss fight reads differently from a wave, with the phase called out when it
 * flips.
 */

const BAR_WIDTH_FRACTION = 0.56;
const BAR_HEIGHT = 16;
const BAR_TOP = 104;
const BAR_BG = 0x1a1512;
const BAR_BORDER = 0xc9a227;
const FILL_PHASE_1 = 0xc23b2a;
const FILL_PHASE_2 = 0xff7a3d;
const TEXT_COLOR = '#e8dcc6';

export class BossBar {
  private readonly frame: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly name: Phaser.GameObjects.Text;
  private readonly phase: Phaser.GameObjects.Text;
  private readonly fillWidthMax: number;

  private lastFraction = -1;
  private lastPhase = -1;

  constructor(scene: Phaser.Scene, width: number) {
    const barWidth = width * BAR_WIDTH_FRACTION;
    const left = (width - barWidth) * 0.5;

    this.frame = scene.add
      .rectangle(left, BAR_TOP, barWidth, BAR_HEIGHT, BAR_BG)
      .setOrigin(0, 0)
      .setStrokeStyle(2, BAR_BORDER)
      .setScrollFactor(0)
      .setDepth(Depths.HUD);

    this.fill = scene.add
      .rectangle(left + 2, BAR_TOP + 2, barWidth - 4, BAR_HEIGHT - 4, FILL_PHASE_1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(Depths.HUD + 1);

    this.name = scene.add
      .text(width * 0.5, BAR_TOP - 6, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: TEXT_COLOR,
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(Depths.HUD + 1);

    this.phase = scene.add
      .text(width * 0.5, BAR_TOP + BAR_HEIGHT + 4, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ff7a3d',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(Depths.HUD + 1);

    this.fillWidthMax = barWidth - 4;
    this.setVisible(false);
  }

  show(boss: Boss): void {
    this.name.setText(boss.definition?.name ?? 'BOSS');
    this.lastFraction = -1;
    this.lastPhase = -1;
    this.setVisible(true);
  }

  update(boss: Boss | null): void {
    if (boss === null || !boss.isAlive) {
      if (this.frame.visible) this.setVisible(false);
      return;
    }

    const fraction = Phaser.Math.Clamp(boss.healthFraction, 0, 1);
    if (Math.abs(fraction - this.lastFraction) > 0.001) {
      this.lastFraction = fraction;
      this.fill.width = this.fillWidthMax * fraction;
    }

    if (boss.phase !== this.lastPhase) {
      this.lastPhase = boss.phase;
      this.fill.fillColor = boss.phase >= 2 ? FILL_PHASE_2 : FILL_PHASE_1;
      this.phase.setText(boss.phase >= 2 ? 'PHASE 2  ENRAGED' : '');
    }
  }

  setVisible(visible: boolean): void {
    this.frame.setVisible(visible);
    this.fill.setVisible(visible);
    this.name.setVisible(visible);
    this.phase.setVisible(visible);
  }
}
