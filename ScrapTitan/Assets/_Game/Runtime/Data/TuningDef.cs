using System;
using UnityEngine;

namespace ScrapTitan.Data
{
    /// <summary>One row of the damage matrix: what one damage type does to each armour class.</summary>
    [Serializable]
    public struct ArmorMultipliers
    {
        public float light;
        public float armored;
        public float shielded;
        public float swarm;

        public float For(ArmorClass armor) => armor switch
        {
            ArmorClass.Light => light,
            ArmorClass.Armored => armored,
            ArmorClass.Shielded => shielded,
            ArmorClass.Swarm => swarm,
            _ => throw new ArgumentOutOfRangeException(nameof(armor), armor, null),
        };
    }

    /// <summary>
    /// Damage type against armour class. This is the only place the pairing is defined, and
    /// DamageSystem is the only thing allowed to apply it.
    /// </summary>
    [Serializable]
    public struct DamageMatrix
    {
        public ArmorMultipliers kinetic;
        public ArmorMultipliers chemical;
        public ArmorMultipliers piercing;
        public ArmorMultipliers explosive;

        public ArmorMultipliers For(DamageType type) => type switch
        {
            DamageType.Kinetic => kinetic,
            DamageType.Chemical => chemical,
            DamageType.Piercing => piercing,
            DamageType.Explosive => explosive,
            _ => throw new ArgumentOutOfRangeException(nameof(type), type, null),
        };

        public float Multiplier(DamageType type, ArmorClass armor) => For(type).For(armor);
    }

    /// <summary>How the Titan's legs swing. Fractions are of the leg artwork, not the world.</summary>
    [Serializable]
    public struct LegArticulation
    {
        public float hipFraction;
        public float gapFraction;
        public float overlapFraction;
        public float swingDegrees;
        public float liftPixels;
    }

    [Serializable]
    public struct MechaTuning
    {
        public int baseHullHp;

        [Tooltip("The three lanes, as fractions of screen height in the Phaser build.")]
        public float[] lanesY;

        public int turretMountCount;
        public float bobAmplitude;
        public float bobPeriod;
        public float swayAmplitude;
        public float swayPeriod;

        [Tooltip("Where each roof turret sits, relative to the torso.")]
        public Vector2[] turretMountOffsets;

        public float walkPeriod;
        public float walkBob;
        public float walkPitch;
        public bool legsFaceLeft;
        public LegArticulation legArticulation;
    }

    [Serializable]
    public struct EnemySize
    {
        public float width;
        public float height;
    }

    [Serializable]
    public struct ParallaxTuning
    {
        public float sky;
        public float ruins;
        public float ground;
    }

    [Serializable]
    public struct WorldTuning
    {
        public float baseWidth;
        public float baseHeight;
        public float mechaXFraction;
        public float spawnXFraction;
        public float despawnXFraction;
        public float meleeStandoff;
        public float projectileRadius;
        public float projectileLifetime;
        public ParallaxTuning parallax;

        [Tooltip("Longest frame the simulation will believe, so a stall cannot teleport anything.")]
        public float maxFrameSeconds;

        public float burrowSpawnXFraction;
        public float flyingYOffset;
        public float hitscanRangeFactor;

        [Tooltip("Indexed by ArmorClass.")]
        public EnemySize[] enemyBaseSize;

        public EnemySize BaseSizeFor(ArmorClass armor) => enemyBaseSize[(int)armor];
    }

    [Serializable]
    public struct EnemySize3d
    {
        [Tooltip("Along the lane, which is the screen horizontal.")]
        public float length;

        [Tooltip("Across the lane, which is the screen depth.")]
        public float width;

        public float height;
    }

    [Serializable]
    public struct CameraTuning
    {
        [Tooltip("Degrees below horizontal. Every model brief authors its art for this angle, "
                 + "so it is not a free parameter.")]
        public float pitchDegrees;

        [Tooltip("Half the visible height.")]
        public float orthographicSize;

        [Tooltip("How far back the camera sits. Orthographic, so this sets clipping, not framing.")]
        public float distance;

        public float targetX;
        public float targetY;

        /// <summary>
        /// Where the camera goes to look at (targetX, targetY) from <see cref="distance"/>
        /// away at <see cref="pitchDegrees"/>. Pitched down, so it sits above and behind.
        /// </summary>
        public Vector3 Position()
        {
            float pitch = pitchDegrees * Mathf.Deg2Rad;
            return new Vector3(
                targetX,
                targetY + distance * Mathf.Sin(pitch),
                -distance * Mathf.Cos(pitch));
        }

        public Quaternion Rotation() => Quaternion.Euler(pitchDegrees, 0f, 0f);
    }

