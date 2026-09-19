import Phaser from 'phaser';

import { Depths } from './Depths';

/**
 * A plain framed text button. Menus are deliberately minimal in Phase 1; the
 * zone map and hangar cards arrive in Phase 3.
 */

const PADDING_X = 26;
const PADDING_Y = 12;
const FILL = 0x3a2f26;
const FILL_HOVER = 0x5c4736;
const BORDER = 0xc9a227;
const TEXT_COLOR = '#e8dcc6';

export function createTextButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
): void {
  const text = scene.add
    .text(x, y, label, { fontFamily: 'monospace', fontSize: '24px', color: TEXT_COLOR })
    .setOrigin(0.5)
    .setDepth(Depths.OVERLAY + 1);

  const background = scene.add
    .rectangle(x, y, text.width + PADDING_X * 2, text.height + PADDING_Y * 2, FILL)
    .setStrokeStyle(2, BORDER)
    .setDepth(Depths.OVERLAY);

  background.setInteractive({ useHandCursor: true });
  background.on('pointerover', () => background.setFillStyle(FILL_HOVER));
  background.on('pointerout', () => background.setFillStyle(FILL));
  background.on('pointerup', onClick);
}
