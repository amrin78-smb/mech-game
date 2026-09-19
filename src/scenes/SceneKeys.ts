export const SceneKeys = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  MainMenu: 'MainMenuScene',
  LevelSelect: 'LevelSelectScene',
  Hangar: 'HangarScene',
  Battle: 'BattleScene',
  Results: 'ResultsScene',
  Pause: 'PauseScene',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
