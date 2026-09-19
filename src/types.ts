/**
 * TypeScript mirrors of the JSON Schema contracts in src/data/schemas.
 * Keep these in step with the schemas: the schemas are the contract, these are
 * the compile time view of it. Anything optional here is optional there.
 */

export type DamageType = 'kinetic' | 'chemical' | 'piercing' | 'explosive';
export type ArmorClass = 'light' | 'armored' | 'shielded' | 'swarm';
export type EnemyBehavior = 'melee' | 'ranged' | 'burrow' | 'spawner' | 'shielded';
export type WeaponSlot = 'main' | 'turret';
export type ProjectileKind = 'ballistic' | 'lobbed' | 'hitscan';
export type TargetPriority = 'focus' | 'ranged_in_range' | 'closest';

/** enemy.schema.json */
export interface EnemyDef {
  id: string;
  name: string;
  armorClass: ArmorClass;
  hp: number;
  /** Separate pool, only meaningful with the shielded behavior. */
  shieldHp?: number;
  /** px per second at 1x world scale */
  speed: number;
  damage: number;
  /** 0 or absent means melee contact range. */
  attackRange?: number;
  /** seconds between attacks */
  attackInterval: number;
  /** scrap dropped on death */
  reward: number;
  spriteKey: string;
  scale: number;
  flying?: boolean;
  behaviors: EnemyBehavior[];
  spawns?: {
    enemyId: string;
    count: number;
    interval: number;
  };
}

/** weapon.schema.json */
export interface WeaponDef {
  id: string;
  name: string;
  slot: WeaponSlot;
  damageType: DamageType;
  baseDamage: number;
  /** shots per second */
  fireRate: number;
  projectile: {
    kind: ProjectileKind;
    /** px per second, ignored for hitscan */
    speed: number;
    aoeRadius?: number;
    pierce?: boolean;
    dot?: { dps: number; duration: number };
  };
  upgradeTrack: Array<{
    costCores: number;
    damageBonus?: number;
    fireRateBonus?: number;
    specialBonus?: number;
  }>;
}

/** level.schema.json */
export interface WaveEntry {
  /** seconds from battle start */
  time: number;
  enemyId: string;
  count: number;
  /** seconds between spawns in this entry */
  interval: number;
  /** omit for a random lane */
  lane?: number;
  hpMultiplier?: number;
}

export interface LevelDef {
  id: string;
  name: string;
  zone: number;
  /** parallax theme key, e.g. rust_flats */
  background: string;
  music?: string;
  /** world scroll px per second */
  scrollSpeed: number;
  /** global enemy HP scale for this level */
  hpMultiplier?: number;
  economy: {
    startingScrap: number;
    /** scrap per second */
    trickle: number;
    rewardMultiplier?: number;
  };
  waves: WaveEntry[];
  boss?: {
    enemyId: string;
    time: number;
    hpMultiplier?: number;
  };
  stars: {
    /** 2 star criterion: finish with hull fraction above this. */
    hullThreshold: number;
  };
  rewards: {
    firstClearCores: number;
    coresPerStar: number;
  };
}

/** pilot.schema.json */
export interface PilotDef {
  id: string;
  name: string;
  ability: {
    name: string;
    kind: 'fire_rate_boost' | 'damage_boost' | 'shield' | 'repair_burst' | 'slow_field';
    cooldown: number;
    duration: number;
    magnitude: number;
  };
  passive: {
    kind: 'cannon_damage' | 'hull_bonus' | 'scrap_bonus' | 'turret_damage';
    perLevel: number;
  };
  levelCosts: number[];
}

/** tuning.schema.json */
export type ArmorMultipliers = Record<ArmorClass, number>;

/** How a given boss behaves across its phases. */
export type BossKind = 'charger' | 'shield_cycler' | 'enrager';

export interface BossPhaseConfig {
  kind: BossKind;
  /** shield_cycler: seconds with the shield up, then seconds venting. */
  shieldUpDuration?: number;
  ventDuration?: number;
  /** enrager: hp fractions at which it steps up, high to low. */
  enrageThresholds?: number[];
  enrageSpeedBonus?: number;
  enrageDamageBonus?: number;
}

