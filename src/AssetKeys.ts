/**
 * Hard rule 5: every texture key in the game is named here.
 *
 * Sprites live in one packed atlas built by `npm run art` from tools/art, so
 * these names are atlas frame names: `scene.add.image(x, y, ATLAS, AssetKeys.X)`.
 * The parallax strips are separate images, since they are large and tile.
 */
export const ATLAS = 'sprites';

export const AssetKeys = {
  MECHA_LEGS: 'mecha_legs',
  MECHA_TORSO: 'mecha_torso',
  MECHA_CANNON: 'mecha_cannon',

  MECHA_TURRET: 'mecha_turret',
  /** Cannon art per main weapon; see cannonArtFor. */
  WEAPON_ACID_SPITTER: 'weapon_acid_spitter',
  WEAPON_RAILGUN: 'weapon_railgun',

  PROJECTILE_SHELL: 'projectile_shell',
  PROJECTILE_FLAK: 'projectile_flak',
  SCRAP_PICKUP: 'scrap_pickup',

  MUZZLE_FLASH: 'muzzle_flash',
  SPARK: 'spark',
  SMOKE_PUFF: 'smoke_puff',
  DEBRIS: 'debris',

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

/**
 * The cannon sprite for an equipped main weapon. Buying the Railgun should look
 * different, not just hit differently. Falls back to the autocannon barrel for
 * any weapon without its own art.
 */
const CANNON_ART: Record<string, string> = {
  acid_spitter: 'weapon_acid_spitter',
  railgun: 'weapon_railgun',
};

export function cannonArtFor(weaponId: string): string {
  return CANNON_ART[weaponId] ?? 'mecha_cannon';
}

/** Themes PreloadScene generates placeholder parallax strips for, one per zone. */
export const BACKGROUND_THEMES = ['rust_flats', 'ash_canyons', 'furnace'] as const;

export type BackgroundTheme = (typeof BACKGROUND_THEMES)[number];
