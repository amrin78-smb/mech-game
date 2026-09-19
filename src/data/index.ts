/**
 * The single place the game reads its JSON data from.
 *
 * Hard rule 1: every gameplay number lives in these files. Levels are picked up
 * with a glob so authoring `levels/level-07.json` needs no code change at all.
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

const levelModules = import.meta.glob<{ default: unknown }>('./levels/*.json', {
  eager: true,
});

function collectLevels(): Map<string, LevelDef> {
  const byId = new Map<string, LevelDef>();
  for (const key of Object.keys(levelModules).sort()) {
    const level = levelModules[key].default as LevelDef;
    byId.set(level.id, level);
  }
  return byId;
}

export const levelsById: ReadonlyMap<string, LevelDef> = collectLevels();

/** Levels in id order, which is authoring order: level-01, level-02, ... */
export const levels: readonly LevelDef[] = [...levelsById.values()];

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

export function getLevelDef(id: string): LevelDef {
  const def = levelsById.get(id);
  if (!def) throw new Error(`Unknown level id "${id}" (check src/data/levels/)`);
  return def;
}
