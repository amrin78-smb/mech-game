using UnityEngine;
using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>
    /// All the targeting and damage systems need of a victim. Kept an interface so both of
    /// them are testable without a scene, which is also how the Phaser build's headless
    /// simulation balanced against the real damage matrix rather than a copy of it.
    /// </summary>
    public interface ITarget
    {
        bool IsAlive { get; }

        /// <summary>Centre of the body, which is what a shot is aimed at.</summary>
        Vector3 Centre { get; }

        /// <summary>Closing speed along -X, in metres per second. 0 once it has stopped.</summary>
        float MovementSpeed { get; }

        /// <summary>A ranged enemy already sitting inside its own attack range.</summary>
        bool IsRangedInRange { get; }

        /// <summary>Hit radius in metres.</summary>
        float Radius { get; }

        EnemyDef Definition { get; }
        bool HasShield { get; }
        float DamageTakenScale { get; }

        /// <summary>Takes from the shield pool and returns what it could not absorb.</summary>
        float AbsorbWithShield(float amount);

        /// <summary>Takes hull damage. True if this killed it.</summary>
        bool ApplyDamage(float amount);
    }

    /// <summary>The Titan's side of a hit, so enemy damage routes through DamageSystem too.</summary>
    public interface IHullTarget
    {
        float ApplyDamage(float amount);
    }
}
