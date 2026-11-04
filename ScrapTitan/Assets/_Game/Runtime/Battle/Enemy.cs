using System;
using UnityEngine;
using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>What an enemy needs from the battle each frame, built once and reused.</summary>
    public sealed class EnemyContext
    {
        public float titanX;
        public float meleeStandoff;
        public Action<Enemy> onAttack;
    }

    /// <summary>
    /// Hard rule 3: one Enemy class. Behaviour differences come from EnemyDef data, never
    /// from subclasses; only Boss is excepted, and that is Phase 3.
    ///
    /// Not a MonoBehaviour. It owns a view transform instead, so the pool hands back a plain
    /// object and the whole thing is testable without a scene.
    /// </summary>
    public class Enemy : ITarget
    {
        private readonly Transform view;
        private readonly Transform[] legs;
        private readonly float legSwingPeriod;

        /// <summary>
        /// Each leg's rest rotation from the import. Assigning localRotation outright would
        /// wipe it and lay the legs flat, the same way it did to the Titan.
        /// </summary>
        private readonly Quaternion[] legRest;

        /// <summary>
        /// EnemyDef mirrors src/data exactly, and src/data is still in the Phaser build's
        /// 1280x720 pixels, so speed and attackRange are divided by this to get metres. The
        /// conversion lives here rather than in the import because the import's job is to
        /// carry the data across unchanged, which DataImportTests checks field by field.
        /// </summary>
        private readonly float pixelsPerMetre;

        private EnemyDef def;
        private float hp;
        private float hpMax;
        private float shield;
        private float shieldMax;
        private float attackTimer;
        private float walkPhase;
        private bool inRange;
        private bool alive;
        private int lane;
        private Vector3 position;
        private EnemySize3d size;

        /// <summary>Metres per second, converted from the data's pixels per second.</summary>
        private float speed;

        /// <summary>Metres, converted from the data's pixels. 0 for a melee enemy.</summary>
        private float attackRange;

        public Enemy(Transform view, Transform[] legs, float legSwingPeriod, float pixelsPerMetre)
        {
            this.view = view;
            this.legs = legs ?? Array.Empty<Transform>();
            this.legSwingPeriod = legSwingPeriod;
            legRest = new Quaternion[this.legs.Length];
            for (int i = 0; i < this.legs.Length; i++) legRest[i] = this.legs[i].localRotation;
            this.pixelsPerMetre = pixelsPerMetre <= 0f ? 1f : pixelsPerMetre;
            Hide();
        }

        public bool IsAlive => alive;
        public int Lane => lane;
        public EnemyDef Definition => def;
        public Transform View => view;
        public float Hp => hp;
        public float HpMax => hpMax;
        public float HpFraction => hpMax <= 0f ? 0f : Mathf.Clamp01(hp / hpMax);

        /// <summary>Centre of the body, which is what a shot is aimed at.</summary>
        public Vector3 Centre => position + new Vector3(0f, size.height * 0.5f, 0f);

        public float Radius => Mathf.Max(size.length, size.height) * 0.5f;

        /// <summary>Closing speed, 0 once it has stopped. Auto fire leads its shots by this.</summary>
        public float MovementSpeed => inRange || def == null ? 0f : speed;

        public bool IsAttacking => inRange;

        /// <summary>A ranged enemy sitting inside its own attack range: the priority 2 rule.</summary>
        public bool IsRangedInRange => inRange && HasRangedAttack;

        public bool HasRangedAttack =>
            def != null && Has(EnemyBehavior.Ranged) && attackRange > 0f;

        public bool HasShield => shield > 0f;
        public float DamageTakenScale => 1f;
        public float DamagePerHit => def == null ? 0f : def.damage;
        public int ScrapReward => def == null ? 0 : def.reward;

        private bool Has(EnemyBehavior behavior)
        {
            if (def == null) return false;
            for (int i = 0; i < def.behaviors.Length; i++)
                if (def.behaviors[i] == behavior) return true;
            return false;
        }

        public void Spawn(EnemyDef definition, EnemySize3d bodySize, Vector3 at, int laneIndex,
                          float hpMultiplier)
        {
            def = definition;
            size = bodySize;
            lane = laneIndex;
            speed = definition.speed / pixelsPerMetre;
            attackRange = definition.attackRange / pixelsPerMetre;
            position = at;
            hpMax = definition.hp * hpMultiplier;
            hp = hpMax;
            shieldMax = Has(EnemyBehavior.Shielded) ? definition.shieldHp * hpMultiplier : 0f;
            shield = shieldMax;
            attackTimer = 0f;
            walkPhase = 0f;
            inRange = false;
            alive = true;

            if (view != null)
            {
                view.gameObject.SetActive(true);
                // The brief sizes every model, so scale is the def's own multiplier only.
                view.localScale = Vector3.one * Mathf.Max(definition.scale, 0.01f);
                Apply();
            }
        }

        public void Update(float dt, EnemyContext ctx)
        {
            if (!alive || def == null) return;

            float stopX = StopX(ctx);
            if (position.x > stopX)
            {
                inRange = false;
                position.x = Mathf.Max(stopX, position.x - speed * dt);
                Stride(dt);
                Apply();
                return;
            }

            inRange = true;
            attackTimer += dt;
            while (attackTimer >= def.attackInterval)
            {
                attackTimer -= def.attackInterval;
                ctx.onAttack(this);
            }
        }

        /// <summary>
        /// Ranged enemies halt at their own attack range, melee at the contact standoff plus
        /// their own half length, which is what the Phaser build did with half the sprite
        /// width.
        /// </summary>
        private float StopX(EnemyContext ctx)
        {
            if (attackRange > 0f) return ctx.titanX + attackRange;
            return ctx.titanX + ctx.meleeStandoff + size.length * 0.5f;
        }

        /// <summary>Legs swing from their own hip pivots, half a cycle apart along the body.</summary>
        private void Stride(float dt)
        {
            if (legs.Length == 0 || legSwingPeriod <= 0f) return;
            walkPhase += dt / legSwingPeriod;
            if (walkPhase > 1f) walkPhase -= Mathf.Floor(walkPhase);
            for (int i = 0; i < legs.Length; i++)
            {
                float phase = walkPhase + (i % 2 == 0 ? 0f : 0.5f) + i * 0.08f;
                float swing = Mathf.Sin(phase * Mathf.PI * 2f) * 24f;
                // Hips sit on the model's width axis, so a leg swings fore and aft about X.
                legs[i].localRotation = legRest[i] * Quaternion.Euler(swing, 0f, 0f);
            }
        }

        private void Apply() => view.position = position;

        public float AbsorbWithShield(float amount)
        {
            if (shield <= 0f) return amount;
            float absorbed = Mathf.Min(shield, amount);
            shield -= absorbed;
            return amount - absorbed;
        }

        /// <summary>Takes hull damage. True if this killed it.</summary>
        public bool ApplyDamage(float amount)
        {
            if (!alive) return false;
            hp -= amount;
            if (hp > 0f) return false;
            hp = 0f;
            alive = false;
            return true;
        }

        /// <summary>Walked past the Titan, or the battle ended. Not a kill, so no reward.</summary>
        public void Retire()
        {
            alive = false;
            Hide();
        }

        public void Hide()
        {
            if (view != null) view.gameObject.SetActive(false);
        }

        public Vector3 Position => position;
    }
}
