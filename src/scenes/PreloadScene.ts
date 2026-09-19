import Phaser from 'phaser';

import {
  AssetKeys,
  BACKGROUND_THEMES,
  bgGroundKey,
  bgRuinsKey,
  bgSkyKey,
} from '../AssetKeys';
import { enemies, tuning } from '../data';
import type { ArmorClass, EnemyDef } from '../types';
import { SceneKeys } from './SceneKeys';

/**
 * Hard rule 5: all placeholder art is generated here with Graphics.generateTexture,
 * so gameplay is never blocked on assets. Silhouettes and sizes are meant to be
 * correct even though the shapes are crude; every enemy texture is rasterised at
 * its own `scale`, so entities never call setScale just to size themselves.
 *
 * When real sprite sheets arrive, this file is the only one that changes.
 */

/** Dieselpunk placeholder palette: rust, brass, iron, ash. */
const Palette = {
  rustDark: 0x5c2f1b,
  rust: 0x8a4a2b,
  rustLight: 0xb56a3c,
  brass: 0xc9a227,
  brassDark: 0x8a6f1a,
  iron: 0x4a4640,
  ironDark: 0x2b2825,
  ironLight: 0x6f6a62,
  skyTop: 0x2f2b27,
  skyBottom: 0x9a8468,
  ruins: 0x322b25,
  ruinsFar: 0x3e362e,
  ground: 0x4a3d30,
  groundDark: 0x33291f,
  groundCrack: 0x241c15,
  enemyLight: 0x6e241d,
  enemyLightTrim: 0x9c3a2a,
  enemyArmored: 0x55504a,
  enemyShielded: 0x3f6b78,
  enemySwarm: 0x6a5a3a,
} as const;

/** Placeholder body size per armor class, before the def's scale is applied. */
const ENEMY_BASE_SIZE: Record<ArmorClass, { width: number; height: number }> = {
  light: { width: 48, height: 32 },
  armored: { width: 56, height: 46 },
  shielded: { width: 52, height: 50 },
  swarm: { width: 26, height: 22 },
};

const MECHA_LEGS = { width: 124, height: 150 };
const MECHA_TORSO = { width: 164, height: 132 };
const MECHA_CANNON = { width: 172, height: 30 };
const SHELL = { width: 16, height: 6 };
const SCRAP = { width: 16, height: 16 };
const FOCUS_MARKER_SIZE = 72;
const FOCUS_MARKER_ARM = 18;
const FOCUS_MARKER_THICKNESS = 4;

