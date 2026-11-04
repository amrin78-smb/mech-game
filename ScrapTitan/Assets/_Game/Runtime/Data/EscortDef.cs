using UnityEngine;

namespace ScrapTitan.Data
{
    /// <summary>One buyable escort, straight from escorts.json.</summary>
    public sealed class EscortDef : ScriptableObject
    {
        public string id;
        public string displayName;
        public int hp;

        [Tooltip("Which weapon it fires, by WeaponDef id.")]
        public string weaponId;

        public float damageScale;

        [Tooltip("JSON calls this spriteKey; matches the Kimi asset id.")]
        public string assetKey;

        [Tooltip("How far ahead of the Titan it plants itself.")]
        public float standoffX;

        public int cost;

        [Tooltip("Each further escort bought in a run costs this much more.")]
        public float costGrowth;
    }
}
