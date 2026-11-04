using System.Collections.Generic;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using ScrapTitan.Battle;

namespace ScrapTitan.Tests
{
    /// <summary>
    /// What tools/modelgen built, as Unity actually imported it.
    ///
    /// The Blender checker already proves the .blend matches its brief. This proves the trip
    /// through FBX export and Unity's model importer did not change it: the scale, the pivot
    /// spacing and the axis the briefs put the hips on. The game's code reads those positions
    /// rather than re-deriving the briefs' numbers by hand, so if this drifts, the Titan comes
    /// apart at the joints and nothing else would say why.
    /// </summary>
    public sealed class ModelImportTests
    {
        private const string Folder = "Assets/_Game/Resources/Models";

        private static GameObject Load(string assetId)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>($"{Folder}/{assetId}.fbx");
            Assert.That(prefab, Is.Not.Null, $"{assetId}.fbx is not imported under {Folder}");
            return prefab;
        }

        private static Transform Part(GameObject instance, string name)
        {
            Transform part = ModelLibrary.Part(instance, name);
            Assert.That(part, Is.Not.Null,
                $"{instance.name} has no part called {name}; the briefs fix every object name");
            return part;
        }

        private static Bounds BoundsOf(Transform part) =>
            ModelLibrary.WorldBounds(part.gameObject);

        [Test]
        public void EveryGeneratedModelImports()
        {
            foreach (string id in new[]
            {
                "titan_chassis", "titan_cannon_autocannon", "enemy_rustcrawler",
                "pickup_scrap", "env_rust_flats_ground",
            })
            {
                Assert.That(Load(id), Is.Not.Null);
            }
        }

        [Test]
        public void TheChassisKeepsTheBriefsPivotSpacing()
        {
            GameObject chassis = Object.Instantiate(Load("titan_chassis"));
            try
            {
                Transform thigh = Part(chassis, "Titan_Leg_Upper");
                Transform shin = Part(chassis, "Titan_Leg_Lower");
                Transform foot = Part(chassis, "Titan_Foot");

                // Brief 01: knee 3.40 m below the hip, ankle 3.40 m below the knee. Measured
                // as distances, so this holds whichever way the exporter mapped the axes.
                Assert.That(Vector3.Distance(thigh.position, shin.position),
                    Is.EqualTo(3.4f).Within(0.01f), "hip to knee");
                Assert.That(Vector3.Distance(shin.position, foot.position),
                    Is.EqualTo(3.4f).Within(0.01f), "knee to ankle");
                Assert.That(Vector3.Distance(thigh.position, foot.position),
                    Is.EqualTo(6.8f).Within(0.01f), "hip to ankle");
            }
            finally
            {
                Object.DestroyImmediate(chassis);
            }
        }

        [Test]
        public void TheChassisKeepsItsHipToSoleHeight()
        {
            GameObject chassis = Object.Instantiate(Load("titan_chassis"));
            try
            {
                Transform thigh = Part(chassis, "Titan_Leg_Upper");
                Transform foot = Part(chassis, "Titan_Foot");

                // The briefed 7.70 m, which is the figure the Blender checker measures too.
                float sole = BoundsOf(foot).min.y;
                Assert.That(thigh.position.y - sole, Is.EqualTo(7.7f).Within(0.02f),
                    "hip pivot to the sole of the foot");
            }
            finally
            {
                Object.DestroyImmediate(chassis);
            }
        }

        [Test]
        public void TheModelsArriveAtMetreScaleAndYUp()
        {
            GameObject chassis = Object.Instantiate(Load("titan_chassis"));
            try
            {
                Bounds whole = ModelLibrary.WorldBounds(chassis);
                // Brief 01: 9.0 m of torso above the hip and 7.7 m of leg below it.
                Assert.That(whole.size.y, Is.EqualTo(16.7f).Within(0.05f),
                    "the whole chassis stands 16.70 m, which is the brief's own arithmetic. "
                    + "A wrong importer scale or a Z-up import would both show here.");
                Assert.That(chassis.transform.localScale, Is.EqualTo(Vector3.one),
                    "the FBX carries the briefs' metre scale, so the importer must not add one");
            }
            finally
            {
                Object.DestroyImmediate(chassis);
            }
        }

