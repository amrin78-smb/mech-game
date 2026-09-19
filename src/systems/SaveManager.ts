import { levels, pilots, tuning } from '../data';

/**
 * Persistent progress in localStorage.
 *
 * Hard rule 8: the schema is versioned. Any change to the shape bumps
 * SAVE_VERSION and adds a migration below, so an existing player's save is
 * upgraded rather than silently discarded. A save that cannot be read at all
 * falls back to a fresh one rather than crashing the game.
 */

export const SAVE_VERSION = 1;
const STORAGE_KEY = 'scrap-titan.save';

export interface LevelProgress {
  /** Best stars earned, 0 to 3. */
  stars: number;
  cleared: boolean;
  /** Best hull fraction on a winning run, for the results screen. */
  bestHullFraction: number;
}

export interface SaveData {
  version: number;
  cores: number;
  levels: Record<string, LevelProgress>;
  /** Weapon id to Hangar card level; presence means unlocked. */
  weapons: Record<string, number>;
  equippedMain: string;
  /** Turret mounts fitted, at least 1. */
  turretMounts: number;
  hullLevel: number;
  /** Pilot id to level; presence means hired. */
  pilots: Record<string, number>;
  equippedPilot: string | null;
}

/** A migration takes the previous shape and returns the next one. */
type Migration = (save: SaveData) => SaveData;

/**
 * Keyed by the version being migrated FROM. Version 1 is the first shipped
 * schema, so there is nothing to migrate yet; the map is the mechanism that
 * keeps the next change cheap.
 */
const MIGRATIONS: Record<number, Migration> = {};

export function createFreshSave(): SaveData {
  const weapons: Record<string, number> = {};
  for (const weaponId of tuning.meta.startingWeapons) {
    weapons[weaponId] = 0;
  }

  return {
    version: SAVE_VERSION,
    cores: 0,
    levels: {},
    weapons,
    equippedMain: tuning.meta.startingWeapons[0],
    turretMounts: 1,
    hullLevel: 0,
    pilots: {},
    equippedPilot: null,
  };
}

export class SaveManager {
  private data: SaveData;

  constructor() {
    this.data = SaveManager.load();
  }

  get save(): Readonly<SaveData> {
    return this.data;
  }

  get cores(): number {
    return this.data.cores;
  }

