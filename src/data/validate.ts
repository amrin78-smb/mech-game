/**
 * Dev only data validation. BattleScene never sees a malformed level because
 * BootScene fails loudly here first. Imported dynamically so ajv and the
 * schemas stay out of the production bundle.
 */
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';

import enemySchema from './schemas/enemy.schema.json';
import weaponSchema from './schemas/weapon.schema.json';
import pilotSchema from './schemas/pilot.schema.json';
import escortSchema from './schemas/escort.schema.json';
import levelSchema from './schemas/level.schema.json';
import tuningSchema from './schemas/tuning.schema.json';

import { enemies, escorts, levels, pilots, tuning, weapons } from './index';

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return 'unknown validation error';
  return errors
    .map((e) => `  ${e.instancePath || '/'} ${e.message ?? ''}`.trimEnd())
    .join('\n');
}

function check(validator: ValidateFunction, value: unknown, label: string): void {
  if (validator(value)) return;
  throw new Error(
    `Data validation failed for ${label}:\n${formatErrors(validator.errors)}\n` +
      `Fix the JSON in src/data, the schemas in src/data/schemas are the contract.`,
  );
}

/**
 * Throws on the first invalid file with a message naming the file and the field.
 * Cross references (wave enemyIds, boss enemyIds) are checked too, since a typo
 * there passes the schema but kills the run.
 */
export function validateAllData(): void {
  const ajv = new Ajv({ allErrors: true, strict: false });

  const validateEnemy = ajv.compile(enemySchema);
  const validateWeapon = ajv.compile(weaponSchema);
  const validatePilot = ajv.compile(pilotSchema);
  const validateEscort = ajv.compile(escortSchema);
  const validateLevel = ajv.compile(levelSchema);
  const validateTuning = ajv.compile(tuningSchema);

  check(validateTuning, tuning, 'src/data/tuning.json');

  const enemyIds = new Set<string>();
  for (const enemy of enemies) {
    check(validateEnemy, enemy, `src/data/enemies.json entry "${enemy?.id ?? '?'}"`);
    enemyIds.add(enemy.id);
  }
  for (const weapon of weapons) {
    check(validateWeapon, weapon, `src/data/weapons.json entry "${weapon?.id ?? '?'}"`);
  }
  const weaponIds = new Set(weapons.map((weapon) => weapon.id));
  for (const escort of escorts) {
    check(validateEscort, escort, `src/data/escorts.json entry "${escort?.id ?? '?'}"`);
    if (!weaponIds.has(escort.weaponId)) {
      throw new Error(
        `Escort "${escort.id}" mounts unknown weapon "${escort.weaponId}". ` +
          `Add it to src/data/weapons.json.`,
      );
    }
  }
  for (const pilot of pilots) {
    check(validatePilot, pilot, `src/data/pilots.json entry "${pilot?.id ?? '?'}"`);
  }

  for (const level of levels) {
    check(validateLevel, level, `src/data/levels/${level?.id ?? '?'}.json`);
    for (const wave of level.waves) {
      if (!enemyIds.has(wave.enemyId)) {
        throw new Error(
          `Level ${level.id} spawns unknown enemy "${wave.enemyId}" at t=${wave.time}s. ` +
            `Add it to src/data/enemies.json.`,
        );
      }
    }
    if (level.boss && !enemyIds.has(level.boss.enemyId)) {
      throw new Error(
        `Level ${level.id} has an unknown boss "${level.boss.enemyId}". ` +
          `Add it to src/data/enemies.json.`,
      );
    }
    if (level.stars.hullThreshold < 0 || level.stars.hullThreshold > 1) {
      throw new Error(`Level ${level.id} hullThreshold must be a fraction between 0 and 1.`);
    }
  }

  const laneCount = tuning.mecha.lanesY.length;
  for (const level of levels) {
    for (const wave of level.waves) {
      if (wave.lane !== undefined && wave.lane >= laneCount) {
        throw new Error(
          `Level ${level.id} wave at t=${wave.time}s targets lane ${wave.lane}, ` +
            `but tuning.json defines only ${laneCount} lanes.`,
        );
      }
    }
  }
}
