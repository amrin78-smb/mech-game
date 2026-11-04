using System.Collections.Generic;
using UnityEngine;
using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>
    /// Hard rule 9 and GAME_DESIGN section 3: one target selection rule, shared by the main
    /// cannon and, from Phase 2, every turret mount.
    ///
    /// Priority comes from tuning.json targeting.priorityOrder:
    ///   1. the player's focus target, if it is still alive
    ///   2. ranged enemies already sitting inside their own attack range, because they chip
    ///      the hull for free while the guns chase something else
    ///   3. the closest enemy
    /// </summary>
    public sealed class TargetingSystem
    {
        private readonly string[] priorityOrder;

        /// <summary>
        /// Enemies spawn off the right edge and the cannon must not snipe them before the
        /// player can see them: the fight happens on screen.
        /// </summary>
        private readonly float engageMaxX;

        private ITarget focus;

        public TargetingSystem(TuningDef tuning)
        {
            priorityOrder = tuning.targeting.priorityOrder;
            engageMaxX = tuning.world3d.engageMaxX;
        }

        public ITarget FocusTarget => focus != null && focus.IsAlive ? focus : null;

        /// <summary>Setting the same enemy twice clears it, so a second tap unfocuses.</summary>
        public void SetFocus(ITarget enemy)
        {
            if (enemy != null && ReferenceEquals(focus, enemy))
            {
                focus = null;
                return;
            }
            focus = enemy != null && enemy.IsAlive ? enemy : null;
        }

        public void ClearFocus() => focus = null;

        /// <summary>Drops the focus once its target is dead or recycled. Once per frame.</summary>
        public void Prune()
        {
            if (focus != null && !focus.IsAlive) focus = null;
        }

        public ITarget SelectTarget(List<Enemy> enemies, Vector3 from)
        {
            for (int i = 0; i < priorityOrder.Length; i++)
            {
                ITarget candidate = SelectByPriority(priorityOrder[i], enemies, from);
                if (candidate != null) return candidate;
            }
            return null;
        }

        private ITarget SelectByPriority(string priority, List<Enemy> enemies, Vector3 from)
        {
            switch (priority)
            {
                case "focus": return FocusTarget;
                case "ranged_in_range": return ClosestMatching(enemies, from, true);
                case "closest": return ClosestMatching(enemies, from, false);
                default: return null;
            }
        }

        /// <summary>Squared distance only: no allocation and no square roots in the loop.</summary>
        private ITarget ClosestMatching(List<Enemy> enemies, Vector3 from, bool rangedInRangeOnly)
        {
            ITarget best = null;
            float bestSq = float.PositiveInfinity;

            for (int i = 0; i < enemies.Count; i++)
            {
                Enemy enemy = enemies[i];
                if (!enemy.IsAlive) continue;
                if (enemy.Centre.x > engageMaxX) continue;
                if (rangedInRangeOnly && !enemy.IsRangedInRange) continue;

                float sq = (enemy.Centre - from).sqrMagnitude;
                if (sq >= bestSq) continue;
                bestSq = sq;
                best = enemy;
            }

            return best;
        }

        /// <summary>The enemy nearest a world point, for setting the focus on a tap.</summary>
        public ITarget PickAt(List<Enemy> enemies, Vector3 at, float slack)
        {
            ITarget best = null;
            float bestSq = float.PositiveInfinity;

            for (int i = 0; i < enemies.Count; i++)
            {
                Enemy enemy = enemies[i];
                if (!enemy.IsAlive) continue;
                float sq = (enemy.Centre - at).sqrMagnitude;
                float reach = enemy.Radius + slack;
                if (sq > reach * reach || sq >= bestSq) continue;
                bestSq = sq;
                best = enemy;
            }

            return best;
        }
    }
}
