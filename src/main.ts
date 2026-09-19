import Phaser from 'phaser';

import { tuning } from './data';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { HangarScene } from './scenes/HangarScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { PauseScene } from './scenes/PauseScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ResultsScene } from './scenes/ResultsScene';

/**
 * Game config and scene registration, nothing else.
 *
 * Flow: Boot -> Preload -> MainMenu -> LevelSelect -> Battle -> Results,
 * with Hangar reachable from LevelSelect.
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
  scene: [
    BootScene,
    PreloadScene,
    MainMenuScene,
    LevelSelectScene,
    HangarScene,
    BattleScene,
    ResultsScene,
    PauseScene,
  ],
};

// A long press to aim would otherwise open the browser context menu on Android.
window.addEventListener('contextmenu', (event) => event.preventDefault());

export default new Phaser.Game(config);
