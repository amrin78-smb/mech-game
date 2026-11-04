using System;
using System.Collections.Generic;
using UnityEngine;
using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>
    /// Reads a LevelDef's wave timeline and owns the enemy lifecycle: the pool, the live
    /// list, movement and recycling. Hard rule 1: authoring a new level is a JSON file and
    /// nothing else, so nothing in here names an enemy or a level.
    /// </summary>
    public sealed class WaveSpawner
    {
        /// <summary>One timeline entry's live state. Built once, never allocated in update.</summary>
        private struct WaveRuntime
        {
            public WaveEntry entry;
            public float hpMultiplier;
            public int spawned;
            public float nextSpawnTime;
        }

        private readonly Pool<Enemy> pool;
        private readonly WaveRuntime[] waves;
        private readonly List<Enemy> live;
        private readonly GameDatabase database;
        private readonly World3dTuning world;
        private readonly EnemyContext context;
        private readonly float lastSpawnTime;
        private readonly System.Random random;

        private float elapsed;

        /// <summary>Raised when an enemy walked past the Titan: no reward, just gone.</summary>
        public Action<Enemy> onEscaped;

        public WaveSpawner(LevelDef level, GameDatabase database, TuningDef tuning,
                           Func<int, Enemy> makeEnemy, Action<Enemy> onAttack, int seed)
        {
            this.database = database;
            world = tuning.world3d;
            random = new System.Random(seed);

            int capacity = Mathf.Max(tuning.pools.enemies, 1);
            pool = new Pool<Enemy>(capacity, makeEnemy);
            live = new List<Enemy>(capacity);

            float levelHp = level.hpMultiplier <= 0f ? 1f : level.hpMultiplier;
            waves = new WaveRuntime[level.waves.Length];
            float last = 0f;
            for (int i = 0; i < level.waves.Length; i++)
            {
                WaveEntry entry = level.waves[i];
                waves[i] = new WaveRuntime
                {
                    entry = entry,
                    hpMultiplier = levelHp * entry.HpMultiplierOrOne,
                    spawned = 0,
                    nextSpawnTime = entry.time,
                };
                float finish = entry.time + entry.interval * Mathf.Max(0, entry.count - 1);
                if (finish > last) last = finish;
            }
            lastSpawnTime = last;

            context = new EnemyContext
            {
                titanX = world.titanX,
                meleeStandoff = world.meleeStandoff,
                onAttack = onAttack,
            };
        }

        public List<Enemy> Live => live;
        public int AliveCount => live.Count;
        public float ElapsedSeconds => elapsed;

        /// <summary>True once every timeline entry has finished spawning.</summary>
        public bool IsTimelineComplete
        {
            get
            {
                for (int i = 0; i < waves.Length; i++)
                    if (waves[i].spawned < waves[i].entry.count) return false;
                return true;
            }
        }

        /// <summary>Spawn progress for the HUD bar, 0 to 1 across the timeline.</summary>
        public float Progress =>
            lastSpawnTime <= 0f ? 1f : Mathf.Clamp01(elapsed / lastSpawnTime);

        public void Update(float dt)
        {
            elapsed += dt;
            SpawnDue();

            for (int i = live.Count - 1; i >= 0; i--)
            {
                Enemy enemy = live[i];
                enemy.Update(dt, context);

                if (enemy.IsAlive && enemy.Position.x > world.despawnX) continue;
                if (enemy.IsAlive)
                {
                    enemy.Retire();
                    onEscaped?.Invoke(enemy);
                }
                Recycle(i);
            }
        }

        /// <summary>Takes a killed enemy out of the fight. The caller pays the reward.</summary>
        public void Remove(Enemy enemy)
        {
            int index = live.IndexOf(enemy);
            if (index < 0) return;
            enemy.Hide();
            Recycle(index);
        }

        private void Recycle(int index)
        {
            Enemy enemy = live[index];
            enemy.Hide();
            pool.Recycle(enemy);
            live.RemoveAt(index);
        }

        private void SpawnDue()
        {
            for (int i = 0; i < waves.Length; i++)
            {
                // A long frame can owe several spawns; catch all of them up this tick.
                while (waves[i].spawned < waves[i].entry.count
                       && elapsed >= waves[i].nextSpawnTime)
                {
                    SpawnOne(waves[i].entry, waves[i].hpMultiplier);
                    waves[i].spawned++;
                    waves[i].nextSpawnTime += waves[i].entry.interval;
                }
            }
        }

        private void SpawnOne(WaveEntry entry, float hpMultiplier)
        {
            Enemy enemy = pool.Obtain();
            // Pool exhausted: skip rather than allocate mid frame (hard rule 2).
            if (enemy == null) return;

            EnemyDef def = database.Enemy(entry.enemyId);
            if (def == null)
            {
                pool.Recycle(enemy);
                return;
            }

            int laneCount = world.LaneCount;
            int lane = entry.hasLane
                ? Mathf.Clamp(entry.lane, 0, laneCount - 1)
                : random.Next(0, laneCount);

            EnemySize3d size = world.BaseSizeFor(def.armorClass);
            float y = world.GroundYFor(lane) + (def.flying ? world.flyingHeight : 0f);
            Vector3 at = new Vector3(world.spawnX, y, world.ZFor(lane));

            enemy.Spawn(def, size, at, lane, hpMultiplier);
            live.Add(enemy);
        }

        public void Clear()
        {
            for (int i = 0; i < live.Count; i++) live[i].Hide();
            live.Clear();
            pool.RecycleAll();
        }

        /// <summary>
        /// Puts the timeline back to the start and empties the field, reusing the pool. A
        /// retry must not build new enemies: that would allocate exactly what hard rule 2
        /// keeps out of a battle.
        /// </summary>
        public void Restart()
        {
            Clear();
            elapsed = 0f;
            for (int i = 0; i < waves.Length; i++)
            {
                waves[i].spawned = 0;
                waves[i].nextSpawnTime = waves[i].entry.time;
            }
        }
    }
}
