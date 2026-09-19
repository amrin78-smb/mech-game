import Phaser from 'phaser';

import { AssetKeys } from '../AssetKeys';
import { tuning } from '../data';
import { Depths } from '../ui/Depths';
import { Pool } from './Pool';

/**
 * Every bit of combat juice in one place (GAME_DESIGN section 11's VFX
 * checklist): muzzle flash, impact bursts, debris, smoke, camera shake scaled by
 * damage, and pooled floating damage numbers colour coded by matrix multiplier,
 * which teaches the armor matrix without a word of UI.
 *
 * Emitters are built once and fired with emitParticleAt, and flashes and numbers
 * come from pools, so nothing here allocates inside the update loop. Particle
 * budgets come from tuning.vfx and are cut on mobile.
 */

/** Bright when the matrix favours the shot, grey when it resists it. */
const DAMAGE_COLOR_STRONG = '#ffd75e';
const DAMAGE_COLOR_NEUTRAL = '#e8dcc6';
const DAMAGE_COLOR_WEAK = '#8e8880';
const DAMAGE_NUMBER_DRIFT = 18;

interface Flash {
  readonly image: Phaser.GameObjects.Image;
  remaining: number;
}

interface DamageNumber {
  readonly text: Phaser.GameObjects.Text;
  remaining: number;
  driftX: number;
}

export class VfxManager {
  private readonly scene: Phaser.Scene;
  private readonly flashes: Pool<Flash>;
  private readonly damageNumbers: Pool<DamageNumber>;

  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly debris: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly exhaust: Phaser.GameObjects.Particles.ParticleEmitter;

  private readonly flashDuration = tuning.vfx.muzzleFlashDuration;
  private readonly numberLifetime = tuning.vfx.damageNumberLifetime;

  /** Set false by the Phase 4 settings toggle; shake is the first thing people turn off. */
  shakeEnabled = true;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const budget = scene.game.device.os.desktop
      ? tuning.vfx.maxParticlesDesktop
      : tuning.vfx.maxParticlesMobile;
    // Split the budget so no single effect can starve the others.
    const burstBudget = Math.floor(budget * 0.4);
    const smokeBudget = Math.floor(budget * 0.2);

    this.sparks = scene.add.particles(0, 0, AssetKeys.SPARK, {
      lifespan: { min: 180, max: 420 },
      speed: { min: 90, max: 320 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 1, end: 0 },
      gravityY: 220,
      blendMode: Phaser.BlendModes.ADD,
      maxAliveParticles: burstBudget,
      emitting: false,
    });
    this.sparks.setDepth(Depths.PROJECTILES);

    this.debris = scene.add.particles(0, 0, AssetKeys.DEBRIS, {
      lifespan: { min: 400, max: 900 },
      speed: { min: 60, max: 240 },
      angle: { min: 200, max: 340 },
      rotate: { start: 0, end: 360 },
      scale: { start: 1, end: 0.6 },
      alpha: { start: 1, end: 0.2 },
      gravityY: 520,
      maxAliveParticles: burstBudget,
      emitting: false,
    });
    this.debris.setDepth(Depths.PROJECTILES);

    this.smoke = scene.add.particles(0, 0, AssetKeys.SMOKE_PUFF, {
      lifespan: { min: 500, max: 1100 },
      speed: { min: 10, max: 60 },
      angle: { min: 230, max: 310 },
      scale: { start: 0.5, end: 1.6 },
      alpha: { start: 0.55, end: 0 },
      maxAliveParticles: smokeBudget,
      emitting: false,
    });
    this.smoke.setDepth(Depths.PICKUPS);

    // The engine bed: continuous oil smoke off the exhaust stacks.
    this.exhaust = scene.add.particles(0, 0, AssetKeys.SMOKE_PUFF, {
      lifespan: { min: 900, max: 1800 },
      speed: { min: 12, max: 34 },
      angle: { min: 250, max: 290 },
      scale: { start: 0.35, end: 1.5 },
      alpha: { start: 0.4, end: 0 },
      frequency: tuning.vfx.exhaustSmokeFrequency,
      maxAliveParticles: smokeBudget,
    });
    this.exhaust.setDepth(Depths.MECHA - 1);

