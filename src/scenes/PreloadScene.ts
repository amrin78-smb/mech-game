import Phaser from 'phaser';

import {
  ATLAS,
  BACKGROUND_THEMES,
  bgGroundKey,
  bgRuinsKey,
  bgSkyKey,
} from '../AssetKeys';
import { tuning } from '../data';
import { SceneKeys } from './SceneKeys';

/**
 * Loads the real art: one packed texture atlas for every sprite, plus the
 * parallax strips, which stay separate because they are large and tile.
 *
 * The art itself is still authored as code, in tools/art, and rendered to PNG
 * by `npm run art`. Moving it out of runtime means the cost is paid once at
 * build time, the frames can be far more detailed, and everything lands in a
 * single atlas so drawing a wave is one texture bind.
 *
 * Hard rule 5 still holds: every texture key comes from AssetKeys, so this is
 * the only file that changes when the art is replaced again.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Preload);
  }

  preload(): void {
    this.showProgress();

    this.load.setPath('art');
    this.load.atlas(ATLAS, 'sprites.png', 'sprites.json');

    for (const theme of BACKGROUND_THEMES) {
      this.load.image(bgSkyKey(theme), `bg_${theme}_sky.png`);
      this.load.image(bgRuinsKey(theme), `bg_${theme}_ruins.png`);
      this.load.image(bgGroundKey(theme), `bg_${theme}_ground.png`);
    }
  }

  create(): void {
    this.scene.start(SceneKeys.MainMenu);
  }

  /** A real loading bar, now that there is something to wait for. */
  private showProgress(): void {
    const { baseWidth, baseHeight } = tuning.world;
    const barWidth = baseWidth * 0.36;
    const left = (baseWidth - barWidth) * 0.5;
    const top = baseHeight * 0.5;

    this.add
      .text(baseWidth * 0.5, top - 34, 'SCRAP TITAN', {
        fontFamily: 'monospace',
        fontSize: '30px',
        color: '#c9a227',
      })
      .setOrigin(0.5);

    this.add
      .rectangle(left, top, barWidth, 12, 0x1a1512)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x6f6a62);

    const fill = this.add.rectangle(left + 2, top + 2, 0, 8, 0xc9a227).setOrigin(0, 0);

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      fill.width = (barWidth - 4) * value;
    });
  }
}
