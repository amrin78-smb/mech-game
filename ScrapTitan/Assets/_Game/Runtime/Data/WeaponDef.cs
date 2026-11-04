using System;
using UnityEngine;

namespace ScrapTitan.Data
{
    /// <summary>How a weapon's shot behaves once it leaves the muzzle.</summary>
    [Serializable]
    public struct ProjectileSpec
    {
        public ProjectileKind kind;
        public float speed;

        [Tooltip("0 means a single-target hit.")]
        public float aoeRadius;

        [Tooltip("Scattergun-style shot: more than one pellet per shot, fanned across spreadDegrees.")]
        public int pellets;

        public float spreadDegrees;

        [Tooltip("The round carries on through what it hits, which is what the Railgun is for.")]
        public bool pierce;

        public bool hasDot;
        public float dotDps;
        public float dotDuration;
    }

    /// <summary>One step on a weapon's Hangar upgrade card.</summary>
    [Serializable]
    public struct WeaponUpgradeStep
    {
        public int costCores;
        public float damageBonus;
        public float fireRateBonus;
    }

    /// <summary>One weapon, straight from weapons.json.</summary>
    public sealed class WeaponDef : ScriptableObject
    {
        [Header("Identity")]
        public string id;
        public string displayName;
        public WeaponSlot slot;

        [Header("Combat")]
        public DamageType damageType;
        public float baseDamage;

        [Tooltip("Shots per second.")]
        public float fireRate;

        public ProjectileSpec projectile;

        [Header("Progression")]
        public WeaponUpgradeStep[] upgradeTrack = Array.Empty<WeaponUpgradeStep>();

        /// <summary>Damage per second before the armour matrix, for balance comparisons.</summary>
        public float RawDps => baseDamage * fireRate * Mathf.Max(1, projectile.pellets);
    }
}
