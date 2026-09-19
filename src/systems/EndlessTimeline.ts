import { tuning } from '../data/core';
import type { LevelDef, WaveEntry } from '../types';

/**
 * Endless mode, GAME_DESIGN section 12.
 *
 * It is deliberately not a new spawner. It builds an ordinary LevelDef with a
 * generated wave list and hands it to the same WaveSpawner every authored level
 * uses, so everything downstream (targeting, escorts, the win check, the boss
 * bar) behaves exactly as it does in the campaign.
 *
 * The timeline is long rather than infinite: `waveCount` waves at
 * `waveInterval` seconds is far past what anyone survives, and a finite list
 * keeps the spawner's "timeline complete" logic honest instead of special
 * casing it.
 *
 * Known limit: elites are boss statted enemies spawned as ordinary waves, so
 * they are tanky but have no phase behaviour and no boss bar. A LevelDef
 * carries one boss block, and repeating that properly means teaching
 * WaveSpawner about multiple bosses, which is more than this mode needs.
 */

export const ENDLESS_LEVEL_ID = 'endless';

/** Small deterministic RNG so a seed reproduces a run exactly. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

function enemiesForWave(waveNumber: number): string[] {
  let pool = tuning.endless.tiers[0].enemies;
  for (const tier of tuning.endless.tiers) {
    if (waveNumber >= tier.fromWave) pool = tier.enemies;
  }
  return pool;
}

/**
 * Builds the endless level. Pass a seed to reproduce a run; omit it and each
 * deployment differs.
 */
export function buildEndlessLevel(seed: number = Date.now()): LevelDef {
  const config = tuning.endless;
  const rng = makeRng(seed);
  const waves: WaveEntry[] = [];

  for (let i = 0; i < config.waveCount; i += 1) {
    const waveNumber = i + 1;
    const time = config.firstWaveAt + i * config.waveInterval;
    const hpMultiplier = 1 + config.hpGrowth * i;
    const isElite = config.eliteEvery > 0 && waveNumber % config.eliteEvery === 0;

    if (isElite) {
      const elite = config.elites[Math.floor(rng() * config.elites.length) % config.elites.length];
      waves.push({
        time,
        enemyId: elite,
        count: 1,
        interval: 1,
        // Elites would be absurd at the full ramp, so they scale slower.
        hpMultiplier: 1 + config.hpGrowth * i * 0.45,
      });
      continue;
    }

    const pool = enemiesForWave(waveNumber);
    const enemyId = pool[Math.floor(rng() * pool.length) % pool.length];
    const count = Math.min(
      config.maxCount,
      Math.max(2, Math.round(3 * (1 + config.countGrowth * i))),
    );

    waves.push({
      time,
      enemyId,
      count,
      interval: Math.max(0.35, 1.2 - i * 0.012),
      hpMultiplier,
      // Leave the lane to chance so approaches vary.
      ...(rng() > 0.4 ? {} : { lane: Math.floor(rng() * tuning.mecha.lanesY.length) }),
    });
  }

  return {
    id: ENDLESS_LEVEL_ID,
    name: 'Endless',
    zone: 3,
    background: 'furnace',
    music: 'bgm_zone3',
    scrollSpeed: 12,
    economy: { startingScrap: 120, trickle: 2.4 },
    waves,
    stars: { hullThreshold: 0.5 },
    rewards: { firstClearCores: 0, coresPerStar: 0 },
  };
}

/** Which wave a run reached, from how far into the timeline it got. */
export function waveNumberAt(elapsedSeconds: number): number {
  const config = tuning.endless;
  if (elapsedSeconds < config.firstWaveAt) return 0;
  return Math.min(
    config.waveCount,
    Math.floor((elapsedSeconds - config.firstWaveAt) / config.waveInterval) + 1,
  );
}
