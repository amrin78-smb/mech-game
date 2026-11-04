using System;
using System.Collections.Generic;
using UnityEngine;
using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>
    /// The main cannon, exactly as hard rule 9 describes it.
    ///
    /// Auto fire is the default: the barrel tracks whatever TargetingSystem picks and shoots
    /// at the weapon's fireRate. A drag takes manual control at any moment, which pauses auto
    /// fire and shows an aim line; releasing fires one precision shot at
    /// tuning.targeting.manualShotDamageMultiplier, and auto fire resumes after
    /// autoFireResumeDelay.
    /// </summary>
    public sealed class WeaponSystem
    {
        private readonly Titan titan;
        private readonly TargetingSystem targeting;
        private readonly ProjectileSystem projectiles;
        private readonly WeaponDef weapon;
        private readonly TuningDef tuning;

        /// <summary>Multipliers the in-battle upgrade panel drives, which is Phase 2.</summary>
        public float damageMultiplier = 1f;
        public float fireRateMultiplier = 1f;

        private float cooldown;
        private float autoPauseRemaining;
        private ShotSpec spec;

        public Action<Vector3, Vector3, bool> onShotFired;

        public WeaponSystem(Titan titan, TargetingSystem targeting, ProjectileSystem projectiles,
                            WeaponDef weapon, TuningDef tuning)
        {
            this.titan = titan;
            this.targeting = targeting;
            this.projectiles = projectiles;
            this.weapon = weapon;
            this.tuning = tuning;

            spec = new ShotSpec
            {
                speed = weapon.projectile.speed / tuning.world3d.pixelsPerMetre,
                damageType = weapon.damageType,
                lifetime = tuning.world.projectileLifetime,
                aoeRadius = weapon.projectile.aoeRadius / tuning.world3d.pixelsPerMetre,
                pierce = weapon.projectile.pierce,
            };
        }

        public string WeaponName => weapon.displayName;
        public bool IsManualAiming { get; private set; }
        public Vector3 ManualAimPoint { get; private set; }

        /// <summary>Shots per second after upgrades.</summary>
        private float FireRate => weapon.fireRate * fireRateMultiplier;

        private float ShotDamage => weapon.baseDamage * damageMultiplier;

        public void BeginManualAim(Vector3 at)
        {
            IsManualAiming = true;
            ManualAimPoint = at;
        }

        public void UpdateManualAim(Vector3 at) => ManualAimPoint = at;

        /// <summary>Releasing the drag is the shot. Auto fire stays paused for the resume delay.</summary>
        public void ReleaseManualAim()
        {
            if (!IsManualAiming) return;
            IsManualAiming = false;
            autoPauseRemaining = tuning.targeting.autoFireResumeDelay;

            titan.AimAt(ManualAimPoint);
            FireShot(ShotDamage * tuning.targeting.manualShotDamageMultiplier, true);
            cooldown = 0f;
        }

        /// <summary>Drag abandoned: no shot, but auto fire still waits out the resume delay.</summary>
        public void CancelManualAim()
        {
            if (!IsManualAiming) return;
            IsManualAiming = false;
            autoPauseRemaining = tuning.targeting.autoFireResumeDelay;
        }

        public void Update(float dt, List<Enemy> enemies)
        {
            if (autoPauseRemaining > 0f) autoPauseRemaining -= dt;

            if (IsManualAiming)
            {
                titan.AimAt(ManualAimPoint);
                return;
            }
            UpdateAutoFire(dt, enemies);
        }

        private void UpdateAutoFire(float dt, List<Enemy> enemies)
        {
            Vector3 muzzle = titan.Muzzle;
            ITarget target = targeting.SelectTarget(enemies, muzzle);

            float interval = 1f / Mathf.Max(FireRate, 0.0001f);
            cooldown += dt;

            if (target == null)
            {
                // Stay loaded, but do not bank shots for a burst when a target appears.
                if (cooldown > interval) cooldown = interval;
                return;
            }

            titan.AimAt(LeadTarget(target, muzzle, spec.speed));

            if (autoPauseRemaining > 0f) return;

            while (cooldown >= interval)
            {
                cooldown -= interval;
                FireShot(ShotDamage, false);
            }
        }

        private void FireShot(float damage, bool isManual)
        {
            Vector3 muzzle = titan.Muzzle;
            Vector3 direction = titan.AimDirection;

            spec.damage = damage;
            spec.isManualShot = isManual;

            int pellets = Mathf.Max(weapon.projectile.pellets, 1);
            bool fired = false;
            if (pellets <= 1)
            {
                fired = projectiles.Fire(muzzle, direction, spec);
            }
            else
            {
                float half = weapon.projectile.spreadDegrees;
                for (int i = 0; i < pellets; i++)
                {
                    // An even fan, not random, so the pattern is the weapon's signature
                    // rather than a different gun every trigger pull.
                    float t = pellets == 1 ? 0f : (i / (float)(pellets - 1)) * 2f - 1f;
                    Vector3 spread = Quaternion.Euler(0f, 0f, t * half) * direction;
                    if (projectiles.Fire(muzzle, spread, spec)) fired = true;
                }
            }

            if (!fired) return;
            titan.KickCannon();
            onShotFired?.Invoke(muzzle, direction, isManual);
        }

        /// <summary>
        /// Shells have travel time, so auto fire leads the target. Enemies move only along X
        /// and stop once in range, which makes the intercept one refinement pass rather than
        /// a solver.
        /// </summary>
        public static Vector3 LeadTarget(ITarget target, Vector3 from, float projectileSpeed)
        {
            Vector3 at = target.Centre;
            float vx = -target.MovementSpeed;
            if (Mathf.Approximately(vx, 0f) || projectileSpeed <= 0f) return at;

            float flight = Vector3.Distance(from, at) / projectileSpeed;
            Vector3 predicted = at + new Vector3(vx * flight, 0f, 0f);
            float refined = Vector3.Distance(from, predicted) / projectileSpeed;
            return at + new Vector3(vx * refined, 0f, 0f);
        }

        public void Reset()
        {
            cooldown = 0f;
            autoPauseRemaining = 0f;
            IsManualAiming = false;
        }
    }
}
