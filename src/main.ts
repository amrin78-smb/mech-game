import Phaser from 'phaser';

import { tuning } from './data';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ResultsScene } from './scenes/ResultsScene';

/**
 * Game config and scene registration, nothing else.
 *
 * LevelSelectScene and HangarScene are Phase 3 and are not registered yet: the
 * Phase 1 flow is Boot -> Preload -> MainMenu -> Battle -> Results.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1a1512',
  width: tuning.world.baseWidth,
  height: tuning.world.baseHeight,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
  input: {
    activePointers: 2,
  },
  scene: [BootScene, PreloadScene, MainMenuScene, BattleScene, ResultsScene],
};

export default new Phaser.Game(config);
