using System;
using UnityEngine;

namespace ScrapTitan.Data
{
    /// <summary>One entry on a level's timeline.</summary>
    [Serializable]
    public struct WaveEntry
    {
        [Tooltip("Seconds from the start of the level.")]
        public float time;

        public string enemyId;
        public int count;

        [Tooltip("Seconds between each of the count spawns.")]
        public float interval;

        [Tooltip("False means the spawner picks the lane itself.")]
        public bool hasLane;

        [Tooltip("0, 1 or 2.")]
        public int lane;

        [Tooltip("False means 1x. Scales only this wave's enemies.")]
        public bool hasHpMultiplier;

        public float hpMultiplier;

        public float HpMultiplierOrOne => hasHpMultiplier ? hpMultiplier : 1f;
    }

    /// <summary>The level's boss, which arrives at a fixed time rather than on the wave timeline.</summary>
    [Serializable]
    public struct BossEntry
    {
        public string enemyId;
        public float time;
        public float hpMultiplier;
    }

    /// <summary>Scrap the player starts with, and the slow drip during the run.</summary>
    [Serializable]
    public struct EconomySpec
    {
        public int startingScrap;

        [Tooltip("Scrap per second.")]
        public float trickle;

        [Tooltip("Scales every enemy's reward in this level. Absent in the data means 1, "
                 + "which is what RewardMultiplierOrOne returns.")]
        public float rewardMultiplier;

        /// <summary>The multiplier, or 1 when the level does not set one.</summary>
        public float RewardMultiplierOrOne => rewardMultiplier <= 0f ? 1f : rewardMultiplier;
    }

    /// <summary>What earns the level's stars.</summary>
    [Serializable]
    public struct StarSpec
    {
        [Tooltip("Finish with at least this fraction of hull left.")]
        public float hullThreshold;
    }

    /// <summary>Cores paid out for the level.</summary>
    [Serializable]
    public struct RewardSpec
    {
        public int firstClearCores;
        public int coresPerStar;
    }

    /// <summary>One level, straight from levels/level-XX.json.</summary>
    public sealed class LevelDef : ScriptableObject
    {
        [Header("Identity")]
        public string id;
        public string displayName;

        [Tooltip("1 to 4.")]
        public int zone;

        [Tooltip("Which zone look to load: rust_flats, ash_canyons, furnace or drowned_works.")]
        public string background;

        public string music;

        [Header("World")]
        public float scrollSpeed;
        public EconomySpec economy;

        [Header("Timeline")]
        public WaveEntry[] waves = Array.Empty<WaveEntry>();

        public bool hasBoss;
        public BossEntry boss;

        [Header("Scoring")]
        [Tooltip("Scales every enemy's hp in this level.")]
        public float hpMultiplier;

        public StarSpec stars;
        public RewardSpec rewards;

        /// <summary>When the last scheduled thing in the level appears. Useful for sanity tests.</summary>
        public float LastEventTime
        {
            get
            {
                float last = hasBoss ? boss.time : 0f;
                foreach (WaveEntry w in waves)
                {
                    float end = w.time + Mathf.Max(0, w.count - 1) * w.interval;
                    if (end > last) last = end;
                }
                return last;
            }
        }
    }
}
