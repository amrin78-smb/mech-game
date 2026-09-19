/**
 * Hard rule 5: every texture key in the game is named here. Placeholder art is
 * generated at runtime in PreloadScene, so swapping in a real sprite sheet later
 * only touches PreloadScene, never gameplay code.
 */
export const AssetKeys = {
  MECHA_LEGS: 'mecha_legs',
  MECHA_TORSO: 'mecha_torso',
  MECHA_CANNON: 'mecha_cannon',

  PROJECTILE_SHELL: 'projectile_shell',
  SCRAP_PICKUP: 'scrap_pickup',

  UI_PIXEL: 'ui_pixel',
  FOCUS_MARKER: 'focus_marker',
} as const;

/** Parallax layer keys for a level's `background` theme, e.g. "rust_flats". */
export function bgSkyKey(theme: string): string {
  return `bg_${theme}_sky`;
}

export function bgRuinsKey(theme: string): string {
  return `bg_${theme}_ruins`;
}

export function bgGroundKey(theme: string): string {
  return `bg_${theme}_ground`;
}

/** Themes PreloadScene generates placeholder parallax strips for. */
export const BACKGROUND_THEMES = ['rust_flats'] as const;
