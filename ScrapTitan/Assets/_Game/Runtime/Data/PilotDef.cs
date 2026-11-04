using System;
using UnityEngine;

namespace ScrapTitan.Data
{
    /// <summary>A pilot's active, fired from the battle HUD on a cooldown.</summary>
    [Serializable]
    public struct PilotAbility
    {
        public string displayName;
        public string kind;
        public float cooldown;
        public float duration;
        public float magnitude;
    }

    /// <summary>A pilot's always-on bonus, which grows with pilot level.</summary>
    [Serializable]
    public struct PilotPassive
    {
        public string kind;
        public float perLevel;
    }

    /// <summary>One pilot, straight from pilots.json.</summary>
    public sealed class PilotDef : ScriptableObject
    {
        public string id;
        public string displayName;
        public PilotAbility ability;
        public PilotPassive passive;

        [Tooltip("Cores to reach each level. Index 0 is the cost of level 2.")]
        public int[] levelCosts = Array.Empty<int>();
    }
}
