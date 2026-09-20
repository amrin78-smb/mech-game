import { tuning } from '../data/core';
import type { ArmorClass, DamageType, EnemyDef } from '../types';

/**
 * What this system needs from a victim. Enemy satisfies it structurally, and so
 * does the headless stand-in in sim/, which is how `npm run sim` balances
 * against the real matrix instead of a copy of it.
 */
export interface DamageTarget {
  readonly definition: EnemyDef | null;
  readonly hasShield: boolean;
  /**
   * Optional share of a hit this target actually takes, applied after the
   * matrix. Absent means 1; the Leviathan's body uses it to shrug off fire
   * while its vents still live.
   */
  readonly damageTakenScale?: number;
  absorbWithShield(amount: number): number;
  applyDamage(amount: number): boolean;
}

/** Same idea for the hull. */
export interface HullTarget {
  applyDamage(amount: number): number;
}

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
  /** The multiplier applied, so damage numbers can be coloured by it. */
  multiplier: number;
  killed: boolean;
  /** True when a shield pool ate the hit, which reads differently on screen. */
  hitShield: boolean;
}

export class DamageSystem {
  /** Reused: a hit resolves every frame and hard rule 2 forbids allocating there. */
  private readonly result: DamageResult = {
    amount: 0,
    multiplier: 1,
    killed: false,
    hitShield: false,
  };

  private readonly matrix = tuning.damageMatrix;

  multiplierFor(damageType: DamageType, armorClass: ArmorClass): number {
    return this.matrix[damageType][armorClass];
  }

  /**
   * Applies a hit to an enemy and reports what happened. The returned object is
   * shared, so read it before the next call rather than storing it.
   */
  applyToEnemy(enemy: DamageTarget, baseDamage: number, damageType: DamageType): DamageResult {
    const def = enemy.definition;
    const multiplier = def ? this.multiplierFor(damageType, def.armorClass) : 1;
    // Applied after the matrix, so it scales a hit rather than replacing the
    // rules. The Leviathan's body uses it to shrug off fire while its vents live.
    const amount = baseDamage * multiplier * (enemy.damageTakenScale ?? 1);

    this.result.multiplier = multiplier;
    this.result.hitShield = false;

    if (enemy.hasShield) {
      // GAME_DESIGN section 6: only piercing damages a shield at full value,
      // which is what sells the Railgun against zone 2.
      const shieldDamage =
        damageType === 'piercing' ? amount : amount * tuning.combat.shieldNonPiercingFactor;
      const overflow = enemy.absorbWithShield(shieldDamage);

      this.result.hitShield = true;
      this.result.amount = shieldDamage - overflow;
      this.result.killed = overflow > 0 ? enemy.applyDamage(overflow) : false;
      if (overflow > 0) {
        this.result.amount += overflow;
      }
      return this.result;
    }

    this.result.amount = amount;
    this.result.killed = enemy.applyDamage(amount);
    return this.result;
  }

  /**
   * Enemy hits on the hull. No armor class on the mecha yet, so this is a plain
   * subtraction, but it routes through the system so Phase 3 shields and pilot
   * mitigation have one place to land.
   */
  applyToMecha(mecha: HullTarget, baseDamage: number): number {
    return mecha.applyDamage(baseDamage);
  }
}