export interface Tuning {
  damageMatrix: Record<DamageType, ArmorMultipliers>;
  mecha: {
    baseHullHp: number;
    /** lane centres as a fraction of screen height */
    lanesY: number[];
    turretMountCount: number;
    /** Turret positions relative to the torso; mount 0 is the Phase 2 mount. */
    turretMountOffsets: Array<[number, number]>;
    bobAmplitude: number;
    bobPeriod: number;
    swayAmplitude: number;
    swayPeriod: number;
  };
  /** Shared boss phase behaviour; per boss stats stay in enemies.json. */
  boss: {
    default: {
      phase2HpFraction: number;
      chargeSpeedMultiplier: number;
      chargeDuration: number;
      chargeCooldown: number;
      entranceShakeIntensity: number;
      slamShakeIntensity: number;
    };
    /** Keyed by the boss enemy id in enemies.json. */
    byId: Record<string, BossPhaseConfig>;
  };
  world: {
    baseWidth: number;
    baseHeight: number;
    mechaXFraction: number;
    spawnXFraction: number;
    despawnXFraction: number;
    /** px from the mecha centre where melee enemies stop and attack */
    meleeStandoff: number;
    projectileRadius: number;
    projectileLifetime: number;
    /** largest delta a single frame may apply */
    maxFrameSeconds: number;
    /** Where burrow behaviour enemies erupt, as a fraction of width. */
    burrowSpawnXFraction: number;
    /** px a flying enemy sits above its lane. */
    flyingYOffset: number;
    parallax: { sky: number; ruins: number; ground: number };
  };
  combat: {
    /** GAME_DESIGN section 6: only piercing damages a shield pool at full value. */
    shieldNonPiercingFactor: number;
  };
  /** Hangar economy. Weapon and pilot stat tracks stay in their own files. */
  meta: {
    startingWeapons: string[];
    /** Cores to unlock, keyed by weapon id. */
    weaponUnlockCosts: Record<string, number>;
    /** Cores for mounts 2 and 3; mount 1 is free. */
    turretMountCosts: number[];
    hullUpgrade: {
      costs: number[];
      /** Additive hull fraction per level. */
      bonusPerLevel: number;
    };
  };
  inBattleUpgrades: {
    damage: { baseCost: number; costGrowth: number; bonusPerLevel: number };
    fireRate: { baseCost: number; costGrowth: number; bonusPerLevel: number };
    repair: { baseCost: number; costGrowth: number; healFraction: number };
  };
  vfx: {
    maxParticlesDesktop: number;
    maxParticlesMobile: number;
    shakeMaxIntensity: number;
    damageNumberPoolSize: number;
    scrapPickupRiseSpeed: number;
    scrapPickupLifetime: number;
    hitFlashDuration: number;
    hitFlashTint: number;
    damageNumberRise: number;
    damageNumberLifetime: number;
    muzzleFlashDuration: number;
    muzzleFlashPoolSize: number;
    /** Shake intensity per point of damage taken, clamped by shakeMaxIntensity. */
    shakePerDamage: number;
    shakeDurationMs: number;
    impactParticleCount: number;
    deathParticleCount: number;
    exhaustSmokeFrequency: number;
    cannonRecoilPixels: number;
    turretRecoilPixels: number;
    /** How fast recoil decays back to rest, per second. */
    recoilRecovery: number;
  };
  audio: {
    masterVolume: number;
    sfxVolume: number;
    musicVolume: number;
  };
  pools: {
    projectiles: number;
    enemies: number;
    scrapPickups: number;
  };
  targeting: {
    priorityOrder: TargetPriority[];
    manualShotDamageMultiplier: number;
    autoFireResumeDelay: number;
    manualDragThreshold: number;
    touchDragOriginMinYFraction: number;
    touchAimOffsetY: number;
  };
}

/** Outcome handed from BattleScene to ResultsScene. */
export interface BattleResult {
  levelId: string;
  levelName: string;
  won: boolean;
  scrapEarned: number;
  enemiesKilled: number;
  hullRemaining: number;
  hullMax: number;
  durationSeconds: number;
  /** In battle repairs bought; the 3 star criterion reads this. */
  repairsUsed: number;
  stars: number;
  /** Cores paid out for this run, after the save recorded it. */
  coresAwarded: number;
}
