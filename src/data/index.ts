/**
 * The browser's view of the data: everything in ./core, plus the level files
 * picked up by Vite's glob so authoring `levels/level-16.json` needs no code
 * change at all (hard rule 1).
 *
 * Importing this module registers the levels as a side effect, which is why the
 * game imports from '../data' and never from '../data/core'.
 */
import { registerLevels } from './core';
import type { LevelDef } from '../types';

export * from './core';

// Vite replaces this call at build time. It is a call, not a property read:
// `import.meta.glob` does not exist as a value at runtime, which is exactly why
// the sim uses ./core and supplies its own levels instead.
const levelModules = import.meta.glob<{ default: unknown }>('./levels/*.json', {
  eager: true,
});

registerLevels(
  Object.keys(levelModules)
    .sort()
    .map((key) => levelModules[key].default as LevelDef),
);
