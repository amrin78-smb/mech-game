import Phaser from 'phaser';

import { tuning } from '../data';
import { Depths } from './Depths';

/**
 * Timed hints on the first level only. The script lives in tuning.tutorial, so
 * rewording a hint or adding one is a data change.
 *
 * One reused Text object fading in and out: no allocation per hint, and no
 * tween churn on a scene that already has plenty to do.
 */

const FADE = 0.4;

export class TutorialHints {
  private readonly text: Phaser.GameObjects.Text;
  private readonly steps = tuning.tutorial.steps;
  private readonly enabled: boolean;

  private index = 0;
  private elapsed = 0;
  private showing = false;
  private showRemaining = 0;

  constructor(scene: Phaser.Scene, levelId: string, width: number, height: number) {
    this.enabled = levelId === tuning.tutorial.levelId;

    this.text = scene.add
      .text(width * 0.5, height * 0.3, '', {
        fontFamily: 'monospace',
        fontSize: '19px',
        color: '#e8dcc6',
        backgroundColor: '#1a1512cc',
        padding: { x: 16, y: 10 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(Depths.OVERLAY)
      .setAlpha(0)
      .setVisible(false);
  }

  update(deltaSeconds: number): void {
    if (!this.enabled) return;
    this.elapsed += deltaSeconds;

    if (!this.showing && this.index < this.steps.length) {
      const next = this.steps[this.index];
      if (this.elapsed >= next.at) {
        this.text.setText(next.text).setVisible(true).setAlpha(0);
        this.showing = true;
        this.showRemaining = next.duration;
        this.index += 1;
      }
    }

    if (!this.showing) return;

    this.showRemaining -= deltaSeconds;
    if (this.showRemaining <= 0) {
      this.showing = false;
      this.text.setVisible(false);
      return;
    }

    // Fade in at the start, out at the end, hold in between.
    const step = this.steps[this.index - 1];
    const shown = step.duration - this.showRemaining;
    const alpha =
      shown < FADE
        ? shown / FADE
        : this.showRemaining < FADE
          ? this.showRemaining / FADE
          : 1;
    this.text.setAlpha(Phaser.Math.Clamp(alpha, 0, 1));
  }

  /** Called when the player clearly already knows: stop nagging. */
  skipRemaining(): void {
    this.index = this.steps.length;
    this.showing = false;
    this.text.setVisible(false);
  }
}
