import Phaser from 'phaser';

import { levels } from '../data';
import { createTextButton } from '../ui/TextButton';
import { SceneKeys } from './SceneKeys';

/**
 * Title and a start button, nothing more. The zone map with locks and stars is
 * LevelSelectScene in Phase 3; until then Start drops straight into level 1.
 */
export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.MainMenu);
  }

  create(): void {
    const { width, height } = this.scale;
    const firstLevel = levels[0];

    this.cameras.main.setBackgroundColor(0x1a1512);

    this.add
      .text(width * 0.5, height * 0.3, 'SCRAP TITAN', {
        fontFamily: 'monospace',
        fontSize: '72px',
        color: '#c9a227',
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.42, 'Hold the line. The guns fight, you command.', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#9a8f7c',
      })
      .setOrigin(0.5);

    createTextButton(this, width * 0.5, height * 0.58, `START  ${firstLevel.name}`, () => {
      this.scene.start(SceneKeys.Battle, { levelId: firstLevel.id });
    });

    this.add
      .text(
        width * 0.5,
        height * 0.75,
        'Weapons fire on their own. Drag anywhere to take manual aim,\n' +
          'release for a precision shot. Tap an enemy to focus fire.',
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
