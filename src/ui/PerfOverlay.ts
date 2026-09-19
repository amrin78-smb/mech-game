import Phaser from 'phaser';

import { Depths } from './Depths';

/**
 * Dev only readout: framerate plus live pool occupancy, toggled with F.
 *
 * Hard rule 2 says pooling is mandatory, and this is how that claim gets
 * checked rather than assumed: if an "active" count climbs without ever coming
 * back down, something is leaking. It refreshes a few times a second, not every
 * frame, so watching it does not skew what it measures.
 */

const REFRESH_SECONDS = 0.25;

export interface PerfCounts {
  enemies: number;
  projectiles: number;
}

export class PerfOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private readonly scene: Phaser.Scene;
  private elapsed = 0;
  private visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.text = scene.add
      .text(18, 140, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#6fae4a',
        backgroundColor: '#1a1512cc',
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(Depths.OVERLAY)
      .setVisible(false);

    scene.input.keyboard?.on('keydown-F', () => {
      this.visible = !this.visible;
      this.text.setVisible(this.visible);
    });
  }

  update(deltaSeconds: number, counts: PerfCounts): void {
    if (!this.visible) return;

    this.elapsed += deltaSeconds;
    if (this.elapsed < REFRESH_SECONDS) return;
    this.elapsed = 0;

    const fps = this.scene.game.loop.actualFps;
    this.text.setText(
      `fps ${fps.toFixed(0)}\n` +
        `enemies ${counts.enemies}\n` +
        `shells  ${counts.projectiles}`,
    );
  }
}
