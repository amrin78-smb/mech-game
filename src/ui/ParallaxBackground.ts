import Phaser from 'phaser';

import { bgGroundKey, bgRuinsKey, bgSkyKey } from '../AssetKeys';
import { tuning } from '../data';
import { Depths } from './Depths';

/**
 * Three layer parallax for the level's background theme. The mecha never moves,
 * the world does: each layer scrolls at the level's scrollSpeed times its factor
 * from tuning.world.parallax, so the sky crawls and the ground races.
 */
export class ParallaxBackground {
  private readonly sky: Phaser.GameObjects.TileSprite;
  private readonly ruins: Phaser.GameObjects.TileSprite;
  private readonly ground: Phaser.GameObjects.TileSprite;
  private readonly factors = tuning.world.parallax;

  constructor(scene: Phaser.Scene, theme: string, width: number, height: number) {
    this.sky = scene.add
      .tileSprite(0, 0, width, height, bgSkyKey(theme))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(Depths.BG_SKY);
    this.ruins = scene.add
      .tileSprite(0, 0, width, height, bgRuinsKey(theme))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(Depths.BG_RUINS);
    this.ground = scene.add
      .tileSprite(0, 0, width, height, bgGroundKey(theme))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(Depths.BG_GROUND);
  }

  update(deltaSeconds: number, scrollSpeed: number): void {
    const distance = scrollSpeed * deltaSeconds;
    this.sky.tilePositionX += distance * this.factors.sky;
    this.ruins.tilePositionX += distance * this.factors.ruins;
    this.ground.tilePositionX += distance * this.factors.ground;
  }
}
