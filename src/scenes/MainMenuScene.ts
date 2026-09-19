import Phaser from 'phaser';

import { levels } from '../data';
import { createTextButton } from '../ui/TextButton';
import { SceneKeys } from './SceneKeys';

/**
 * Title and a way into each authored level. This is deliberately a plain list,
 * not the Phase 3 LevelSelectScene: no zone map, no locks, no stars, no save.
 * It exists so the Phase 2 content can be reached and played.
 */
export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.MainMenu);
  }

  create(): void {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(0x1a1512);

    this.add
      .text(width * 0.5, height * 0.22, 'SCRAP TITAN', {
        fontFamily: 'monospace',
        fontSize: '72px',
        color: '#c9a227',
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.33, 'Hold the line. The guns fight, you command.', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#9a8f7c',
      })
      .setOrigin(0.5);

    // A vertical list: level names vary in length, so a row would collide.
    const rowHeight = 52;
    const firstRowY = height * 0.44;
    levels.forEach((level, index) => {
      const number = level.id.replace('level-', '');
      const label = level.boss ? `${number}  ${level.name}  *` : `${number}  ${level.name}`;
      createTextButton(this, width * 0.5, firstRowY + index * rowHeight, label, () => {
        this.scene.start(SceneKeys.Battle, { levelId: level.id });
      });
    });

    this.add
      .text(width * 0.5, firstRowY + levels.length * rowHeight, '* boss level', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#6f6a62',
      })
      .setOrigin(0.5);

    this.add
      .text(
        width * 0.5,
        height * 0.92,
        'Weapons fire on their own. Drag anywhere to take manual aim,\n' +
          'release for a precision shot. Tap an enemy to focus fire.\n' +
          'Spend scrap on damage, fire rate and repairs while you fight.',
        {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#6f6a62',
          align: 'center',
        },
      )
      .setOrigin(0.5);
  }
}
