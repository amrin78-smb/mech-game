using UnityEngine;
using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>What a weapon asks the projectile pool for. A struct, so firing allocates nothing.</summary>
    public struct ShotSpec
    {
        public float speed;
        public float damage;
        public DamageType damageType;
        public float lifetime;
        public bool isManualShot;
        public float aoeRadius;
        public bool pierce;
    }

    /// <summary>One pooled shell. Plain object with a view transform, like Enemy.</summary>
    public sealed class Projectile
    {
        private readonly Transform view;

        public Projectile(Transform view)
        {
            this.view = view;
            Hide();
        }

        public bool Active { get; private set; }
        public ShotSpec Spec { get; private set; }
        public Vector3 Position { get; private set; }
        public Vector3 Velocity { get; private set; }
        public float Age { get; private set; }

        public void Launch(Vector3 from, Vector3 direction, ShotSpec spec)
        {
            Spec = spec;
            Position = from;
            Velocity = direction.normalized * spec.speed;
            Age = 0f;
            Active = true;
            view.gameObject.SetActive(true);
            view.position = from;
            view.rotation = Quaternion.LookRotation(direction.sqrMagnitude > 1e-6f
                ? direction
                : Vector3.right);
        }

        /// <summary>Advances the shell. False once it has expired.</summary>
        public bool Step(float dt)
        {
            Position += Velocity * dt;
            Age += dt;
            view.position = Position;
            return Age < Spec.lifetime;
        }

        public void Hide()
        {
            Active = false;
            if (view != null) view.gameObject.SetActive(false);
        }
    }
}
