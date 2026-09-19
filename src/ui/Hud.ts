import Phaser from 'phaser';

import { Depths } from './Depths';

/**
 * Battle HUD: hull bar top left, scrap counter top right, wave progress along
 * the top. Text is only rewritten when the underlying number changes, so a
 * steady frame costs nothing.
 *
 * The upgrade panel and pilot ability buttons are Phase 2 and 3.
 */

const MARGIN = 18;
const HULL_BAR_WIDTH = 320;
const HULL_BAR_HEIGHT = 22;
const WAVE_BAR_HEIGHT = 6;
const BAR_BG = 0x1a1512;
const BAR_BORDER = 0x6f6a62;
const HULL_FILL_HEALTHY = 0x6fae4a;
const HULL_FILL_HURT = 0xd8a12a;
const HULL_FILL_CRITICAL = 0xc23b2a;
const WAVE_FILL = 0xc9a227;
const TEXT_COLOR = '#e8dcc6';
const HULL_HURT_THRESHOLD = 0.6;
const HULL_CRITICAL_THRESHOLD = 0.3;

export class Hud {
  private readonly hullBarFill: Phaser.GameObjects.Rectangle;
  private readonly hullText: Phaser.GameObjects.Text;
  private readonly scrapText: Phaser.GameObjects.Text;
  private readonly waveBarFill: Phaser.GameObjects.Rectangle;
  private readonly hintText: Phaser.GameObjects.Text;
  private readonly hullBarWidthMax: number;
  private readonly waveBarWidthMax: number;

  private lastHullShown = -1;
  private lastScrapShown = -1;

  constructor(scene: Phaser.Scene, width: number, onPause?: () => void) {
    const barTop = MARGIN + WAVE_BAR_HEIGHT + 10;

    scene.add
      .rectangle(0, 0, width, WAVE_BAR_HEIGHT, BAR_BG)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(Depths.HUD);
    this.waveBarFill = scene.add
      .rectangle(0, 0, 0, WAVE_BAR_HEIGHT, WAVE_FILL)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(Depths.HUD);

    scene.add
      .rectangle(MARGIN, barTop, HULL_BAR_WIDTH, HULL_BAR_HEIGHT, BAR_BG)
      .setOrigin(0, 0)
      .setStrokeStyle(2, BAR_BORDER)
      .setScrollFactor(0)
      .setDepth(Depths.HUD);
    this.hullBarFill = scene.add
      .rectangle(MARGIN + 2, barTop + 2, HULL_BAR_WIDTH - 4, HULL_BAR_HEIGHT - 4, HULL_FILL_HEALTHY)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(Depths.HUD);

    this.hullText = scene.add
      .text(MARGIN + 10, barTop + HULL_BAR_HEIGHT + 6, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: TEXT_COLOR,
      })
      .setScrollFactor(0)
      .setDepth(Depths.HUD);

    this.scrapText = scene.add
      .text(width - MARGIN, barTop, '', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: TEXT_COLOR,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(Depths.HUD);

    this.hintText = scene.add
      .text(width - MARGIN, barTop + 30, 'Drag to aim, release to fire. Tap an enemy to focus.', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#9a8f7c',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(Depths.HUD);

    if (onPause !== undefined) {
      const size = 34;
      const button = scene.add
        .rectangle(width - MARGIN - size, barTop + 58, size, size, BAR_BG)
        .setOrigin(0, 0)
        .setStrokeStyle(2, BAR_BORDER)
        .setScrollFactor(0)
        .setDepth(Depths.HUD)
        .setInteractive({ useHandCursor: true });
      scene.add
        .text(width - MARGIN - size * 0.5, barTop + 58 + size * 0.5, "II", {
          fontFamily: "monospace",
          fontSize: "16px",
          color: TEXT_COLOR,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(Depths.HUD + 1);
      button.on("pointerup", onPause);
    }

    this.hullBarWidthMax = HULL_BAR_WIDTH - 4;
    this.waveBarWidthMax = width;
  }

  update(hullHp: number, hullMax: number, scrap: number, waveProgress: number): void {
    const hullShown = Math.ceil(hullHp);
    if (hullShown !== this.lastHullShown) {
      this.lastHullShown = hullShown;
      const fraction = hullMax <= 0 ? 0 : Phaser.Math.Clamp(hullHp / hullMax, 0, 1);
      this.hullBarFill.width = this.hullBarWidthMax * fraction;
      this.hullBarFill.fillColor = this.hullColor(fraction);
      this.hullText.setText(`HULL ${hullShown} / ${Math.ceil(hullMax)}`);
    }

    if (scrap !== this.lastScrapShown) {
      this.lastScrapShown = scrap;
      this.scrapText.setText(`SCRAP ${scrap}`);
    }

    this.waveBarFill.width = this.waveBarWidthMax * Phaser.Math.Clamp(waveProgress, 0, 1);
  }

  hideHint(): void {
    this.hintText.setVisible(false);
  }

  private hullColor(fraction: number): number {
    if (fraction <= HULL_CRITICAL_THRESHOLD) return HULL_FILL_CRITICAL;
    if (fraction <= HULL_HURT_THRESHOLD) return HULL_FILL_HURT;
    return HULL_FILL_HEALTHY;
  }
}