/** Where the ground meets the sky in the parallax strips, as a fraction of height. */
const GROUND_TOP_FRACTION = 0.5;
const SKY_STRIP_WIDTH = 256;
const RUINS_STRIP_WIDTH = 512;
const GROUND_STRIP_WIDTH = 512;
const SKY_BAND_COUNT = 32;

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Preload);
  }

  preload(): void {
    // No file loading yet: Phase 1 art is generated, audio arrives in Phase 2.
  }

  create(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    const { baseHeight } = tuning.world;

    this.generateUtilityTextures(graphics);
    this.generateMechaTextures(graphics);
    this.generateProjectileTextures(graphics);

    for (const theme of BACKGROUND_THEMES) {
      this.generateSky(graphics, theme, baseHeight);
      this.generateRuins(graphics, theme, baseHeight);
      this.generateGround(graphics, theme, baseHeight);
    }

    for (const def of enemies) {
      this.generateEnemy(graphics, def);
    }

    graphics.destroy();
    this.scene.start(SceneKeys.MainMenu);
  }

  /** generateTexture leaves the key in the cache, so a scene restart must not redraw. */
  private bake(
    graphics: Phaser.GameObjects.Graphics,
    key: string,
    width: number,
    height: number,
  ): void {
    if (!this.textures.exists(key)) {
      graphics.generateTexture(key, width, height);
    }
    graphics.clear();
  }

  private generateUtilityTextures(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1);
    this.bake(g, AssetKeys.UI_PIXEL, 1, 1);

    // Four corner brackets, the focus target marker.
    const s = FOCUS_MARKER_SIZE;
    const a = FOCUS_MARKER_ARM;
    const t = FOCUS_MARKER_THICKNESS;
    g.fillStyle(Palette.brass, 1);
    g.fillRect(0, 0, a, t).fillRect(0, 0, t, a);
    g.fillRect(s - a, 0, a, t).fillRect(s - t, 0, t, a);
    g.fillRect(0, s - t, a, t).fillRect(0, s - a, t, a);
    g.fillRect(s - a, s - t, a, t).fillRect(s - t, s - a, t, a);
    this.bake(g, AssetKeys.FOCUS_MARKER, s, s);
  }

  private generateMechaTextures(g: Phaser.GameObjects.Graphics): void {
    // Legs: hip block, two heavy thighs, splayed feet.
    const legs = MECHA_LEGS;
    const hipHeight = Math.round(legs.height * 0.22);
    const footHeight = Math.round(legs.height * 0.12);
    const thighWidth = Math.round(legs.width * 0.3);
    const thighInset = Math.round(legs.width * 0.12);
    const footWidth = Math.round(legs.width * 0.42);
    const thighTop = hipHeight;
    const thighHeight = legs.height - hipHeight - footHeight;

    g.fillStyle(Palette.ironDark, 1).fillRect(0, 0, legs.width, hipHeight);
    g.fillStyle(Palette.iron, 1).fillRect(6, 4, legs.width - 12, hipHeight - 8);
    g.fillStyle(Palette.rustDark, 1);
    g.fillRect(thighInset, thighTop, thighWidth, thighHeight);
    g.fillRect(legs.width - thighInset - thighWidth, thighTop, thighWidth, thighHeight);
    g.fillStyle(Palette.rust, 1);
    const kneeHeight = Math.round(thighHeight * 0.4);
    g.fillRect(thighInset + 4, thighTop + 8, thighWidth - 8, kneeHeight);
    g.fillRect(legs.width - thighInset - thighWidth + 4, thighTop + 8, thighWidth - 8, kneeHeight);
    g.fillStyle(Palette.ironDark, 1);
    g.fillRect(0, legs.height - footHeight, footWidth, footHeight);
    g.fillRect(legs.width - footWidth, legs.height - footHeight, footWidth, footHeight);
    this.bake(g, AssetKeys.MECHA_LEGS, legs.width, legs.height);

    // Torso: riveted boiler, brass cockpit plate, two exhaust stacks.
    const torso = MECHA_TORSO;
    const stackWidth = Math.round(torso.width * 0.1);
    const stackHeight = Math.round(torso.height * 0.26);
    const plateWidth = Math.round(torso.width * 0.3);
    const plateX = torso.width - Math.round(torso.width * 0.38);
    g.fillStyle(Palette.ironDark, 1);
    g.fillRect(Math.round(torso.width * 0.18), 0, stackWidth, stackHeight);
    g.fillRect(Math.round(torso.width * 0.34), Math.round(stackHeight * 0.25), stackWidth, stackHeight);
    g.fillStyle(Palette.rustDark, 1).fillRect(0, stackHeight, torso.width, torso.height - stackHeight);
    g.fillStyle(Palette.rust, 1).fillRect(8, stackHeight + 8, torso.width - 16, torso.height - stackHeight - 16);
    g.fillStyle(Palette.rustLight, 1).fillRect(12, stackHeight + 12, plateWidth, 8);
    g.fillStyle(Palette.brassDark, 1).fillRect(plateX, stackHeight + 22, plateWidth, 18);
    g.fillStyle(Palette.brass, 1).fillRect(plateX + 3, stackHeight + 25, plateWidth - 6, 12);
    g.fillStyle(Palette.ironLight, 1);
    for (let x = 14; x < torso.width - 14; x += 18) {
      g.fillRect(x, torso.height - 14, 5, 5);
    }
    this.bake(g, AssetKeys.MECHA_TORSO, torso.width, torso.height);

    // Cannon: breech block at the left (the pivot end), banded barrel, muzzle brake right.
    const cannon = MECHA_CANNON;
    const breechWidth = Math.round(cannon.width * 0.22);
    const barrelTop = Math.round(cannon.height * 0.26);
    const barrelHeight = cannon.height - barrelTop * 2;
    g.fillStyle(Palette.ironDark, 1).fillRect(0, 0, breechWidth, cannon.height);
    g.fillStyle(Palette.iron, 1).fillRect(3, 3, breechWidth - 6, cannon.height - 6);
    g.fillStyle(Palette.rustDark, 1).fillRect(breechWidth, barrelTop, cannon.width - breechWidth, barrelHeight);
    g.fillStyle(Palette.rust, 1).fillRect(breechWidth, barrelTop + 2, cannon.width - breechWidth, 3);
    g.fillStyle(Palette.brassDark, 1);
    for (let x = breechWidth + 14; x < cannon.width - 26; x += 26) {
      g.fillRect(x, barrelTop - 3, 6, barrelHeight + 6);
    }
    g.fillStyle(Palette.brass, 1).fillRect(cannon.width - 18, barrelTop - 5, 18, barrelHeight + 10);
    this.bake(g, AssetKeys.MECHA_CANNON, cannon.width, cannon.height);
  }

  private generateProjectileTextures(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(Palette.brassDark, 1).fillRect(0, 0, SHELL.width, SHELL.height);
    g.fillStyle(Palette.brass, 1).fillRect(0, 1, SHELL.width - 4, SHELL.height - 2);
    g.fillStyle(Palette.rustLight, 1).fillRect(SHELL.width - 4, 0, 4, SHELL.height);
    this.bake(g, AssetKeys.PROJECTILE_SHELL, SHELL.width, SHELL.height);

    const half = SCRAP.width / 2;
    g.fillStyle(Palette.brassDark, 1);
    g.fillTriangle(half, 0, SCRAP.width, half, 0, half);
    g.fillTriangle(0, half, SCRAP.width, half, half, SCRAP.height);
    g.fillStyle(Palette.brass, 1);
    g.fillTriangle(half, 3, SCRAP.width - 3, half, 3, half);
    this.bake(g, AssetKeys.SCRAP_PICKUP, SCRAP.width, SCRAP.height);
  }

  private generateSky(g: Phaser.GameObjects.Graphics, theme: string, height: number): void {
    const top = Phaser.Display.Color.ValueToColor(Palette.skyTop);
    const bottom = Phaser.Display.Color.ValueToColor(Palette.skyBottom);
    const bandHeight = Math.ceil(height / SKY_BAND_COUNT);
    for (let i = 0; i < SKY_BAND_COUNT; i += 1) {
      const blend = Phaser.Display.Color.Interpolate.ColorWithColor(top, bottom, SKY_BAND_COUNT, i);
      const color = Phaser.Display.Color.GetColor(blend.r, blend.g, blend.b);
      g.fillStyle(color, 1).fillRect(0, i * bandHeight, SKY_STRIP_WIDTH, bandHeight);
    }
    this.bake(g, bgSkyKey(theme), SKY_STRIP_WIDTH, height);
  }

  private generateRuins(g: Phaser.GameObjects.Graphics, theme: string, height: number): void {
    const groundY = Math.round(height * GROUND_TOP_FRACTION);
    // Deterministic silhouette, kept clear of the strip edges so tiling seams hide.
    const far: Array<[number, number, number]> = [
      [10, 70, 120],
      [110, 54, 86],
      [190, 92, 150],
      [300, 60, 100],
      [372, 80, 132],
      [452, 48, 76],
    ];
    g.fillStyle(Palette.ruinsFar, 1);
    for (const far_ of far) {
      g.fillRect(far_[0], groundY - far_[2], far_[1], far_[2]);
    }
    const near: Array<[number, number, number]> = [
      [40, 46, 180],
      [150, 62, 210],
      [250, 40, 160],
      [330, 70, 196],
      [430, 52, 172],
    ];
    for (const block of near) {
      const [x, w, h] = block;
      g.fillStyle(Palette.ruins, 1);
      g.fillRect(x, groundY - h, w, h);
      g.fillStyle(Palette.ironDark, 1);
      for (let wy = groundY - h + 14; wy < groundY - 20; wy += 26) {
        g.fillRect(x + 8, wy, w - 16, 8);
      }
    }
    g.fillStyle(Palette.ruins, 1);
    g.fillRect(212, groundY - 250, 18, 250);
    g.fillRect(398, groundY - 232, 14, 232);
    this.bake(g, bgRuinsKey(theme), RUINS_STRIP_WIDTH, height);
  }

  private generateGround(g: Phaser.GameObjects.Graphics, theme: string, height: number): void {
    const groundY = Math.round(height * GROUND_TOP_FRACTION);
    const groundHeight = height - groundY;
    g.fillStyle(Palette.groundDark, 1).fillRect(0, groundY, GROUND_STRIP_WIDTH, groundHeight);
    g.fillStyle(Palette.ground, 1).fillRect(0, groundY + 10, GROUND_STRIP_WIDTH, groundHeight - 10);
    g.fillStyle(Palette.groundCrack, 1);
    const cracks: Array<[number, number, number, number]> = [
      [30, 40, 120, 3],
      [200, 96, 160, 4],
      [90, 170, 130, 3],
      [300, 230, 180, 5],
      [40, 300, 150, 4],
    ];
    for (const crack of cracks) {
      g.fillRect(crack[0], groundY + crack[1], crack[2], crack[3]);
    }
    g.fillStyle(Palette.ironDark, 1);
    g.fillRect(140, groundY + 60, 22, 10);
    g.fillRect(390, groundY + 150, 30, 12);
    g.fillRect(250, groundY + 270, 26, 10);
    this.bake(g, bgGroundKey(theme), GROUND_STRIP_WIDTH, height);
  }

  private generateEnemy(g: Phaser.GameObjects.Graphics, def: EnemyDef): void {
    const base = ENEMY_BASE_SIZE[def.armorClass];
    const width = Math.max(8, Math.round(base.width * def.scale));
    const height = Math.max(8, Math.round(base.height * def.scale));
    const trackHeight = Math.max(3, Math.round(height * 0.28));
    const bodyHeight = height - trackHeight;
    const bodyColor = this.enemyBodyColor(def.armorClass);

    g.fillStyle(Palette.ironDark, 1).fillRect(0, bodyHeight, width, trackHeight);
    g.fillStyle(Palette.iron, 1);
    const wheelStep = Math.max(6, Math.round(width * 0.16));
    const wheelWidth = Math.max(2, Math.round(width * 0.06));
    for (let x = 2; x < width - 2; x += wheelStep) {
      g.fillRect(x, bodyHeight + 2, wheelWidth, trackHeight - 4);
    }

    g.fillStyle(bodyColor, 1).fillRect(0, 0, width, bodyHeight);
    g.fillStyle(this.enemyTrimColor(def.armorClass), 1);
    g.fillRect(2, 2, width - 4, Math.max(2, Math.round(bodyHeight * 0.22)));

    // A forward wedge so the silhouette reads as facing left, towards the mecha.
    g.fillStyle(bodyColor, 1);
    g.fillTriangle(0, Math.round(bodyHeight * 0.2), 0, bodyHeight, Math.round(width * 0.22), bodyHeight);
    g.fillStyle(Palette.ironDark, 1);
    g.fillRect(
      Math.round(width * 0.3),
      Math.round(bodyHeight * 0.45),
      Math.round(width * 0.24),
      Math.max(2, Math.round(bodyHeight * 0.2)),
    );

    if (def.behaviors.includes('ranged')) {
      g.fillStyle(Palette.brassDark, 1);
      g.fillRect(0, Math.round(bodyHeight * 0.3), Math.round(width * 0.4), Math.max(2, Math.round(height * 0.1)));
    }
    if (def.behaviors.includes('shielded')) {
      g.fillStyle(Palette.enemyShielded, 0.9);
      g.fillRect(0, 0, Math.max(3, Math.round(width * 0.09)), bodyHeight);
    }

    this.bake(g, def.spriteKey, width, height);
  }

  private enemyBodyColor(armorClass: ArmorClass): number {
    switch (armorClass) {
      case 'light':
        return Palette.enemyLight;
      case 'armored':
        return Palette.enemyArmored;
      case 'shielded':
        return Palette.enemyShielded;
      case 'swarm':
        return Palette.enemySwarm;
    }
  }

  private enemyTrimColor(armorClass: ArmorClass): number {
    switch (armorClass) {
      case 'light':
        return Palette.enemyLightTrim;
      case 'armored':
        return Palette.ironLight;
      case 'shielded':
        return Palette.brassDark;
      case 'swarm':
        return Palette.brass;
    }
  }
}