  static load(): SaveData {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return createFreshSave();

      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (typeof parsed !== 'object' || parsed === null || typeof parsed.version !== 'number') {
        return createFreshSave();
      }
      return migrate(parsed as SaveData);
    } catch (error) {
      // A corrupt or unreadable save must never stop the game from starting.
      console.warn('Save could not be read, starting fresh.', error);
      return createFreshSave();
    }
  }

  persist(): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (error) {
      // Private mode or a full quota: play on, just without persistence.
      console.warn('Save could not be written.', error);
    }
  }

  reset(): void {
    this.data = createFreshSave();
    this.persist();
  }

  // Progression ------------------------------------------------------------

  progressFor(levelId: string): LevelProgress {
    return this.data.levels[levelId] ?? { stars: 0, cleared: false, bestHullFraction: 0 };
  }

  /**
   * Levels unlock in authoring order: the first is always open, the rest need
   * the previous one cleared.
   */
  isUnlocked(levelId: string): boolean {
    const index = levels.findIndex((level) => level.id === levelId);
    if (index <= 0) return index === 0;
    return this.progressFor(levels[index - 1].id).cleared;
  }

  /**
   * Records a finished level and returns the cores awarded: the first clear
   * bonus, plus per star for every star beyond the previous best. Stars are
   * re-earnable but only pay out once (GAME_DESIGN section 7).
   */
  recordResult(
    levelId: string,
    won: boolean,
    stars: number,
    hullFraction: number,
    firstClearCores: number,
    coresPerStar: number,
  ): number {
    const previous = this.progressFor(levelId);
    if (!won) return 0;

    const newStars = Math.max(0, stars - previous.stars);
    const firstClearBonus = previous.cleared ? 0 : firstClearCores;
    const awarded = firstClearBonus + newStars * coresPerStar;

    this.data.levels[levelId] = {
      stars: Math.max(previous.stars, stars),
      cleared: true,
      bestHullFraction: Math.max(previous.bestHullFraction, hullFraction),
    };
    this.data.cores += awarded;
    this.persist();
    return awarded;
  }

  get totalStars(): number {
    let total = 0;
    for (const progress of Object.values(this.data.levels)) {
      total += progress.stars;
    }
    return total;
  }

  // Hangar -----------------------------------------------------------------

  spendCores(amount: number): boolean {
    if (amount > this.data.cores) return false;
    this.data.cores -= amount;
    this.persist();
    return true;
  }

  ownsWeapon(weaponId: string): boolean {
    return this.data.weapons[weaponId] !== undefined;
  }

  weaponLevel(weaponId: string): number {
    return this.data.weapons[weaponId] ?? 0;
  }

  unlockWeapon(weaponId: string): void {
    if (this.ownsWeapon(weaponId)) return;
    this.data.weapons[weaponId] = 0;
    this.persist();
  }

  upgradeWeapon(weaponId: string): void {
    this.data.weapons[weaponId] = this.weaponLevel(weaponId) + 1;
    this.persist();
  }

  equipMain(weaponId: string): void {
    if (!this.ownsWeapon(weaponId)) return;
    this.data.equippedMain = weaponId;
    this.persist();
  }

  get equippedMain(): string {
    return this.data.equippedMain;
  }

  get turretMounts(): number {
    return this.data.turretMounts;
  }

  addTurretMount(): void {
    this.data.turretMounts += 1;
    this.persist();
  }

  get hullLevel(): number {
    return this.data.hullLevel;
  }

  upgradeHull(): void {
    this.data.hullLevel += 1;
    this.persist();
  }

  /** Hull HP after Hangar upgrades and the equipped pilot's passive. */
  hullMax(): number {
    const base = tuning.mecha.baseHullHp;
    const fromUpgrades = this.data.hullLevel * tuning.meta.hullUpgrade.bonusPerLevel;
    return Math.round(base * (1 + fromUpgrades + this.passiveBonus('hull_bonus')));
  }

  // Pilots -----------------------------------------------------------------

  pilotLevel(pilotId: string): number {
    return this.data.pilots[pilotId] ?? 0;
  }

  hasPilot(pilotId: string): boolean {
    return this.data.pilots[pilotId] !== undefined;
  }

  levelUpPilot(pilotId: string): void {
    this.data.pilots[pilotId] = this.pilotLevel(pilotId) + 1;
    this.persist();
  }

  equipPilot(pilotId: string | null): void {
    if (pilotId !== null && !this.hasPilot(pilotId)) return;
    this.data.equippedPilot = pilotId;
    this.persist();
  }

  get equippedPilot(): string | null {
    return this.data.equippedPilot;
  }

  /** The equipped pilot's passive bonus of a given kind, 0 when not applicable. */
  passiveBonus(kind: string): number {
    const pilotId = this.data.equippedPilot;
    if (pilotId === null) return 0;

    const pilot = pilots.find((candidate) => candidate.id === pilotId);
    if (pilot === undefined || pilot.passive.kind !== kind) return 0;
    return pilot.passive.perLevel * this.pilotLevel(pilotId);
  }
}

function migrate(save: SaveData): SaveData {
  let current = save;

  // Newer save than this build understands: safer to start fresh than to
  // guess at fields that do not exist yet.
  if (current.version > SAVE_VERSION) return createFreshSave();

  while (current.version < SAVE_VERSION) {
    const migration = MIGRATIONS[current.version];
    if (migration === undefined) {
      console.warn(`No migration from save version ${current.version}, starting fresh.`);
      return createFreshSave();
    }
    current = migration(current);
  }

  // Fill anything a partial or hand edited save is missing.
  return { ...createFreshSave(), ...current, version: SAVE_VERSION };
}
