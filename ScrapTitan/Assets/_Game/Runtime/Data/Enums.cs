namespace ScrapTitan.Data
{
    /// <summary>
    /// How well armoured a target is. Paired with <see cref="DamageType"/> in the damage
    /// matrix, which is the only place the pairing is allowed to matter.
    /// </summary>
    public enum ArmorClass
    {
        Light = 0,
        Armored = 1,
        Shielded = 2,
        Swarm = 3,
    }

    /// <summary>What a weapon deals. Indexes the damage matrix alongside ArmorClass.</summary>
    public enum DamageType
    {
        Kinetic = 0,
        Chemical = 1,
        Piercing = 2,
        Explosive = 3,
    }

    /// <summary>Where a weapon can be fitted: the Titan's one main cannon, or a roof mount.</summary>
    public enum WeaponSlot
    {
        Main = 0,
        Turret = 1,
    }

    /// <summary>
    /// How a weapon's shot travels. Ballistic shots have travel time, hitscan lands at once,
    /// lobbed shots arc. (The Phaser build never branched on Lobbed; it is carried across so
    /// the data stays honest, and Phase 3 owes it a real arc.)
    /// </summary>
    public enum ProjectileKind
    {
        Ballistic = 0,
        Hitscan = 1,
        Lobbed = 2,
    }

    /// <summary>
    /// What an enemy does, beyond walking forward. One Enemy class reads these; there are
    /// no per-enemy subclasses. Several may apply at once.
    /// </summary>
    public enum EnemyBehavior
    {
        Melee = 0,
        Ranged = 1,
        Shielded = 2,
        Barrier = 3,
        Burrow = 4,
        Spawner = 5,
        Burner = 6,
        Anchored = 7,
    }

    /// <summary>Which phase script a boss runs.</summary>
    public enum BossKind
    {
        Charger = 0,
        ShieldCycler = 1,
        Enrager = 2,
    }
}
