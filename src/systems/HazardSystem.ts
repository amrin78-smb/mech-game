import Phaser from 'phaser';

import { BurnZone } from '../entities/BurnZone';
import { Pool } from './Pool';

/**
 * Ground hazards, currently the burn zones incinerator tanks leave behind
 * (GAME_DESIGN section 6).
 *
 * The system owns the pool and the arithmetic; BattleScene decides what to do
 * with the damage, which keeps the hull's damage path in one place rather than
 * letting a hazard reach into the Mecha directly.
 *
 * Zones are placed with a spread so repeated arcs read as a spreading fire
 * instead of one ellipse pulsing in place.
 */

/** Generous: several tanks firing on overlapping intervals still fits. */
const POOL_SIZE = 16;

export interface HazardSystemOptions {
  readonly scene: Phaser.Scene;
}

export class HazardSystem {
  private readonly pool: Pool<BurnZone>;

  constructor(options: HazardSystemOptions) {
    this.pool = new Pool(POOL_SIZE, () => new BurnZone(options.scene));
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }

  /**
   * Lights a patch of ground. `spreadX` scatters repeat arcs either side of the
   * aim point. Silently does nothing when the pool is dry, like every other
   * spawn in the game.
   */
  ignite(
    x: number,
    y: number,
    radius: number,
    damagePerSecond: number,
    duration: number,
    spreadX: number,
  ): void {
    const zone = this.pool.obtain();
    if (zone === null) return;

    const offset = spreadX <= 0 ? 0 : Phaser.Math.FloatBetween(-spreadX, spreadX);
    zone.ignite(x + offset, y, radius, damagePerSecond, duration);
  }

  /** Returns the total hull damage every burning patch did this frame. */
  update(deltaSeconds: number): number {
    const active = this.pool.active;
    let total = 0;

    // Backwards: releasing swaps the last element into the freed slot.
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const zone = active[i];
      total += zone.update(deltaSeconds);
      if (!zone.isActive) this.pool.release(zone);
    }

    return total;
  }

  reset(): void {
    for (const zone of this.pool.active) {
      zone.extinguish();
    }
    this.pool.releaseAll();
  }
}
