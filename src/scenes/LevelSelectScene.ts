import Phaser from 'phaser';

import { levels } from '../data';
import { ENDLESS_LEVEL_ID } from '../systems/EndlessTimeline';
import { SaveManager } from '../systems/SaveManager';
import type { LevelDef } from '../types';
import { Depths } from '../ui/Depths';
import { createTextButton } from '../ui/TextButton';
import { SceneKeys } from './SceneKeys';

/**
 * The zone map: one row per zone, a node per level, locked until the previous
 * level is cleared, with earned stars under each node.
 *
 * Zones come from the level data's `zone` field, so authoring a zone 4 in JSON
 * puts a fourth row here with no code change.
 */

const ZONE_NAMES: Record<number, string> = {
  1: 'ZONE 1  THE RUST FLATS',
  2: 'ZONE 2  THE ASH CANYONS',
  3: 'ZONE 3  THE FURNACE',
};

const NODE_WIDTH = 168;
const NODE_HEIGHT = 74;
const NODE_GAP = 18;
const STAR_SIZE = 9;
const STAR_GAP = 14;

const FILL_OPEN = 0x3a2f26;
const FILL_HOVER = 0x5c4736;
const FILL_LOCKED = 0x221c17;
const FILL_CLEARED = 0x38452c;
const BORDER_OPEN = 0xc9a227;
const BORDER_LOCKED = 0x3f3931;

export class LevelSelectScene extends Phaser.Scene {
  private saves!: SaveManager;

  constructor() {
    super(SceneKeys.LevelSelect);
  }

  create(): void {
    this.saves = new SaveManager();
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(0x1a1512);

    this.add
      .text(width * 0.5, 44, 'SELECT SECTOR', {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: '#c9a227',
      })
      .setOrigin(0.5);

    this.add
      .text(width - 24, 30, `CORES ${this.saves.cores}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#e8dcc6',
      })
      .setOrigin(1, 0);

    this.add
      .text(24, 30, `STARS ${this.saves.totalStars} / ${levels.length * 3}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#e8dcc6',
      })
      .setOrigin(0, 0);

    this.drawZones(width, height);

    if (this.saves.endlessUnlocked) {
      const best = this.saves.bestEndlessWave;
      createTextButton(
        this,
        width * 0.5,
        height - 42,
        best > 0 ? `ENDLESS  best wave ${best}` : 'ENDLESS',
        () => this.scene.start(SceneKeys.Battle, { levelId: ENDLESS_LEVEL_ID }),
      );
      createTextButton(this, width * 0.18, height - 42, 'HANGAR', () => {
        this.scene.start(SceneKeys.Hangar);
      });
      createTextButton(this, width * 0.82, height - 42, 'MENU', () => {
        this.scene.start(SceneKeys.MainMenu);
      });
      return;
    }

    createTextButton(this, width * 0.34, height - 42, 'HANGAR', () => {
      this.scene.start(SceneKeys.Hangar);
    });
    createTextButton(this, width * 0.66, height - 42, 'MENU', () => {
      this.scene.start(SceneKeys.MainMenu);
    });
  }

  private drawZones(width: number, height: number): void {
    const zones = [...new Set(levels.map((level) => level.zone))].sort((a, b) => a - b);
    const topOffset = 96;
    const rowHeight = (height - topOffset - 90) / Math.max(1, zones.length);

    zones.forEach((zone, index) => {
      const rowY = topOffset + rowHeight * index + 20;
      const inZone = levels.filter((level) => level.zone === zone);

      this.add
        .text(24, rowY, ZONE_NAMES[zone] ?? `ZONE ${zone}`, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#9a8f7c',
        })
        .setOrigin(0, 0);

      const rowWidth = inZone.length * NODE_WIDTH + (inZone.length - 1) * NODE_GAP;
      const startX = (width - rowWidth) * 0.5;

      inZone.forEach((level, column) => {
        this.drawNode(level, startX + column * (NODE_WIDTH + NODE_GAP), rowY + 28);
      });
    });
  }

  private drawNode(level: LevelDef, x: number, y: number): void {
    const unlocked = this.saves.isUnlocked(level.id);
    const progress = this.saves.progressFor(level.id);
    const number = level.id.replace('level-', '');

    const background = this.add
      .rectangle(
        x,
        y,
        NODE_WIDTH,
        NODE_HEIGHT,
        unlocked ? (progress.cleared ? FILL_CLEARED : FILL_OPEN) : FILL_LOCKED,
      )
      .setOrigin(0, 0)
      .setStrokeStyle(2, unlocked ? BORDER_OPEN : BORDER_LOCKED)
      .setDepth(Depths.HUD);

    const title = level.boss ? `${number}  ${level.name} *` : `${number}  ${level.name}`;
    this.add
      .text(x + NODE_WIDTH * 0.5, y + 16, unlocked ? title : 'LOCKED', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: unlocked ? '#e8dcc6' : '#5c554c',
        align: 'center',
        wordWrap: { width: NODE_WIDTH - 14 },
      })
      .setOrigin(0.5, 0)
      .setDepth(Depths.HUD + 1);

    this.drawStars(x + NODE_WIDTH * 0.5, y + NODE_HEIGHT - 16, progress.stars, unlocked);

    if (!unlocked) return;

    background.setInteractive({ useHandCursor: true });
    background.on('pointerover', () => background.setFillStyle(FILL_HOVER));
    background.on('pointerout', () =>
      background.setFillStyle(progress.cleared ? FILL_CLEARED : FILL_OPEN),
    );
    background.on('pointerup', () => {
      this.scene.start(SceneKeys.Battle, { levelId: level.id });
    });
  }

  /** Three diamonds, filled for earned stars. Drawn, so no font can drop them. */
  private drawStars(centerX: number, y: number, earned: number, unlocked: boolean): void {
    const total = 3;
    const left = centerX - ((total - 1) * STAR_GAP) / 2;

    for (let i = 0; i < total; i += 1) {
      const filled = i < earned;
      this.add
        .rectangle(
          left + i * STAR_GAP,
          y,
          STAR_SIZE,
          STAR_SIZE,
          filled ? 0xc9a227 : unlocked ? 0x4a443c : 0x2e2822,
        )
        .setAngle(45)
        .setDepth(Depths.HUD + 1);
    }
  }
}
