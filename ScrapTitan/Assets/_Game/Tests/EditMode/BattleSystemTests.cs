using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using ScrapTitan.Battle;
using ScrapTitan.Data;

namespace ScrapTitan.Tests
{
    /// <summary>
    /// The Phase 1 battle systems, exercised without a scene. Enemy, the pool, targeting and
    /// the damage matrix are all plain objects for exactly this reason, which is also how the
    /// Phaser build's headless simulation balanced against the real matrix rather than a copy.
    /// </summary>
    public sealed class BattleSystemTests
    {
        private static TuningDef Tuning => GameDatabase.Instance.tuning;

        private static Enemy SpawnedEnemy(string id, float x, int lane = 1, float hpMul = 1f)
        {
            GameDatabase db = GameDatabase.Instance;
            EnemyDef def = db.Enemy(id);
            World3dTuning w = Tuning.world3d;
            var view = new GameObject($"test_{id}").transform;
            var enemy = new Enemy(view, System.Array.Empty<Transform>(), 0f, w.pixelsPerMetre);
            enemy.Spawn(def, w.BaseSizeFor(def.armorClass),
                        new Vector3(x, w.GroundYFor(lane), w.ZFor(lane)), lane, hpMul);
            return enemy;
        }

        // ------------------------------------------------------------------ the pool

        [Test]
        public void ThePoolHandsBackNothingWhenItIsOutRatherThanGrowing()
        {
            var pool = new Pool<object>(3, _ => new object());
            Assert.That(pool.Obtain(), Is.Not.Null);
            Assert.That(pool.Obtain(), Is.Not.Null);
            object third = pool.Obtain();
            Assert.That(third, Is.Not.Null);
            Assert.That(pool.Obtain(), Is.Null, "hard rule 2: a pool must not grow mid fight");
            Assert.That(pool.ActiveCount, Is.EqualTo(3));

            pool.Recycle(third);
            Assert.That(pool.ActiveCount, Is.EqualTo(2));
            Assert.That(pool.Obtain(), Is.Not.Null, "a recycled member comes back");
        }

        [Test]
        public void ThePoolNeverHandsTheSameMemberOutTwice()
        {
            var pool = new Pool<object>(8, _ => new object());
            var seen = new HashSet<object>();
            for (int i = 0; i < 8; i++)
            {
                object got = pool.Obtain();
                Assert.That(seen.Add(got), Is.True, "the same member came back while still in use");
            }
        }

        // ------------------------------------------------------------------ damage

        [Test]
        public void TheDamageMatrixIsAppliedAndNothingElseMultiplies()
        {
            var damage = new DamageSystem(Tuning);
            Enemy crawler = SpawnedEnemy("rustcrawler", 20f);
            float expected = Tuning.damageMatrix.Multiplier(DamageType.Kinetic, ArmorClass.Light);

            DamageResult result = damage.ApplyToEnemy(crawler, 10f, DamageType.Kinetic);

            Assert.That(result.multiplier, Is.EqualTo(expected).Within(1e-4f));
            Assert.That(result.amount, Is.EqualTo(10f * expected).Within(1e-3f),
                "damage is the base times the matrix and nothing else");
        }

        [Test]
        public void AnEnemyDiesOnlyWhenItsHpReachesZero()
        {
            var damage = new DamageSystem(Tuning);
            EnemyDef def = GameDatabase.Instance.Enemy("rustcrawler");
            Enemy crawler = SpawnedEnemy("rustcrawler", 20f);
            float perHit = 1f * Tuning.damageMatrix.Multiplier(DamageType.Kinetic, ArmorClass.Light);

            int hits = 0;
            while (crawler.IsAlive && hits < 10000)
            {
                damage.ApplyToEnemy(crawler, 1f, DamageType.Kinetic);
                hits++;
            }

            Assert.That(crawler.IsAlive, Is.False);
            Assert.That(hits, Is.EqualTo(Mathf.CeilToInt(def.hp / perHit)),
                "it should take exactly as many hits as its hp divided by the per-hit damage");
        }

        [Test]
        public void OnlyPiercingDamagesAShieldAtFullValue()
        {
            var damage = new DamageSystem(Tuning);
            // shield_bearer is the zone 2 enemy whose shield the Railgun exists to answer.
            Enemy bearer = SpawnedEnemy("shield_bearer", 20f);
            Assume.That(bearer.HasShield, Is.True, "shield_bearer should spawn with a shield");

            DamageResult kinetic = damage.ApplyToEnemy(bearer, 100f, DamageType.Kinetic);
            Enemy second = SpawnedEnemy("shield_bearer", 20f);
            DamageResult piercing = damage.ApplyToEnemy(second, 100f, DamageType.Piercing);

            Assert.That(kinetic.hitShield, Is.True);
            Assert.That(piercing.hitShield, Is.True);
            Assert.That(piercing.amount, Is.GreaterThan(kinetic.amount),
                "piercing must get more through a shield than kinetic does");
        }

        // ------------------------------------------------------------------ targeting

