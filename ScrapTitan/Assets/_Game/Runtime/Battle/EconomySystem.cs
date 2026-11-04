using UnityEngine;
using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>
    /// In-run scrap only. Cores and anything persistent are Phase 4.
    ///
    /// Every number comes from the level's own economy block: the starting float and the
    /// per-second trickle.
    /// </summary>
    public sealed class EconomySystem
    {
        private readonly float trickle;
        private readonly float rewardMultiplier;
        private float scrap;
        private float earned;
        private float spent;

        public EconomySystem(LevelDef level)
        {
            scrap = level.economy.startingScrap;
            trickle = level.economy.trickle;
            rewardMultiplier = level.economy.RewardMultiplierOrOne;
        }

        /// <summary>Whole scrap the HUD shows. The float underneath keeps the trickle smooth.</summary>
        public int Balance => Mathf.FloorToInt(scrap);
        public int TotalEarned => Mathf.FloorToInt(earned);
        public int TotalSpent => Mathf.FloorToInt(spent);

        public void Update(float dt)
        {
            float income = trickle * dt;
            scrap += income;
            earned += income;
        }

        public float AwardKill(float reward)
        {
            float payout = reward * rewardMultiplier;
            scrap += payout;
            earned += payout;
            return payout;
        }

        public bool CanAfford(float cost) => scrap >= cost;

        /// <summary>Phase 2 spends through here; Phase 1 only displays the balance.</summary>
        public bool TrySpend(float cost)
        {
            if (!CanAfford(cost)) return false;
            scrap -= cost;
            spent += cost;
            return true;
        }
    }
}