        [Test]
        public void TheHipsAreSeparatedAcrossTheBodyNotAlongIt()
        {
            GameObject chassis = Object.Instantiate(Load("titan_chassis"));
            try
            {
                Transform torso = Part(chassis, "Titan_Torso");
                Transform thigh = Part(chassis, "Titan_Leg_Upper");
                Vector3 local = torso.InverseTransformPoint(thigh.position);

                // Brief 01 puts the hip at X = 2.20 across the body. BattleDirector mirrors a
                // leg by negating that same local X, so this is the assertion that makes the
                // mirror correct rather than a guess.
                Assert.That(Mathf.Abs(local.x), Is.EqualTo(2.2f).Within(0.01f),
                    "the hip sits 2.20 m to one side of the torso, across the body");
                Assert.That(Mathf.Abs(local.z), Is.LessThan(0.05f),
                    "and is not offset front to back");
            }
            finally
            {
                Object.DestroyImmediate(chassis);
            }
        }

        [Test]
        public void TheAutocannonBarrelSitsWhereTheBriefPutsIt()
        {
            GameObject cannon = Object.Instantiate(Load("titan_cannon_autocannon"));
            try
            {
                Transform housing = Part(cannon, "Autocannon_Housing");
                Transform barrel = Part(cannon, "Autocannon_Barrel");

                // Brief 02: the barrel's rear end sits 0.60 m from the housing origin, so
                // about 0.6 m of barrel is inside the housing.
                Assert.That(Vector3.Distance(housing.position, barrel.position),
                    Is.EqualTo(0.6f).Within(0.01f));

                // And it is 5.00 m long, which is what BarrelLength reads off the mesh.
                Bounds b = BoundsOf(barrel);
                float longest = Mathf.Max(b.size.x, Mathf.Max(b.size.y, b.size.z));
                Assert.That(longest, Is.EqualTo(5.0f).Within(0.05f));
            }
            finally
            {
                Object.DestroyImmediate(cannon);
            }
        }

        [Test]
        public void APartsOwnForwardIsNotTheDirectionItPoints()
        {
            // The trap this suite exists for. Each imported part carries a rotation of its
            // own, and for these models a barrel's local +Z is world up, not along the
            // barrel. Anything that needs a direction has to measure it from the geometry.
            GameObject cannon = Object.Instantiate(Load("titan_cannon_autocannon"));
            try
            {
                Transform barrel = Part(cannon, "Autocannon_Barrel");
                Bounds bounds = BoundsOf(barrel);
                Vector3 alongBarrel = (bounds.center - barrel.position).normalized;

                Assert.That(Vector3.Dot(alongBarrel, barrel.forward), Is.LessThan(0.9f),
                    "if a part's own forward ever does run along its geometry, the comment in "
                    + "Titan.AimDirection and the measurement in BattleDirector can be "
                    + "simplified; until then they must not be");
                Assert.That(Mathf.Abs(alongBarrel.y), Is.LessThan(0.05f),
                    "the barrel lies level in its own model space");
            }
            finally
            {
                Object.DestroyImmediate(cannon);
            }
        }

        [Test]
        public void TheRustcrawlerIsTheSizeItsBriefGives()
        {
            GameObject crawler = Object.Instantiate(Load("enemy_rustcrawler"));
            try
            {
                Bounds body = BoundsOf(Part(crawler, "Rustcrawler_Body"));
                var sizes = new List<float> { body.size.x, body.size.y, body.size.z };
                sizes.Sort();

                // Brief 10: 3.2 m long, 1.8 wide, 1.4 tall, in some order depending on axes.
                Assert.That(sizes[0], Is.EqualTo(1.4f).Within(0.03f));
                Assert.That(sizes[1], Is.EqualTo(1.8f).Within(0.03f));
                Assert.That(sizes[2], Is.EqualTo(3.2f).Within(0.03f));
            }
            finally
            {
                Object.DestroyImmediate(crawler);
            }
        }

        [Test]
        public void TheGroundTileIsTwentyMetresLongSoTheRingWraps()
        {
            GameObject tile = Object.Instantiate(Load("env_rust_flats_ground"));
            try
            {
                Bounds bounds = BoundsOf(Part(tile, "Ground_Tile"));
                var sizes = new List<float> { bounds.size.x, bounds.size.y, bounds.size.z };
                sizes.Sort();

                // Brief 28: 20 m along X, 12 m deep, 3 m from the walking surface to the lip.
                Assert.That(sizes[0], Is.EqualTo(3.0f).Within(0.05f));
                Assert.That(sizes[1], Is.EqualTo(12.0f).Within(0.05f));
                Assert.That(sizes[2], Is.EqualTo(20.0f).Within(0.05f));
            }
            finally
            {
                Object.DestroyImmediate(tile);
            }
        }
    }
}
