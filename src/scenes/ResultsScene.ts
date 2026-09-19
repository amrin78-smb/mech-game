import Phaser from 'phaser';

import type { BattleResult } from '../types';
import { createTextButton } from '../ui/TextButton';
import { SceneKeys } from './SceneKeys';

/**
 * Outcome, the run's numbers, and a way back in. Stars, cores and the save file
 * are Phase 3, so this reports what happened and nothing more.
 */
export class ResultsScene extends Phaser.Scene {
  private result!: BattleResult;

  constructor() {
    super(SceneKeys.Results);
  }

  init(data: BattleResult): void {
    this.result = data;
  }

  create(): void {
    const { width, height } = this.scale;
    const { won, levelName, scrapEarned, enemiesKilled, hullRemaining, hullMax } = this.result;

    this.cameras.main.setBackgroundColor(0x1a1512);

    this.add
      .text(width * 0.5, height * 0.22, won ? 'SECTOR HELD' : 'HULL BREACHED', {
        fontFamily: 'monospace',
        fontSize: '56px',
        color: won ? '#6fae4a' : '#c23b2a',
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.32, levelName, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#9a8f7c',
      })
      .setOrigin(0.5);

    const hullPercent = hullMax <= 0 ? 0 : Math.round((hullRemaining / hullMax) * 100);
    const lines = [
      `Scrap earned      ${scrapEarned}`,
      `Enemies destroyed ${enemiesKilled}`,
      `Hull remaining    ${Math.ceil(hullRemaining)} / ${Math.ceil(hullMax)}  (${hullPercent}%)`,
      `Time              ${this.result.durationSeconds.toFixed(1)}s`,
    ];

    this.add
      .text(width * 0.5, height * 0.48, lines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#e8dcc6',
        align: 'left',
        lineSpacing: 10,
      })
      .setOrigin(0.5);

    createTextButton(this, width * 0.38, height * 0.74, 'RETRY', () => {
      this.scene.start(SceneKeys.Battle, { levelId: this.result.levelId });
    });

    createTextButton(this, width * 0.62, height * 0.74, 'MENU', () => {
      this.scene.start(SceneKeys.MainMenu);
    });
  }
}