        [Test]
        public void TargetingPrefersTheClosestWhenNothingElseApplies()
        {
            var targeting = new TargetingSystem(Tuning);
            var near = SpawnedEnemy("rustcrawler", 12f);
            var far = SpawnedEnemy("rustcrawler", 40f);
            var enemies = new List<Enemy> { far, near };

            Assert.That(targeting.SelectTarget(enemies, Vector3.zero), Is.SameAs(near));
        }

        [Test]
        public void TargetingIgnoresAnythingBeyondTheEngagementLine()
        {
            var targeting = new TargetingSystem(Tuning);
            float beyond = Tuning.world3d.engageMaxX + 5f;
            var offScreen = SpawnedEnemy("rustcrawler", beyond);
            var enemies = new List<Enemy> { offScreen };

            Assert.That(targeting.SelectTarget(enemies, Vector3.zero), Is.Null,
                "the cannon must not snipe an enemy before the player can see it");
        }

        [Test]
        public void TheFocusTargetWinsOverACloserEnemy()
        {
            var targeting = new TargetingSystem(Tuning);
            var near = SpawnedEnemy("rustcrawler", 12f);
            var far = SpawnedEnemy("rustcrawler", 40f);
            var enemies = new List<Enemy> { near, far };

            targeting.SetFocus(far);
            Assert.That(targeting.SelectTarget(enemies, Vector3.zero), Is.SameAs(far));
        }

        [Test]
        public void FocusingTheSameEnemyTwiceClearsIt()
        {
            var targeting = new TargetingSystem(Tuning);
            var enemy = SpawnedEnemy("rustcrawler", 20f);

            targeting.SetFocus(enemy);
            Assert.That(targeting.FocusTarget, Is.SameAs(enemy));
            targeting.SetFocus(enemy);
            Assert.That(targeting.FocusTarget, Is.Null, "a second tap unfocuses");
        }

        [Test]
        public void ADeadFocusTargetIsDropped()
        {
            var targeting = new TargetingSystem(Tuning);
            var enemy = SpawnedEnemy("rustcrawler", 20f);
            targeting.SetFocus(enemy);

            enemy.ApplyDamage(float.MaxValue);
            targeting.Prune();

            Assert.That(targeting.FocusTarget, Is.Null);
        }

        [Test]
        public void ARangedEnemyAlreadyInRangeOutranksACloserMeleeOne()
        {
            var targeting = new TargetingSystem(Tuning);
            World3dTuning w = Tuning.world3d;
            // gunner_walker is the zone 1 ranged attacker.
            EnemyDef gunner = GameDatabase.Instance.Enemy("gunner_walker");
            Assume.That(gunner.attackRange, Is.GreaterThan(0f));

            // attackRange is in the Phaser build's pixels like the rest of src/data, so the
            // spawn point has to be converted the same way Enemy converts it.
            float rangeMetres = gunner.attackRange / w.pixelsPerMetre;
            var shooter = SpawnedEnemy("gunner_walker", w.titanX + rangeMetres + 2f);
            var context = new EnemyContext
            {
                titanX = w.titanX,
                meleeStandoff = w.meleeStandoff,
                onAttack = _ => { },
            };
            // Walk it in until it halts at its own range and opens fire.
            for (int i = 0; i < 600; i++) shooter.Update(1f / 60f, context);
            Assume.That(shooter.Position.x, Is.EqualTo(w.titanX + rangeMetres).Within(0.01f),
                "it should have halted at its own attack range");
            Assume.That(shooter.IsRangedInRange, Is.True, "it should have halted and opened fire");

            var crawler = SpawnedEnemy("rustcrawler", 8f);
            var enemies = new List<Enemy> { crawler, shooter };

            Assert.That(targeting.SelectTarget(enemies, Vector3.zero), Is.SameAs(shooter),
                "a ranged enemy chipping the hull for free is the priority 2 rule");
        }

        // ------------------------------------------------------------------ movement

        [Test]
        public void AMeleeEnemyStopsAtTheStandoffPlusItsOwnHalfLength()
        {
            World3dTuning w = Tuning.world3d;
            EnemyDef def = GameDatabase.Instance.Enemy("rustcrawler");
            Enemy crawler = SpawnedEnemy("rustcrawler", 30f);
            var context = new EnemyContext
            {
                titanX = w.titanX, meleeStandoff = w.meleeStandoff, onAttack = _ => { },
            };

            for (int i = 0; i < 2000; i++) crawler.Update(1f / 60f, context);

            float expected = w.MeleeStopX(def.armorClass);
            Assert.That(crawler.Position.x, Is.EqualTo(expected).Within(1e-3f));
            Assert.That(crawler.IsAttacking, Is.True);
            Assert.That(crawler.MovementSpeed, Is.EqualTo(0f), "a stopped enemy is not led");
        }

