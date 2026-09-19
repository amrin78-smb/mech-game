import Phaser from 'phaser';

import { getLevelDef, levels } from '../data';
import { SaveManager } from '../systems/SaveManager';
import { starCriteria } from '../systems/StarRating';
import type { BattleResult } from '../types';
import { createTextButton } from '../ui/TextButton';
import { SceneKeys } from './SceneKeys';

/**
 * Outcome, stars and the run's numbers. The save was already written by
 * BattleScene, so this only reports what was recorded and offers the ways on.
 */

const STAR_SIZE = 20;
const STAR_GAP = 40;

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
    const level = getLevelDef(this.result.levelId);

    this.cameras.main.setBackgroundColor(0x1a1512);

    this.add
      .text(width * 0.5, height * 0.12, won ? 'SECTOR HELD' : 'HULL BREACHED', {
        fontFamily: 'monospace',
        fontSize: '52px',
        color: won ? '#6fae4a' : '#c23b2a',
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.2, levelName, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#9a8f7c',
      })
      .setOrigin(0.5);

    this.drawStars(width * 0.5, height * 0.29, this.result.stars);

    const hullFraction = hullMax <= 0 ? 0 : hullRemaining / hullMax;
    this.drawCriteria(width * 0.5, height * 0.36, level, won, hullFraction);

    const hullPercent = Math.round(hullFraction * 100);
    const lines = [
      `Scrap earned      ${scrapEarned}`,
      `Enemies destroyed ${enemiesKilled}`,
      `Hull remaining    ${Math.ceil(hullRemaining)} / ${Math.ceil(hullMax)}  (${hullPercent}%)`,
      `Repairs bought    ${this.result.repairsUsed}`,
      `Time              ${this.result.durationSeconds.toFixed(1)}s`,
    ];

    this.add
      .text(width * 0.5, height * 0.58, lines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#e8dcc6',
        align: 'left',
        lineSpacing: 8,
      })
      .setOrigin(0.5);

    if (this.result.coresAwarded > 0) {
      this.add
        .text(width * 0.5, height * 0.72, `+${this.result.coresAwarded} CORES`, {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#c9a227',
        })
        .setOrigin(0.5);
    }

    this.drawButtons(width, height * 0.86, won);
  }

  private drawStars(centerX: number, y: number, earned: number): void {
    const total = 3;
    const left = centerX - ((total - 1) * STAR_GAP) / 2;
    for (let i = 0; i < total; i += 1) {
      this.add
        .rectangle(left + i * STAR_GAP, y, STAR_SIZE, STAR_SIZE, i < earned ? 0xc9a227 : 0x3f3931)
        .setAngle(45);
    }
  }

  private drawCriteria(
    centerX: number,
    y: number,
    level: ReturnType<typeof getLevelDef>,
    won: boolean,
    hullFraction: number,
  ): void {
    const criteria = starCriteria(level, won, hullFraction, this.result.repairsUsed);
    criteria.forEach((criterion, index) => {
      this.add
        .text(centerX, y + index * 22, `${criterion.met ? '+' : '-'}  ${criterion.label}`, {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: criterion.met ? '#6fae4a' : '#6f6a62',
        })
        .setOrigin(0.5);
    });
  }

  private drawButtons(width: number, y: number, won: boolean): void {
    const nextLevel = this.nextLevelId();
    const saves = new SaveManager();
    const showNext = won && nextLevel !== null && saves.isUnlocked(nextLevel);

    if (showNext) {
      createTextButton(this, width * 0.26, y, 'RETRY', () => this.replay());
      createTextButton(this, width * 0.5, y, 'NEXT LEVEL', () => {
        this.scene.start(SceneKeys.Battle, { levelId: nextLevel });
      });
      createTextButton(this, width * 0.74, y, 'MAP', () => {
        this.scene.start(SceneKeys.LevelSelect);
      });
      return;
    }

    createTextButton(this, width * 0.38, y, 'RETRY', () => this.replay());
    createTextButton(this, width * 0.62, y, 'MAP', () => {
      this.scene.start(SceneKeys.LevelSelect);
    });
  }

  private replay(): void {
    this.scene.start(SceneKeys.Battle, { levelId: this.result.levelId });
  }

  /** Levels are ordered by id, so the next one is simply the next entry. */
  private nextLevelId(): string | null {
    const index = levels.findIndex((level) => level.id === this.result.levelId);
    if (index < 0 || index + 1 >= levels.length) return null;
    return levels[index + 1].id;
  }
}
