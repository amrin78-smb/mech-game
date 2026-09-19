import { tuning } from '../data';
import type { Enemy } from '../entities/Enemy';
import type { Mecha } from '../entities/Mecha';
import type { ArmorClass, DamageType } from '../types';

/**
 * The only place the damage type against armor class matrix is read. Nothing
 * else in the codebase may multiply damage by anything; if a multiplier is
 * needed somewhere new, it passes through here.
 *
 * The matrix itself lives in src/data/tuning.json (GAME_DESIGN section 5).
 */
export interface DamageResult {
  /** Damage actually dealt after the matrix multiplier. */
  amount: number;
  /** The multiplier applied, so Phase 2 can colour damage numbers by it. */
  multiplier: number;
  killed: boolean;
}

export class DamageSystem {
  /** Reused: a hit resolves every frame and hard rule 2 forbids allocating there. */
  private readonly result: DamageResult = { amount: 0, multiplier: 1, killed: false };

  private readonly matrix = tuning.damageMatrix;

  multiplierFor(damageType: DamageType, armorClass: ArmorClass): number {
    return this.matrix[damageType][armorClass];
  }

  /**
   * Applies a hit to an enemy and reports what happened. The returned object is
   * shared, so read it before the next call rather than storing it.
   */
  applyToEnemy(enemy: Enemy, baseDamage: number, damageType: DamageType): DamageResult {
    const def = enemy.definition;
    const multiplier = def ? this.multiplierFor(damageType, def.armorClass) : 1;
    const amount = baseDamage * multiplier;

    this.result.multiplier = multiplier;
    this.result.amount = amount;
    this.result.killed = enemy.applyDamage(amount);
    return this.result;
  }

  /**
   * Enemy hits on the hull. No armor class on the mecha yet, so this is a plain
   * subtraction, but it routes through the system so Phase 3 shields and pilot
   * mitigation have one place to land.
   */
  applyToMecha(mecha: Mecha, baseDamage: number): number {
    return mecha.applyDamage(baseDamage);
  }
}
