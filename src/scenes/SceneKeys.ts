export const SceneKeys = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  MainMenu: 'MainMenuScene',
  Battle: 'BattleScene',
  Results: 'ResultsScene',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