    [Serializable]
    public struct GroundTuning
    {
        public float tileLength;
        public float tileDepth;
        public int tileCount;
    }

    [Serializable]
    public struct RecoilTuning
    {
        public float cannon;
        public float turret;
    }

    /// <summary>
    /// The same world as <see cref="WorldTuning"/>, in metres. Every length and speed is the
    /// pixel figure divided by <see cref="pixelsPerMetre"/>, and the scale is uniform, which
    /// is what protects the balance: a clear time is distance over speed and both divide by
    /// the same number, so the Phaser sim's clear times carry across unchanged.
    /// </summary>
    [Serializable]
    public struct World3dTuning
    {
        public float pixelsPerMetre;
        public float viewWidthMetres;
        public float viewHeightMetres;
        public float titanX;
        public float spawnX;
        public float despawnX;

        [Tooltip("Targeting ignores anything beyond this, so the cannon cannot snipe an enemy "
                 + "before the player can see it.")]
        public float engageMaxX;

        public float burrowSpawnX;
        public float meleeStandoff;
        public float projectileRadius;
        public float flyingHeight;

        [Tooltip("Lane centres in depth. Lane 0 is farthest from the camera.")]
        public float[] laneZ;

        [Tooltip("Ground height per lane, one entry per laneZ. At 12 degrees, depth alone "
                 + "separates lanes too little to read on a phone; stepping the ground carries "
                 + "the rest.")]
        public float[] laneGroundY;

        [Tooltip("Indexed by ArmorClass.")]
        public EnemySize3d[] enemyBaseSize;

        public CameraTuning camera;
        public GroundTuning ground;
        public RecoilTuning recoil;
        public float scrapPickupRise;
        public float damageNumberRise;
        public float dragThresholdScreenFraction;
        public float touchAimOffsetScreenFraction;

        public int LaneCount => laneZ == null ? 0 : laneZ.Length;

        public EnemySize3d BaseSizeFor(ArmorClass armor) => enemyBaseSize[(int)armor];

        /// <summary>Lane centre in world space, on the ground.</summary>
        public Vector3 LaneOrigin(int lane)
        {
            int i = Mathf.Clamp(lane, 0, LaneCount - 1);
            return new Vector3(0f, laneGroundY[i], laneZ[i]);
        }

        public float GroundYFor(int lane) => laneGroundY[Mathf.Clamp(lane, 0, LaneCount - 1)];

        public float ZFor(int lane) => laneZ[Mathf.Clamp(lane, 0, LaneCount - 1)];

        /// <summary>
        /// How far a melee enemy of this armour class stops from the Titan. Its own half
        /// length is added, exactly as the Phaser build did with half the sprite width.
        /// </summary>
        public float MeleeStopX(ArmorClass armor) =>
            titanX + meleeStandoff + BaseSizeFor(armor).length * 0.5f;
    }

    [Serializable]
    public struct UpgradeCost
    {
        public float baseCost;
        public float costGrowth;
        public float bonusPerLevel;
        public float healFraction;
    }

    [Serializable]
    public struct InBattleUpgradeTuning
    {
        public UpgradeCost damage;
        public UpgradeCost fireRate;
        public UpgradeCost repair;
    }

    [Serializable]
    public struct VfxTuning
    {
        public int maxParticlesDesktop;
        public int maxParticlesMobile;
        public float shakeMaxIntensity;
        public int damageNumberPoolSize;
        public float scrapPickupRiseSpeed;
        public float scrapPickupLifetime;
        public float hitFlashDuration;

        [Tooltip("Shortest gap between two hit flashes on one target, so sustained fire "
                 + "cannot bleach a sprite white.")]
        public float hitFlashCooldown;

        public int hitFlashTint;
        public float damageNumberRise;
        public float damageNumberLifetime;
        public float muzzleFlashDuration;
        public float shakePerDamage;
        public float shakeDurationMs;
        public int impactParticleCount;
        public int deathParticleCount;
        public float exhaustSmokeFrequency;
        public float cannonRecoilPixels;
        public float turretRecoilPixels;
        public float recoilRecovery;
        public int muzzleFlashPoolSize;
    }

    [Serializable]
    public struct PoolTuning
    {
        public int projectiles;
        public int enemies;
        public int scrapPickups;
    }

    [Serializable]
    public struct TargetingTuning
    {
        [Tooltip("Tried in order: focus, ranged_in_range, closest.")]
        public string[] priorityOrder;

        public float manualShotDamageMultiplier;
        public float autoFireResumeDelay;
        public float manualDragThreshold;
        public float touchDragOriginMinYFraction;
        public float touchAimOffsetY;
    }

