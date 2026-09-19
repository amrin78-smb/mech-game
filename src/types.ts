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

export interface Tuning {
  damageMatrix: Record<DamageType, ArmorMultipliers>;
  mecha: {
    baseHullHp: number;
    /** lane centres as a fraction of screen height */
    lanesY: number[];
    turretMountCount: number;
    bobAmplitude: number;
    bobPeriod: number;
    swayAmplitude: number;
    swayPeriod: number;
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
    parallax: { sky: number; ruins: number; ground: number };
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
}
