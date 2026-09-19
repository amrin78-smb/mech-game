import Phaser from 'phaser';

import { SaveManager, type SaveSettings } from '../systems/SaveManager';
import { Depths } from '../ui/Depths';
import { createTextButton } from '../ui/TextButton';
import { SceneKeys } from './SceneKeys';

/**
 * Pause and settings, run as an overlay scene on top of a paused BattleScene.
 * Keeping it separate is what lets its buttons stay live while the battle's own
 * update loop is stopped.
 *
 * Settings are written straight to the save, and the battle re-reads them on
 * resume so a change takes effect without restarting the level.
 */

export interface PauseSceneData {
  /** Scene to resume, so this works from anywhere that pauses. */
  readonly resumeKey: string;
  readonly onSettingsChanged?: (settings: SaveSettings) => void;
}

const ROW_HEIGHT = 46;
const TOGGLE_WIDTH = 108;
const PANEL_WIDTH = 520;
const PANEL_HEIGHT = 420;

const FILL = 0x3a2f26;
const FILL_ON = 0x38452c;
const FILL_OFF = 0x241e18;
const BORDER = 0xc9a227;

export class PauseScene extends Phaser.Scene {
  private options!: PauseSceneData;
  private saves!: SaveManager;

  constructor() {
    super(SceneKeys.Pause);
  }

  init(data: PauseSceneData): void {
    this.options = data;
  }

  create(): void {
    this.saves = new SaveManager();
    const { width, height } = this.scale;

    // Dim the battle behind rather than hiding it.
    this.add
      .rectangle(0, 0, width, height, 0x14100d, 0.82)
      .setOrigin(0, 0)
      .setDepth(Depths.OVERLAY - 1)
      .setInteractive();

    const left = (width - PANEL_WIDTH) * 0.5;
    const top = (height - PANEL_HEIGHT) * 0.5;

    this.add
      .rectangle(left, top, PANEL_WIDTH, PANEL_HEIGHT, 0x1f1a15)
      .setOrigin(0, 0)
      .setStrokeStyle(2, BORDER)
      .setDepth(Depths.OVERLAY - 1);

    this.add
      .text(width * 0.5, top + 28, 'PAUSED', {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: '#c9a227',
      })
      .setOrigin(0.5)
      .setDepth(Depths.OVERLAY);

    const rowsTop = top + 84;
    this.volumeRow(left + 32, rowsTop, PANEL_WIDTH - 64);
    this.toggleRow(left + 32, rowsTop + ROW_HEIGHT, PANEL_WIDTH - 64, 'Engine drone', 'musicEnabled');
    this.toggleRow(
      left + 32,
      rowsTop + ROW_HEIGHT * 2,
      PANEL_WIDTH - 64,
      'Camera shake',
      'shakeEnabled',
    );
    this.toggleRow(
      left + 32,
      rowsTop + ROW_HEIGHT * 3,
      PANEL_WIDTH - 64,
      'Low quality VFX',
      'lowQuality',
    );

    createTextButton(this, width * 0.5, top + PANEL_HEIGHT - 96, 'RESUME', () => this.resume());
    createTextButton(this, width * 0.5, top + PANEL_HEIGHT - 40, 'QUIT TO MAP', () => this.quit());

    this.input.keyboard?.on('keydown-ESC', () => this.resume());
    this.input.keyboard?.on('keydown-P', () => this.resume());
  }

  /** Volume as five steps rather than a drag slider: easier on a phone. */
  private volumeRow(x: number, y: number, rowWidth: number): void {
    this.add
      .text(x, y, 'Volume', { fontFamily: 'monospace', fontSize: '17px', color: '#e8dcc6' })
      .setOrigin(0, 0.5)
      .setDepth(Depths.OVERLAY);

    const steps = 5;
    const size = 30;
    const gap = 8;
    const totalWidth = steps * size + (steps - 1) * gap;
    const startX = x + rowWidth - totalWidth;
    const current = Math.round(this.saves.settings.masterVolume * steps);

    for (let i = 1; i <= steps; i += 1) {
      const block = this.add
        .rectangle(startX + (i - 1) * (size + gap), y, size, size, i <= current ? FILL_ON : FILL_OFF)
        .setStrokeStyle(2, BORDER)
        .setDepth(Depths.OVERLAY)
        .setInteractive({ useHandCursor: true });

      block.on('pointerup', () => {
        this.patch({ masterVolume: i / steps });
        this.scene.restart(this.options);
      });
    }
  }

  private toggleRow(
    x: number,
    y: number,
    rowWidth: number,
    label: string,
    key: 'musicEnabled' | 'shakeEnabled' | 'lowQuality',
  ): void {
    const value = this.saves.settings[key];

    this.add
      .text(x, y, label, { fontFamily: 'monospace', fontSize: '17px', color: '#e8dcc6' })
      .setOrigin(0, 0.5)
      .setDepth(Depths.OVERLAY);

    const background = this.add
      .rectangle(x + rowWidth - TOGGLE_WIDTH, y, TOGGLE_WIDTH, 34, value ? FILL_ON : FILL)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, BORDER)
      .setDepth(Depths.OVERLAY)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(x + rowWidth - TOGGLE_WIDTH * 0.5, y, value ? 'ON' : 'OFF', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: value ? '#e8dcc6' : '#9a8f7c',
      })
      .setOrigin(0.5)
      .setDepth(Depths.OVERLAY + 1);

    background.on('pointerup', () => {
      this.patch({ [key]: !value } as Partial<SaveSettings>);
      this.scene.restart(this.options);
    });
  }

  private patch(patch: Partial<SaveSettings>): void {
    this.saves.updateSettings(patch);
    this.options.onSettingsChanged?.(this.saves.settings);
  }

  private resume(): void {
    // Resume the battle before stopping this overlay, so there is no frame
    // where neither scene is running.
    this.scene.resume(this.options.resumeKey);
    this.scene.stop();
  }

  private quit(): void {
    this.scene.stop(this.options.resumeKey);
    // start() from this scene stops it and runs the map in its place.
    this.scene.start(SceneKeys.LevelSelect);
  }
}
