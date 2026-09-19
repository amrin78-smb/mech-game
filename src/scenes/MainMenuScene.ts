import Phaser from 'phaser';

import { AssetKeys } from '../AssetKeys';
import { bindArt } from '../ArtBinding';
import { SaveManager } from '../systems/SaveManager';
import { createTextButton } from '../ui/TextButton';
import { SceneKeys } from './SceneKeys';

/**
 * Title, and the way into the campaign. Progress lives in the save, so this
 * only needs to report it and hand off to the zone map.
 */
export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.MainMenu);
  }

  create(): void {
    const { width, height } = this.scale;
    const saves = new SaveManager();

    this.cameras.main.setBackgroundColor(0x1a1512);

    bindArt(
      this,
      this.add.image(width * 0.5, height * 0.2, AssetKeys.TITLE_EMBLEM).setOrigin(0.5),
      AssetKeys.TITLE_EMBLEM,
    );

    this.add
      .text(width * 0.5, height * 0.38, 'SCRAP TITAN', {
        fontFamily: 'monospace',
        fontSize: '72px',
        color: '#c9a227',
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.46, 'Hold the line. The guns fight, you command.', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#9a8f7c',
      })
      .setOrigin(0.5);

    createTextButton(this, width * 0.5, height * 0.58, 'DEPLOY', () => {
      this.scene.start(SceneKeys.LevelSelect);
    });

    createTextButton(this, width * 0.5, height * 0.69, 'HANGAR', () => {
      this.scene.start(SceneKeys.Hangar);
    });

    this.add
      .text(
        width * 0.5,
        height * 0.79,
        `Cores ${saves.cores}   Stars ${saves.totalStars}`,
        { fontFamily: 'monospace', fontSize: '16px', color: '#e8dcc6' },
      )
      .setOrigin(0.5);

    this.add
      .text(
        width * 0.5,
        height * 0.87,
        'Weapons fire on their own. Drag anywhere to take manual aim,\n' +
          'release for a precision shot. Tap an enemy to focus fire.\n' +
          'Spend scrap mid battle, spend cores in the Hangar. Key 1 fires the pilot ability.',
        {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#6f6a62',
          align: 'center',
        },
      )
      .setOrigin(0.5);
  }
}
