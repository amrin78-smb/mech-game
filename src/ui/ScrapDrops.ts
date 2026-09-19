import Phaser from 'phaser';

import { AssetKeys } from '../AssetKeys';
import { tuning } from '../data';
import { Pool } from '../systems/Pool';
import { Depths } from './Depths';

/**
 * The scrap that pops off a dying enemy. Pooled and driven by delta time, no
 * per drop tween. Phase 2 folds this into VfxManager alongside the explosions
 * and floating damage numbers.
 */

interface Drop {
  readonly image: Phaser.GameObjects.Image;
  readonly label: Phaser.GameObjects.Text;
  remaining: number;
}

const DRIFT_X = 12;
const LABEL_COLOR = '#c9a227';

export class ScrapDrops {
  private readonly pool: Pool<Drop>;
  private readonly lifetime = tuning.vfx.scrapPickupLifetime;
  private readonly riseSpeed = tuning.vfx.scrapPickupRiseSpeed;

  constructor(scene: Phaser.Scene) {
    this.pool = new Pool<Drop>(tuning.pools.scrapPickups, () => {
      const image = scene.add
        .image(0, 0, AssetKeys.SCRAP_PICKUP)
        .setDepth(Depths.PICKUPS)
        .setVisible(false);
      const label = scene.add
        .text(0, 0, '', { fontFamily: 'monospace', fontSize: '14px', color: LABEL_COLOR })
        .setOrigin(0, 0.5)
        .setDepth(Depths.PICKUPS)
        .setVisible(false);
      return { image, label, remaining: 0 };
    });
  }

  spawn(x: number, y: number, amount: number): void {
    const drop = this.pool.obtain();
    // Pool exhausted: the scrap is still awarded, only the flourish is skipped.
    if (drop === null) return;

    drop.remaining = this.lifetime;
    drop.image.setPosition(x, y).setAlpha(1).setVisible(true);
    drop.label.setPosition(x + 12, y).setAlpha(1).setVisible(true).setText(`+${Math.round(amount)}`);
  }

  update(deltaSeconds: number): void {
    const active = this.pool.active;
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const drop = active[i];
      drop.remaining -= deltaSeconds;

      if (drop.remaining <= 0) {
        drop.image.setVisible(false);
        drop.label.setVisible(false);
        this.pool.release(drop);
        continue;
      }

      const rise = this.riseSpeed * deltaSeconds;
      const drift = DRIFT_X * deltaSeconds;
      const alpha = Phaser.Math.Clamp(drop.remaining / this.lifetime, 0, 1);

      drop.image.y -= rise;
      drop.image.x += drift;
      drop.image.setAlpha(alpha);
      drop.label.y -= rise;
      drop.label.x += drift;
      drop.label.setAlpha(alpha);
    }
  }

  reset(): void {
    const active = this.pool.active;
    for (let i = active.length - 1; i >= 0; i -= 1) {
      active[i].image.setVisible(false);
      active[i].label.setVisible(false);
    }
    this.pool.releaseAll();
  }
}
