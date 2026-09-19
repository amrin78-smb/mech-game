import Phaser from 'phaser';

import { SceneKeys } from './SceneKeys';

/**
 * Nothing but startup wiring. In dev it validates every JSON data file against
 * its schema before a single system can read it, and shows the failure on
 * screen rather than dying silently.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  async create(): Promise<void> {
    if (import.meta.env.DEV) {
      try {
        const { validateAllData } = await import('../data/validate');
        validateAllData();
      } catch (error) {
        this.showDataError(error);
        return;
      }
    }
    this.scene.start(SceneKeys.Preload);
  }

  private showDataError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    this.add
      .text(24, 24, `DATA ERROR\n\n${message}`, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ff8b6b',
        wordWrap: { width: this.scale.width - 48 },
      })
      .setOrigin(0, 0);
  }
}
