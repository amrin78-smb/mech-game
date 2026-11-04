using System;
using UnityEngine;

namespace ScrapTitan.Data
{
    /// <summary>A frontal screen that intercepts shots aimed at anything behind it.</summary>
    [Serializable]
    public struct BarrierSpec
    {
        [Tooltip("Screen px in the Phaser build; metres once Phase 1 re-derives the world scale.")]
        public float radius;

        [Tooltip("In front of the enemy, toward the Titan.")]
        public float offsetX;
    }

    /// <summary>What a spawner enemy keeps releasing.</summary>
    [Serializable]
    public struct SpawnsSpec
    {
        public string enemyId;
        public int count;
        public float interval;
    }

    /// <summary>Burning ground left by a burner's flame arc.</summary>
    [Serializable]
    public struct BurnZoneSpec
    {
        public float damagePerSecond;
        public float duration;
        public float radius;

        [Tooltip("Either side of the aim point that repeat arcs scatter across.")]
        public float spreadX;

        [Tooltip("In front of the Titan that the arc lands. Keeps the patch out from behind the hull.")]
        public float offsetX;
    }

    /// <summary>Where one destructible part sits, as a fraction of the carrier's display size.</summary>
    [Serializable]
    public struct WeakPointMount
    {
        public float x;
        public float y;
    }

    /// <summary>Destructible parts carried on a body, each a targetable enemy of its own.</summary>
    [Serializable]
    public struct WeakPointsSpec
    {
        public string enemyId;
        public WeakPointMount[] mounts;

        [Tooltip("Share of incoming damage the body takes while any part still lives.")]
        public float bodyDamageFactor;
    }

    /// <summary>
    /// One enemy, straight from enemies.json. There is deliberately no subclass per enemy:
    /// behaviour comes from <see cref="behaviors"/> and the optional blocks below, so adding
    /// an enemy is a data change. Boss is the single exception, and it reads this too.
    /// </summary>
    public sealed class EnemyDef : ScriptableObject
    {
        [Header("Identity")]
        public string id;

        [Tooltip("Shown to the player. Called displayName because ScriptableObject already owns 'name'.")]
        public string displayName;

        [Tooltip("JSON calls this spriteKey. These values already match the Kimi asset ids, "
                 + "so a model prefab can be found by this key.")]
        public string assetKey;

        [Header("Combat")]
        public ArmorClass armorClass;
        public int hp;
        public float speed;
        public float damage;
        public float attackInterval;
        public int reward;
        public float scale;
        public bool flying;

        [Tooltip("0 means melee contact range.")]
        public float attackRange;

        [Tooltip("A separate pool in front of hp. Only meaningful with the Shielded behaviour.")]
        public int shieldHp;

        [Header("Behaviour")]
        public EnemyBehavior[] behaviors = Array.Empty<EnemyBehavior>();

        [Header("Optional blocks")]
        public bool hasBarrier;
        public BarrierSpec barrier;

        public bool hasSpawns;
        public SpawnsSpec spawns;

        public bool hasBurnZone;
        public BurnZoneSpec burnZone;

        public bool hasWeakPoints;
        public WeakPointsSpec weakPoints;

        public bool Has(EnemyBehavior behavior) => Array.IndexOf(behaviors, behavior) >= 0;

        /// <summary>True for anything the WaveSpawner must treat as a boss rather than a grunt.</summary>
        public bool IsBossId => id != null && id.StartsWith("boss_", StringComparison.Ordinal);
    }
}
