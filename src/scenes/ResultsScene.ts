import Phaser from 'phaser';

import { getLevelDef, levels } from '../data';
import { ENDLESS_LEVEL_ID } from '../systems/EndlessTimeline';
import { SaveManager } from '../systems/SaveManager';
import { starCriteria } from '../systems/StarRating';
import type { BattleResult } from '../types';
import { createTextButton } from '../ui/TextButton';
import { SceneKeys } from './SceneKeys';

/**
 * Outcome, stars and the run's numbers. The save was already written by
 * BattleScene, so this only reports what was recorded and offers the ways on.
 *
 * Endless runs have no star criteria and no next level, so they get their own
 * layout: how far you got, and whether it beat your best.
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

    this.cameras.main.setBackgroundColor(0x1a1512);

    if (this.result.endlessWaves !== undefined) {
      this.createEndless(width, height, this.result.endlessWaves);
      return;
    }

    this.createCampaign(width, height);
  }

  // Campaign ---------------------------------------------------------------

  private createCampaign(width: number, height: number): void {
    const { won, levelName, hullRemaining, hullMax } = this.result;
    const level = getLevelDef(this.result.levelId);

    this.heading(width, height, won ? 'SECTOR HELD' : 'HULL BREACHED', won, levelName);

    this.drawStars(width * 0.5, height * 0.29, this.result.stars);

    const hullFraction = hullMax <= 0 ? 0 : hullRemaining / hullMax;
    this.drawCriteria(width * 0.5, height * 0.36, level, won, hullFraction);

    this.drawRunLines(width, height * 0.58, hullFraction);
    this.drawCores(width, height * 0.72);
    this.drawButtons(width, height * 0.86, won);
  }

  // Endless ----------------------------------------------------------------

  private createEndless(width: number, height: number, waves: number): void {
    const { hullRemaining, hullMax } = this.result;
    const best = new SaveManager().bestEndlessWave;
    const record = this.result.endlessRecord === true;
    const cleared = this.result.won;

    this.heading(
      width,
      height,
      cleared ? 'TIMELINE CLEARED' : 'RUN ENDED',
      cleared,
      'ENDLESS',
    );

    this.add
      .text(width * 0.5, height * 0.32, `WAVE ${waves}`, {
        fontFamily: 'monospace',
        fontSize: '56px',
        color: '#c9a227',
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.41, record ? 'NEW BEST' : `best wave ${best}`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: record ? '#6fae4a' : '#9a8f7c',
      })
      .setOrigin(0.5);

    const hullFraction = hullMax <= 0 ? 0 : hullRemaining / hullMax;
    this.drawRunLines(width, height * 0.6, hullFraction);
    this.drawCores(width, height * 0.74);

    createTextButton(this, width * 0.38, height * 0.86, 'AGAIN', () => this.replay());
    createTextButton(this, width * 0.62, height * 0.86, 'MAP', () => {
      this.scene.start(SceneKeys.LevelSelect);
    });
  }

  // Shared drawing ---------------------------------------------------------

  private heading(
    width: number,
    height: number,
    title: string,
    good: boolean,
    subtitle: string,
  ): void {
    this.add
      .text(width * 0.5, height * 0.12, title, {
        fontFamily: 'monospace',
        fontSize: '52px',
        color: good ? '#6fae4a' : '#c23b2a',
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.2, subtitle, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#9a8f7c',
      })
      .setOrigin(0.5);
  }

  private drawRunLines(width: number, y: number, hullFraction: number): void {
    const { scrapEarned, enemiesKilled, hullRemaining, hullMax } = this.result;
    const hullPercent = Math.round(hullFraction * 100);

    const lines = [
      `Scrap earned      ${scrapEarned}`,
      `Enemies destroyed ${enemiesKilled}`,
      `Hull remaining    ${Math.ceil(hullRemaining)} / ${Math.ceil(hullMax)}  (${hullPercent}%)`,
      `Repairs bought    ${this.result.repairsUsed}`,
      `Time              ${this.result.durationSeconds.toFixed(1)}s`,
    ];

    this.add
      .text(width * 0.5, y, lines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#e8dcc6',
        align: 'left',
        lineSpacing: 8,
      })
      .setOrigin(0.5);
  }

  private drawCores(width: number, y: number): void {
    if (this.result.coresAwarded <= 0) return;
    this.add
      .text(width * 0.5, y, `+${this.result.coresAwarded} CORES`, {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#c9a227',
      })
      .setOrigin(0.5);
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

  /** Endless replays reroll the seed, because the id is all BattleScene needs. */
  private replay(): void {
    this.scene.start(SceneKeys.Battle, { levelId: this.result.levelId });
  }

  /** Levels are ordered by id, so the next one is simply the next entry. */
  private nextLevelId(): string | null {
    if (this.result.levelId === ENDLESS_LEVEL_ID) return null;
    const index = levels.findIndex((level) => level.id === this.result.levelId);
    if (index < 0 || index + 1 >= levels.length) return null;
    return levels[index + 1].id;
  }
}
