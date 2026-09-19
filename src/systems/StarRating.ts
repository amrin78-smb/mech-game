import type { LevelDef } from '../types';

/**
 * GAME_DESIGN section 7: the same three criteria on every level.
 *   1 star   win
 *   2 stars  win with hull above the level's threshold
 *   3 stars  win without buying an in battle repair
 *
 * Losing is worth nothing, and the criteria stack, so three stars means all of
 * them held at once.
 */
export function evaluateStars(
  level: LevelDef,
  won: boolean,
  hullFraction: number,
  repairsUsed: number,
): number {
  if (!won) return 0;

  let stars = 1;
  if (hullFraction > level.stars.hullThreshold) stars += 1;
  if (repairsUsed === 0) stars += 1;
  return stars;
}

/** The three criteria as display text, with whether each one was met. */
export function starCriteria(
  level: LevelDef,
  won: boolean,
  hullFraction: number,
  repairsUsed: number,
): Array<{ label: string; met: boolean }> {
  return [
    { label: 'Survive the wave timeline', met: won },
    {
      label: `Finish above ${Math.round(level.stars.hullThreshold * 100)}% hull`,
      met: won && hullFraction > level.stars.hullThreshold,
    },
    { label: 'Use no in battle repairs', met: won && repairsUsed === 0 },
  ];
}