        [Test]
        public void AnEnemyWalksAtTheSpeedItsDataGives()
        {
            World3dTuning w = Tuning.world3d;
            EnemyDef def = GameDatabase.Instance.Enemy("rustcrawler");
            Enemy crawler = SpawnedEnemy("rustcrawler", 40f);
            var context = new EnemyContext
            {
                titanX = w.titanX, meleeStandoff = w.meleeStandoff, onAttack = _ => { },
            };

            crawler.Update(1f, context);

            // src/data is still in the Phaser build's pixels per second, so a Rustcrawler's
            // 55 is 2.75 m/s. Without the conversion it crossed the whole 64 m field in a
            // second, which is what this test was written to catch.
            float expected = def.speed / w.pixelsPerMetre;
            Assert.That(expected, Is.EqualTo(2.75f).Within(1e-3f));
            Assert.That(40f - crawler.Position.x, Is.EqualTo(expected).Within(1e-3f),
                "one second of walking should cover one second of its briefed speed in metres");
        }

        [Test]
        public void AnEnemyAttacksOnItsOwnInterval()
        {
            World3dTuning w = Tuning.world3d;
            EnemyDef def = GameDatabase.Instance.Enemy("rustcrawler");
            Enemy crawler = SpawnedEnemy("rustcrawler", w.MeleeStopX(def.armorClass));
            int attacks = 0;
            var context = new EnemyContext
            {
                titanX = w.titanX, meleeStandoff = w.meleeStandoff, onAttack = _ => attacks++,
            };

            float seconds = 10f;
            for (int i = 0; i < 600; i++) crawler.Update(seconds / 600f, context);

            Assert.That(attacks, Is.EqualTo(Mathf.FloorToInt(seconds / def.attackInterval)));
        }

        // ------------------------------------------------------------------ leading a shot

        [Test]
        public void AutoFireLeadsAMovingTargetAheadOfIt()
        {
            Enemy crawler = SpawnedEnemy("rustcrawler", 40f);
            Vector3 muzzle = new Vector3(0f, 6f, 0f);

            Vector3 aim = WeaponSystem.LeadTarget(crawler, muzzle, 45f);

            Assert.That(aim.x, Is.LessThan(crawler.Centre.x),
                "the enemy closes along -X, so the shot leads to the left of it");
            Assert.That(aim.y, Is.EqualTo(crawler.Centre.y).Within(1e-4f));
        }

        [Test]
        public void AStoppedTargetIsNotLed()
        {
            World3dTuning w = Tuning.world3d;
            EnemyDef def = GameDatabase.Instance.Enemy("rustcrawler");
            Enemy crawler = SpawnedEnemy("rustcrawler", w.MeleeStopX(def.armorClass));
            var context = new EnemyContext
            {
                titanX = w.titanX, meleeStandoff = w.meleeStandoff, onAttack = _ => { },
            };
            crawler.Update(0.1f, context);

            Vector3 aim = WeaponSystem.LeadTarget(crawler, new Vector3(0f, 6f, 0f), 45f);

            Assert.That(aim, Is.EqualTo(crawler.Centre));
        }

        // ------------------------------------------------------------------ economy

        [Test]
        public void ScrapStartsAtTheLevelsFloatAndTricklesAtItsRate()
        {
            LevelDef level = GameDatabase.Instance.Level("level-01");
            var economy = new EconomySystem(level);

            Assert.That(economy.Balance, Is.EqualTo(level.economy.startingScrap));
            economy.Update(10f);
            Assert.That(economy.Balance,
                Is.EqualTo(level.economy.startingScrap + Mathf.FloorToInt(level.economy.trickle * 10f)));
        }

        [Test]
        public void TheClearTimeForLevelOneMatchesThePhaserSim()
        {
            // The Phaser build's `npm run sim` clears level-01 in 80.5 s with 33 kills and no
            // hull damage. Rendering the Unity battle to completion gives 81.9 s, 33 kills
            // and no hull damage, which is the check that matters on the metre conversion:
            // every length and speed was divided by the same 20, so distance over speed, and
            // therefore the clear time, is unchanged. This test guards the arithmetic that
            // rests on; the clear time itself is measured by scripts/unity-frames.sh.
            World3dTuning w = Tuning.world3d;
            EnemyDef crawler = GameDatabase.Instance.Enemy("rustcrawler");

            float metresPerSecond = crawler.speed / w.pixelsPerMetre;
            float travel = w.spawnX - w.MeleeStopX(crawler.armorClass);
            float walkSeconds = travel / metresPerSecond;

            // The same journey in the Phaser build's own units.
            float pixelTravel = (Tuning.world.spawnXFraction - Tuning.world.mechaXFraction)
                                * Tuning.world.baseWidth
                                - Tuning.world.meleeStandoff
                                - Tuning.world.BaseSizeFor(crawler.armorClass).width * 0.5f;
            float pixelSeconds = pixelTravel / crawler.speed;

            Assert.That(walkSeconds, Is.EqualTo(pixelSeconds).Within(0.75f),
                "a Rustcrawler must take the same time to cross the field in metres as it did "
                + "in pixels, or every clear time the Phaser sim reports is worthless here");
        }

        [Test]
        public void AKillPaysTheEnemysOwnReward()
        {
            LevelDef level = GameDatabase.Instance.Level("level-01");
            EnemyDef def = GameDatabase.Instance.Enemy("rustcrawler");
            var economy = new EconomySystem(level);
            int before = economy.Balance;

            economy.AwardKill(def.reward);

            Assert.That(economy.Balance, Is.EqualTo(before + def.reward));
        }
    }
}
