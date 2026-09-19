import type Phaser from 'phaser';

import { ATLAS } from './AssetKeys';

/**
 * Chooses between the AI art in assets/sprites and the generated atlas, and
 * normalises display size so the two are interchangeable.
 *
 * Flip USE_PLACEHOLDER_ART to true and every sprite falls straight back to the
 * atlas, with no other change anywhere. That is the escape hatch if a generated
 * asset turns out to be broken.
 *
 * The AI art is exported at ART_SUPERSAMPLE times its on screen size, so it
 * stays crisp when the 1280x720 canvas is scaled up on a larger display. This
 * module is what pays that back down, so the in game footprint is identical to
 * the atlas it replaced.
 */
export const USE_PLACEHOLDER_ART = false;

/** Must match SUPERSAMPLE in scripts/process-art.ts. */
export const ART_SUPERSAMPLE = 2;

/** True when a processed AI texture exists for this name and is preferred. */
export function hasAiArt(scene: Phaser.Scene, name: string): boolean {
  return !USE_PLACEHOLDER_ART && scene.textures.exists(name);
}

/**
 * Points an image at the best art available for `name` and sets the scale that
 * makes it occupy exactly the size the atlas frame did.
 *
 * Only zone 1 has AI art; everything else (zone 2 and 3 enemies, VFX particles,
 * the flak shell) silently keeps using the atlas.
 */
export function bindArt(
  scene: Phaser.Scene,
  image: Phaser.GameObjects.Image,
  name: string,
): Phaser.GameObjects.Image {
  if (hasAiArt(scene, name)) {
    image.setTexture(name);
    image.setScale(1 / ART_SUPERSAMPLE);
  } else {
    image.setTexture(ATLAS, name);
    image.setScale(1);
  }
  return image;
}
