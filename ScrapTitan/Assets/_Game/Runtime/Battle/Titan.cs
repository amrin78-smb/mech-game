using UnityEngine;
using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>
    /// The player's mecha: a torso that bobs, two legs that swing from their hip pivots, and
    /// a main cannon that aims and recoils.
    ///
    /// Every part is a child of the chassis root, hung at the pivot its brief gives, so the
    /// animation here is the same animation the real models will drive: nothing is rigged,
    /// the game turns the parts. The legs are two copies of the same thigh-shin-foot chain,
    /// offset in depth and driven half a stride apart.
    /// </summary>
    public sealed class Titan : IHullTarget
    {
        private readonly Transform root;
        private readonly Transform torso;
        private readonly Transform cannonHousing;
        private readonly Transform cannonBarrel;
        private readonly LegChain[] legs;
        private readonly MechaTuning mecha;
        private readonly World3dTuning world;

        private readonly Vector3 torsoRest;
        private readonly Vector3 barrelRest;

        /// <summary>
        /// Each imported part carries a rotation of its own, which is how a file authored
        /// Z-up ends up Y-up in the scene. Animating by assigning localRotation wipes it and
        /// the Titan lies down: the first frames rendered showed exactly that, a flat torso
        /// with its legs stretched out behind it. Every turn below is composed onto the rest
        /// pose instead.
        /// </summary>
        private readonly Quaternion torsoRestRotation;
        private readonly Quaternion housingRestRotation;
        private readonly Quaternion[] thighRest;
        private readonly Quaternion[] shinRest;
        private readonly Quaternion[] footRest;
        private float elapsed;
        private float recoil;
        private Vector3 aimPoint;

        public float HullMax { get; }
        public float Hull { get; private set; }
        public float HullFraction => HullMax <= 0f ? 0f : Mathf.Clamp01(Hull / HullMax);
        public bool IsDestroyed => Hull <= 0f;

        /// <summary>One leg: a thigh that swings from the hip, a shin from the knee, a foot.</summary>
        public struct LegChain
        {
            public Transform thigh;
            public Transform shin;
            public Transform foot;
            /// <summary>+1 or -1: which half of the stride this leg is on.</summary>
            public float phase;
        }

        public Titan(Transform root, Transform torso, Transform cannonHousing,
                     Transform cannonBarrel, LegChain[] legs, TuningDef tuning, float hullMax)
        {
            this.root = root;
            this.torso = torso;
            this.cannonHousing = cannonHousing;
            this.cannonBarrel = cannonBarrel;
            this.legs = legs;
            mecha = tuning.mecha;
            world = tuning.world3d;

            torsoRest = torso.localPosition;
            barrelRest = cannonBarrel.localPosition;
            torsoRestRotation = torso.localRotation;
            housingRestRotation = cannonHousing.localRotation;
            thighRest = new Quaternion[legs.Length];
            shinRest = new Quaternion[legs.Length];
            footRest = new Quaternion[legs.Length];
            for (int i = 0; i < legs.Length; i++)
            {
                thighRest[i] = legs[i].thigh.localRotation;
                shinRest[i] = legs[i].shin.localRotation;
                footRest[i] = legs[i].foot.localRotation;
            }
            HullMax = hullMax;
            Hull = hullMax;
            aimPoint = root.position + Vector3.right * 10f;
        }

        public Transform Root => root;

        /// <summary>Where a shot leaves the barrel: its far end, along the aim.</summary>
        public Vector3 Muzzle => cannonBarrel.position + cannonBarrel.forward * BarrelLength;

        public Vector3 AimDirection => cannonHousing.forward;

        /// <summary>
        /// Barrel length along its own axis. Read from the mesh once rather than hard coded,
        /// so swapping the autocannon for the railgun's 8 m barrel needs no code change.
        /// </summary>
        public float BarrelLength { get; set; } = 5f;

        /// <summary>
        /// The barrel's own axis in its parent's space, so recoil slides it back along
        /// itself. Set when the Titan is assembled, from the direction the barrel points.
        /// </summary>
        public Vector3 BarrelAxis { get; set; } = Vector3.forward;

        public void AimAt(Vector3 worldPoint) => aimPoint = worldPoint;

        /// <summary>A shot kicks the barrel back; it slides home over the next few frames.</summary>
        public void KickCannon() => recoil = world.recoil.cannon;

        public void Update(float dt)
        {
            elapsed += dt;

            // Idle bob and sway, in metres rather than the Phaser build's pixels.
            float bob = Mathf.Sin(elapsed / mecha.bobPeriod * Mathf.PI * 2f)
                        * (mecha.bobAmplitude / world.pixelsPerMetre);
            torso.localPosition = torsoRest + new Vector3(0f, bob, 0f);
            // Sway is about the axis the Titan faces along, so it rocks side to side on
            // screen rather than nodding.
            torso.localRotation = torsoRestRotation * Quaternion.Euler(
                0f, 0f,
                Mathf.Sin(elapsed / mecha.swayPeriod * Mathf.PI * 2f) * mecha.swayAmplitude);

            Stride();
            Aim();
            Recoil(dt);
        }

        /// <summary>
        /// The legs walk on the spot: the world scrolls past instead. Swing comes from
        /// tuning.mecha.legArticulation, which is the same shape the Phaser build used.
        /// </summary>
        private void Stride()
        {
            float swing = mecha.legArticulation.swingDegrees;
            float cycle = elapsed / mecha.walkPeriod * Mathf.PI * 2f;
            for (int i = 0; i < legs.Length; i++)
            {
                LegChain leg = legs[i];
                float t = Mathf.Sin(cycle + (leg.phase > 0f ? 0f : Mathf.PI));
                // A model's width is on its local X, so that is the axis a hip, a knee and an
                // ankle all turn about. Rotating about Z would splay the legs sideways.
                leg.thigh.localRotation = thighRest[i] * Quaternion.Euler(t * swing, 0f, 0f);
                // The knee only ever bends one way, which is what keeps it from inverting.
                leg.shin.localRotation =
                    shinRest[i] * Quaternion.Euler(-Mathf.Max(t, 0f) * swing * 1.4f, 0f, 0f);
                leg.foot.localRotation =
                    footRest[i] * Quaternion.Euler(Mathf.Max(t, 0f) * swing * 0.5f, 0f, 0f);
            }
        }

        /// <summary>
        /// The cannon turns about its trunnion only, never the torso, so the sway cannot skew
        /// the aim. Pitch is clamped to the arc the brief gives: 30 degrees up, 15 down.
        /// </summary>
        private void Aim()
        {
            Vector3 to = aimPoint - cannonHousing.position;
            // The lanes are separated in depth, but the cannon is a side-on silhouette: it
            // aims in the screen plane and ignores the depth component, which is what keeps
            // the barrel readable rather than pointing into the screen.
            float pitch = Mathf.Atan2(to.y, Mathf.Max(to.x, 0.01f)) * Mathf.Rad2Deg;
            pitch = Mathf.Clamp(pitch, -15f, 30f);
            // The trunnion turns about the model's width axis, its local X. A positive
            // rotation there pitches the barrel down, so aiming up is negative.
            cannonHousing.localRotation = housingRestRotation * Quaternion.Euler(-pitch, 0f, 0f);
        }

        private void Recoil(float dt)
        {
            if (recoil <= 0f) return;
            recoil = Mathf.Max(0f, recoil - world.recoil.cannon * 9f * dt);
            cannonBarrel.localPosition = barrelRest - BarrelAxis * recoil;
        }

        /// <summary>Takes hull damage and returns what was actually taken.</summary>
        public float ApplyDamage(float amount)
        {
            float before = Hull;
            Hull = Mathf.Max(0f, Hull - amount);
            return before - Hull;
        }

        public void Repair(float amount) => Hull = Mathf.Min(HullMax, Hull + amount);
    }
}
