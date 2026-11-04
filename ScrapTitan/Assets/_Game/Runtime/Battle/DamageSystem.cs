using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>What a hit did, so the caller can colour a damage number by it.</summary>
    public struct DamageResult
    {
        /// <summary>Damage actually dealt, after the matrix.</summary>
        public float amount;

        /// <summary>The multiplier the matrix gave, which is what the colour codes.</summary>
        public float multiplier;

        public bool killed;

        /// <summary>True when a shield pool ate the hit, which reads differently on screen.</summary>
        public bool hitShield;
    }

    /// <summary>
    /// The only place the damage-type-against-armour-class matrix is read. Nothing else may
    /// multiply damage by anything; if a multiplier is needed somewhere new, it passes
    /// through here. The matrix itself lives in src/data/tuning.json.
    /// </summary>
    public sealed class DamageSystem
    {
        private readonly TuningDef tuning;

        public DamageSystem(TuningDef tuning) => this.tuning = tuning;

        public float MultiplierFor(DamageType damage, ArmorClass armor) =>
            tuning.damageMatrix.Multiplier(damage, armor);

        /// <summary>Applies a hit to an enemy and reports what happened.</summary>
        public DamageResult ApplyToEnemy(ITarget enemy, float baseDamage, DamageType damage)
        {
            EnemyDef def = enemy.Definition;
            float multiplier = def != null ? MultiplierFor(damage, def.armorClass) : 1f;
            // After the matrix, so it scales a hit rather than replacing the rules. The
            // Leviathan's body uses it to shrug off fire while its vents still live.
            float amount = baseDamage * multiplier * enemy.DamageTakenScale;

            DamageResult result = default;
            result.multiplier = multiplier;

            if (enemy.HasShield)
            {
                // GAME_DESIGN section 6: only piercing damages a shield at full value, which
                // is what sells the Railgun against zone 2.
                float shieldDamage = damage == DamageType.Piercing
                    ? amount
                    : amount * tuning.combat.shieldNonPiercingFactor;
                float overflow = enemy.AbsorbWithShield(shieldDamage);

                result.hitShield = true;
                result.amount = shieldDamage - overflow;
                if (overflow > 0f)
                {
                    result.killed = enemy.ApplyDamage(overflow);
                    result.amount += overflow;
                }
                return result;
            }

            result.amount = amount;
            result.killed = enemy.ApplyDamage(amount);
            return result;
        }

        /// <summary>
        /// Enemy hits on the hull. No armour class on the Titan yet, so this is a plain
        /// subtraction, but it routes through the system so Phase 3 shields and pilot
        /// mitigation have one place to land.
        /// </summary>
        public float ApplyToTitan(IHullTarget titan, float baseDamage) =>
            titan.ApplyDamage(baseDamage);
    }
}
