using System;
using System.Collections.Generic;
using UnityEngine;
using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>
    /// One pool of shells for every weapon, cannon and turret alike. Hard rule 2: the pool is
    /// built up front and an exhausted pool drops the shot rather than allocating mid fight.
    /// </summary>
    public sealed class ProjectileSystem
    {
        private readonly Pool<Projectile> pool;
        private readonly List<Projectile> live;
        private readonly DamageSystem damage;
        private readonly float hitRadius;
        private readonly float despawnX;

        /// <summary>Raised on a hit: the enemy, what the hit did, and where it landed.</summary>
        public Action<Enemy, DamageResult, Vector3> onHit;

        public ProjectileSystem(TuningDef tuning, DamageSystem damage, Func<int, Transform> makeView)
        {
            this.damage = damage;
            hitRadius = tuning.world3d.projectileRadius;
            despawnX = tuning.world3d.despawnX;
            int capacity = Mathf.Max(tuning.pools.projectiles, 1);
            pool = new Pool<Projectile>(capacity, i => new Projectile(makeView(i)));
            live = new List<Projectile>(capacity);
        }

        public int LiveCount => live.Count;

        /// <summary>Fires one round. False when the pool is out, so the caller can skip its flash.</summary>
        public bool Fire(Vector3 from, Vector3 direction, ShotSpec spec)
        {
            Projectile shell = pool.Obtain();
            if (shell == null) return false;
            shell.Launch(from, direction, spec);
            live.Add(shell);
            return true;
        }

        public void Update(float dt, List<Enemy> enemies)
        {
            for (int i = live.Count - 1; i >= 0; i--)
            {
                Projectile shell = live[i];
                bool alive = shell.Step(dt);

                Enemy struck = FirstHit(shell, enemies);
                if (struck != null)
                {
                    DamageResult result = damage.ApplyToEnemy(struck, shell.Spec.damage,
                                                              shell.Spec.damageType);
                    onHit?.Invoke(struck, result, shell.Position);
                    // A piercing round carries on through; everything else stops here.
                    if (!shell.Spec.pierce) alive = false;
                }

                if (alive && shell.Position.x > despawnX) continue;
                shell.Hide();
                pool.Recycle(shell);
                live.RemoveAt(i);
            }
        }

        private Enemy FirstHit(Projectile shell, List<Enemy> enemies)
        {
            for (int i = 0; i < enemies.Count; i++)
            {
                Enemy enemy = enemies[i];
                if (!enemy.IsAlive) continue;
                float reach = enemy.Radius + hitRadius;
                if ((enemy.Centre - shell.Position).sqrMagnitude <= reach * reach) return enemy;
            }
            return null;
        }

        public void Clear()
        {
            for (int i = 0; i < live.Count; i++) live[i].Hide();
            live.Clear();
            pool.RecycleAll();
        }
    }
}
