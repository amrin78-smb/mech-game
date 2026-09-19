import Phaser from 'phaser';

import type { PilotSystem } from '../systems/PilotSystem';
import { Depths } from './Depths';

/**
 * The pilot ability button, bottom right so thumbs reach it on a phone while
 * the upgrade panel keeps the bottom left. Keyboard 1 fires it too, per
 * GAME_DESIGN section 3.
 */

const MARGIN = 18;
const SIZE = 96;
const FILL_READY = 0x3a2f26;
const FILL_COOLING = 0x272019;
const FILL_ACTIVE = 0x6f5a2a;
const BORDER_READY = 0xc9a227;
const BORDER_COOLING = 0x4a443c;
const TEXT_READY = '#e8dcc6';
const TEXT_COOLING = '#6f6a62';

export class AbilityButton {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly sweep: Phaser.GameObjects.Rectangle;
  private readonly name: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly pilots: PilotSystem;

  private lastStatusKey = Number.NaN;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    pilots: PilotSystem,
    onActivate: () => void,
  ) {
    this.pilots = pilots;

    const left = width - MARGIN - SIZE;
    const top = height - MARGIN - SIZE;

    this.background = scene.add
      .rectangle(left, top, SIZE, SIZE, FILL_READY)
      .setOrigin(0, 0)
      .setStrokeStyle(2, BORDER_READY)
      .setScrollFactor(0)
      .setDepth(Depths.HUD);

    // Drains downward as the cooldown runs out.
    this.sweep = scene.add
      .rectangle(left + 2, top + SIZE - 2, SIZE - 4, 0, 0x000000, 0.45)
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(Depths.HUD + 1);

    this.name = scene.add
      .text(left + SIZE * 0.5, top + 22, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: TEXT_READY,
        align: 'center',
        wordWrap: { width: SIZE - 12 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(Depths.HUD + 2);

    this.status = scene.add
      .text(left + SIZE * 0.5, top + SIZE - 22, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: TEXT_READY,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(Depths.HUD + 2);

    this.background.setInteractive({ useHandCursor: true });
    this.background.on('pointerup', onActivate);

    scene.input.keyboard?.on('keydown-ONE', onActivate);

    this.name.setText(pilots.abilityName);
    this.setVisible(pilots.hasPilot);
  }

  update(): void {
    if (!this.pilots.hasPilot) return;

    // Compare a cheap numeric key first: building the label every frame would
    // allocate a string 60 times a second for a readout that changes ~10 times.
    const key = this.pilots.isActive
      ? Math.ceil(this.pilots.activeSecondsLeft * 10)
      : this.pilots.isReady
        ? -1
        : -2 - Math.ceil(this.pilots.cooldown);

    if (key !== this.lastStatusKey) {
      this.lastStatusKey = key;
      this.status.setText(
        this.pilots.isActive
          ? `${this.pilots.activeSecondsLeft.toFixed(1)}s`
          : this.pilots.isReady
            ? 'READY'
            : `${Math.ceil(this.pilots.cooldown)}s`,
      );

      const ready = this.pilots.isReady;
      const active = this.pilots.isActive;
      this.background.setFillStyle(active ? FILL_ACTIVE : ready ? FILL_READY : FILL_COOLING);
      this.background.setStrokeStyle(2, ready || active ? BORDER_READY : BORDER_COOLING);
      this.name.setColor(ready || active ? TEXT_READY : TEXT_COOLING);
      this.status.setColor(ready || active ? TEXT_READY : TEXT_COOLING);
    }

    this.sweep.height = (SIZE - 4) * this.pilots.cooldownFraction;
  }

  setVisible(visible: boolean): void {
    this.background.setVisible(visible);
    this.sweep.setVisible(visible);
    this.name.setVisible(visible);
    this.status.setVisible(visible);
  }
}
