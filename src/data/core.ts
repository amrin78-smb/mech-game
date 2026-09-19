/**
 * The data the game reads, minus anything bundler specific.
 *
 * Hard rule 1: every gameplay number lives in these JSON files. This module is
 * deliberately free of `import.meta.glob`, so the headless balance sim can
 * import it under tsx and still use the real data and the real DamageSystem.
 * `./index.ts` adds the Vite level glob on top for the browser.
 */
import type { EnemyDef, LevelDef, PilotDef, Tuning, WeaponDef } from '../types';

import enemiesJson from './enemies.json';
import weaponsJson from './weapons.json';
import pilotsJson from './pilots.json';
import tuningJson from './tuning.json';

export const enemies = enemiesJson as unknown as EnemyDef[];
export const weapons = weaponsJson as unknown as WeaponDef[];
export const pilots = pilotsJson as unknown as PilotDef[];
export const tuning = tuningJson as unknown as Tuning;

const enemiesById = new Map<string, EnemyDef>(enemies.map((e) => [e.id, e]));
const weaponsById = new Map<string, WeaponDef>(weapons.map((w) => [w.id, w]));
const pilotsById = new Map<string, PilotDef>(pilots.map((p) => [p.id, p]));

export function getEnemyDef(id: string): EnemyDef {
  const def = enemiesById.get(id);
  if (!def) throw new Error(`Unknown enemy id "${id}" (check src/data/enemies.json)`);
  return def;
}

export function getWeaponDef(id: string): WeaponDef {
  const def = weaponsById.get(id);
  if (!def) throw new Error(`Unknown weapon id "${id}" (check src/data/weapons.json)`);
  return def;
}

export function getPilotDef(id: string): PilotDef {
  const def = pilotsById.get(id);
  if (!def) throw new Error(`Unknown pilot id "${id}" (check src/data/pilots.json)`);
  return def;
}

/**
 * Levels live in a registry rather than a constant, because who supplies them
 * differs by environment: the browser globs them, the sim reads them off disk.
 * Both call registerLevels exactly once at startup.
 */
const levelStore = new Map<string, LevelDef>();

export const levelsById: ReadonlyMap<string, LevelDef> = levelStore;

/** Levels in id order, which is authoring order: level-01, level-02, ... */
export let levels: readonly LevelDef[] = [];

export function registerLevels(defs: readonly LevelDef[]): void {
  levelStore.clear();
  for (const def of [...defs].sort((a, b) => a.id.localeCompare(b.id))) {
    levelStore.set(def.id, def);
  }
  levels = [...levelStore.values()];
}

export function getLevelDef(id: string): LevelDef {
  const def = levelStore.get(id);
  if (!def) throw new Error(`Unknown level id "${id}" (check src/data/levels/)`);
  return def;
}