    [Serializable]
    public struct BossDefaults
    {
        public float phase2HpFraction;
        public float chargeSpeedMultiplier;
        public float chargeDuration;
        public float chargeCooldown;
        public float entranceShakeIntensity;
        public float slamShakeIntensity;
    }

    /// <summary>Per-boss overrides. Only the fields its kind uses are filled in.</summary>
    [Serializable]
    public struct BossOverride
    {
        public string enemyId;
        public BossKind kind;

        [Header("ShieldCycler")]
        public float shieldUpDuration;
        public float ventDuration;

        [Header("Enrager")]
        public float[] enrageThresholds;
        public float enrageSpeedBonus;
        public float enrageDamageBonus;
    }

    [Serializable]
    public struct BossTuning
    {
        public BossDefaults defaults;
        public BossOverride[] byId;
    }

    [Serializable]
    public struct AudioTuning
    {
        public float masterVolume;
        public float sfxVolume;
        public float musicVolume;
    }

    [Serializable]
    public struct CombatTuning
    {
        [Tooltip("What a non-piercing shot gets through a shield pool.")]
        public float shieldNonPiercingFactor;
    }

    [Serializable]
    public struct NamedCost
    {
        public string id;
        public int costCores;
    }

    [Serializable]
    public struct ZoneName
    {
        public int zone;
        public string displayName;
    }

    [Serializable]
    public struct HullUpgradeTuning
    {
        public int[] costs;
        public float bonusPerLevel;
    }

    [Serializable]
    public struct MetaTuning
    {
        public string[] startingWeapons;
        public NamedCost[] weaponUnlockCosts;
        public int[] turretMountCosts;
        public HullUpgradeTuning hullUpgrade;
        public ZoneName[] zoneNames;
    }

    [Serializable]
    public struct TutorialStep
    {
        public float at;
        public float duration;
        public string text;
    }

    [Serializable]
    public struct TutorialTuning
    {
        public string levelId;
        public TutorialStep[] steps;
    }

    /// <summary>Which enemies endless draws from, from this wave on.</summary>
    [Serializable]
    public struct EndlessTier
    {
        public int fromWave;
        public string[] enemies;
    }

    [Serializable]
    public struct EndlessTuning
    {
        public float firstWaveAt;
        public float waveInterval;
        public int waveCount;
        public float hpGrowth;
        public float countGrowth;
        public int maxCount;
        public int eliteEvery;
        public int coresPerNewWave;
        public string unlockAfterLevel;
        public EndlessTier[] tiers;
        public string[] elites;
    }

    /// <summary>
    /// Everything tuneable that is not per entity, straight from tuning.json. Gameplay code
    /// reads constants from here and never from a literal.
    ///
    /// Carried over verbatim from the Phaser build, which means the lengths, offsets and
    /// speeds in <see cref="world"/>, <see cref="mecha"/> and <see cref="vfx"/> are still in
    /// 1280x720 screen pixels. Phase 1 re-derives those in metres; the combat numbers
    /// (<see cref="damageMatrix"/>, hp, dps, costs, timings) are unitless and carry across
    /// unchanged, which is what the balance depends on.
    /// </summary>
    public sealed class TuningDef : ScriptableObject
    {
        public DamageMatrix damageMatrix;
        public MechaTuning mecha;
        public WorldTuning world;

        [Tooltip("The world in metres, which is what the Unity build runs on. `world` above is "
                 + "kept as the pixel figures it was derived from.")]
        public World3dTuning world3d;
        public InBattleUpgradeTuning inBattleUpgrades;
        public VfxTuning vfx;
        public PoolTuning pools;
        public TargetingTuning targeting;
        public BossTuning boss;
        public AudioTuning audio;
        public CombatTuning combat;
        public MetaTuning meta;
        public TutorialTuning tutorial;
        public EndlessTuning endless;

        /// <summary>The boss overrides for an enemy id, or false if it has none.</summary>
        public bool TryGetBoss(string enemyId, out BossOverride result)
        {
            foreach (BossOverride o in boss.byId)
            {
                if (o.enemyId == enemyId)
                {
                    result = o;
                    return true;
                }
            }
            result = default;
            return false;
        }

        public int WeaponUnlockCost(string weaponId)
        {
            foreach (NamedCost c in meta.weaponUnlockCosts)
                if (c.id == weaponId) return c.costCores;
            return 0;
        }

        public string ZoneDisplayName(int zone)
        {
            foreach (ZoneName z in meta.zoneNames)
                if (z.zone == zone) return z.displayName;
            return $"ZONE {zone}";
        }
    }
}