    this.flashes = new Pool<Flash>(tuning.vfx.muzzleFlashPoolSize, () => {
      const image = scene.add
        .image(0, 0, AssetKeys.MUZZLE_FLASH)
        .setOrigin(0.1, 0.5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(Depths.PROJECTILES + 1)
        .setVisible(false);
      return { image, remaining: 0 };
    });

    this.damageNumbers = new Pool<DamageNumber>(tuning.vfx.damageNumberPoolSize, () => {
      const text = scene.add
        .text(0, 0, '', {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: DAMAGE_COLOR_NEUTRAL,
          stroke: '#1a1512',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(Depths.AIM_LINE)
        .setVisible(false);
      return { text, remaining: 0, driftX: 0 };
    });
  }

  /** Follows the mecha's exhaust stacks; call once per frame. */
  setExhaustPosition(x: number, y: number): void {
    this.exhaust.setPosition(x, y);
  }

  muzzleFlash(x: number, y: number, rotation: number, scale: number): void {
    const flash = this.flashes.obtain();
    if (flash === null) return;
    flash.remaining = this.flashDuration;
    flash.image
      .setPosition(x, y)
      .setRotation(rotation)
      .setScale(scale)
      .setAlpha(1)
      .setVisible(true);
  }

  /** Shell meets armour: sparks, a little smoke, more of both for a manual shot. */
  impact(x: number, y: number, heavy: boolean): void {
    const count = tuning.vfx.impactParticleCount * (heavy ? 2 : 1);
    this.sparks.emitParticleAt(x, y, count);
    this.smoke.emitParticleAt(x, y, heavy ? 3 : 1);
  }

  /** Something died: a full burst of sparks, debris and smoke. */
  explosion(x: number, y: number, scale: number): void {
    const count = Math.round(tuning.vfx.deathParticleCount * scale);
    this.sparks.emitParticleAt(x, y, count);
    this.debris.emitParticleAt(x, y, Math.round(count * 0.6));
    this.smoke.emitParticleAt(x, y, Math.max(2, Math.round(scale * 4)));
  }

  damageNumber(x: number, y: number, amount: number, multiplier: number): void {
    const entry = this.damageNumbers.obtain();
    if (entry === null) return;

    entry.remaining = this.numberLifetime;
    entry.driftX = Phaser.Math.FloatBetween(-DAMAGE_NUMBER_DRIFT, DAMAGE_NUMBER_DRIFT);
    entry.text
      .setPosition(x, y)
      .setText(String(Math.max(1, Math.round(amount))))
      .setColor(damageColor(multiplier))
      .setAlpha(1)
      .setVisible(true);
  }

  /** Hull hits shake the camera in proportion to the bite taken out of it. */
  shakeFromDamage(damage: number): void {
    this.shake(damage * tuning.vfx.shakePerDamage);
  }

  shake(intensity: number): void {
    if (!this.shakeEnabled || intensity <= 0) return;
    const clamped = Math.min(intensity, tuning.vfx.shakeMaxIntensity);
    this.scene.cameras.main.shake(tuning.vfx.shakeDurationMs, clamped);
  }

  update(deltaSeconds: number): void {
    const flashes = this.flashes.active;
    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      const flash = flashes[i];
      flash.remaining -= deltaSeconds;
      if (flash.remaining <= 0) {
        flash.image.setVisible(false);
        this.flashes.release(flash);
        continue;
      }
      flash.image.setAlpha(flash.remaining / this.flashDuration);
    }

    const numbers = this.damageNumbers.active;
    const rise = tuning.vfx.damageNumberRise * deltaSeconds;
    for (let i = numbers.length - 1; i >= 0; i -= 1) {
      const entry = numbers[i];
      entry.remaining -= deltaSeconds;
      if (entry.remaining <= 0) {
        entry.text.setVisible(false);
        this.damageNumbers.release(entry);
        continue;
      }
      entry.text.y -= rise;
      entry.text.x += entry.driftX * deltaSeconds;
      entry.text.setAlpha(Math.min(1, entry.remaining / this.numberLifetime));
    }
  }

  reset(): void {
    const flashes = this.flashes.active;
    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      flashes[i].image.setVisible(false);
    }
    this.flashes.releaseAll();

    const numbers = this.damageNumbers.active;
    for (let i = numbers.length - 1; i >= 0; i -= 1) {
      numbers[i].text.setVisible(false);
    }
    this.damageNumbers.releaseAll();

    this.sparks.killAll();
    this.debris.killAll();
    this.smoke.killAll();
  }
}

/** GAME_DESIGN section 11: the colour teaches the matrix without any words. */
function damageColor(multiplier: number): string {
  if (multiplier > 1) return DAMAGE_COLOR_STRONG;
  if (multiplier < 1) return DAMAGE_COLOR_WEAK;
  return DAMAGE_COLOR_NEUTRAL;
}
