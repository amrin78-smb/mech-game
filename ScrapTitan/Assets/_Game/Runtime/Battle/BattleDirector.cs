using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>What a finished battle reports. The results screen reads this.</summary>
    public struct BattleResult
    {
        public bool won;
        public int scrapEarned;
        public int enemiesKilled;
        public int enemiesEscaped;
        public float hullRemaining;
        public float hullMax;
        public float durationSeconds;
        public int stars;
    }

    /// <summary>
    /// Hard rule 7: the scene wires systems together and owns the update order; the logic
    /// lives in the systems. This builds the battle from the data and then does nothing each
    /// frame but tick things in the right order.
    ///
    /// Phase 1 scope: one level, one weapon, one enemy type, no turrets, escorts, pilots,
    /// bosses or upgrade panel. Everything it does read from src/data.
    /// </summary>
    public sealed class BattleDirector : MonoBehaviour
    {
        [Tooltip("Level id from src/data/levels. Empty means the first level in the database.")]
        public string levelId = "level-01";

        [Tooltip("Weapon id for the main cannon.")]
        public string weaponId = "autocannon";

        [Tooltip("Fixed seed so a lane roll is the same on both phones during a playtest.")]
        public int randomSeed = 20261104;

        private GameDatabase database;
        private TuningDef tuning;
        private LevelDef level;
        private World3dTuning world;

        private Camera view;
        private Titan titan;
        private TargetingSystem targeting;
        private DamageSystem damage;
        private ProjectileSystem projectiles;
        private WeaponSystem weapon;
        private WaveSpawner spawner;
        private EconomySystem economy;
        private ScrapDrops scrapDrops;
        private BattleInput input;
        private BattleHud hud;

        private readonly List<Transform> groundTiles = new();
        private float groundSpan;
        private float scrollSpeed;

        private int killed;
        private int escaped;
        private float elapsed;
        private bool battleOver;
        private BattleResult result;

        public BattleResult Result => result;
        public bool BattleOver => battleOver;

        private void Awake()
        {
            database = GameDatabase.Instance;
            tuning = database.tuning;
            world = tuning.world3d;
            level = string.IsNullOrEmpty(levelId) ? database.levels[0] : database.Level(levelId);

            BuildCamera();
            BuildLighting();
            BuildGround();
            BuildTitan();
            BuildSystems();

            hud = new BattleHud(this, tuning);
        }

        // ------------------------------------------------------------------ building

        private void BuildCamera()
        {
            GameObject go = new GameObject("BattleCamera");
            go.transform.SetParent(transform, false);
            view = go.AddComponent<Camera>();
            // Orthographic, because the plan puts everything at one camera distance so the
            // models need no detail levels, and it keeps a far lane the same size as a near.
            view.orthographic = true;
            view.orthographicSize = world.camera.orthographicSize;
            view.nearClipPlane = 0.1f;
            view.farClipPlane = world.camera.distance * 3f;
            view.backgroundColor = new Color(0.44f, 0.36f, 0.30f);
            view.clearFlags = CameraClearFlags.SolidColor;
            go.transform.SetPositionAndRotation(world.camera.Position(), world.camera.Rotation());
            go.tag = "MainCamera";
        }

        private void BuildLighting()
        {
            GameObject go = new GameObject("WarmAshLight");
            go.transform.SetParent(transform, false);
            Light light = go.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(1f, 0.93f, 0.82f);
            light.intensity = 1.5f;
            // Across the lanes and down, so a side-on silhouette keeps a lit and a shaded
            // face rather than reading flat.
            go.transform.rotation = Quaternion.Euler(42f, -24f, 0f);
            light.shadows = LightShadows.None;
        }

        /// <summary>
        /// A ring of ground tiles per lane, scrolling left and wrapping. The tile is 20 m
        /// along X and tiles seamlessly, so the ring only needs to be longer than the view.
        /// </summary>
        private void BuildGround()
        {
            var library = new ModelLibrary();
            GameObject root = new GameObject("Ground");
            root.transform.SetParent(transform, false);

            float tile = world.ground.tileLength;
            int count = Mathf.Max(world.ground.tileCount, 2);
            groundSpan = tile * count;
            scrollSpeed = level.scrollSpeed / world.pixelsPerMetre;

            float startX = world.despawnX;
            for (int lane = 0; lane < world.LaneCount; lane++)
            {
                for (int i = 0; i < count; i++)
                {
                    GameObject instance = library.Instantiate(
                        "env_rust_flats_ground", root.transform, $"Ground_L{lane}_{i}");
                    instance.transform.position = new Vector3(
                        startX + i * tile, world.GroundYFor(lane), world.ZFor(lane));
                    groundTiles.Add(instance.transform);
                }
            }
        }

        /// <summary>
        /// The Titan, hung together at the pivots its briefs give. The parts arrive from the
        /// FBX already at their sockets, so the chain is built from the positions that landed
        /// rather than from the briefs' numbers typed in again.
        /// </summary>
        private void BuildTitan()
        {
            var library = new ModelLibrary();
            GameObject root = new GameObject("Titan");
            root.transform.SetParent(transform, false);
            root.transform.position = new Vector3(
                world.titanX, world.GroundYFor(world.LaneCount / 2), world.ZFor(world.LaneCount / 2));
            // The models face +Z as exported; the battle runs along X with the enemy on the
            // right, so the chassis turns to face it. This is the one place that mapping
            // lives, and PlaceholderImportTests pins it.
            root.transform.rotation = Quaternion.Euler(0f, -90f, 0f);

            GameObject chassis = library.Instantiate("titan_chassis", root.transform);
            Transform torso = ModelLibrary.Part(chassis, "Titan_Torso");
            Transform thigh = ModelLibrary.Part(chassis, "Titan_Leg_Upper");
            Transform shin = ModelLibrary.Part(chassis, "Titan_Leg_Lower");
            Transform foot = ModelLibrary.Part(chassis, "Titan_Foot");

            // Two legs from the one delivered chain, mirrored across the body in depth, which
            // is the axis the briefs put the hips on.
            var legs = new Titan.LegChain[2];
            for (int i = 0; i < 2; i++)
            {
                Transform t = i == 0 ? thigh : Object.Instantiate(thigh, thigh.parent);
                Transform s = i == 0 ? shin : Object.Instantiate(shin, shin.parent);
                Transform f = i == 0 ? foot : Object.Instantiate(foot, foot.parent);
                if (i == 1)
                {
                    t.name = "Titan_Leg_Upper_B";
                    s.name = "Titan_Leg_Lower_B";
                    f.name = "Titan_Foot_B";
                    MirrorInDepth(t, torso);
                    MirrorInDepth(s, torso);
                    MirrorInDepth(f, torso);
                }
                ModelLibrary.Chain(s, f);
                ModelLibrary.Chain(t, s);
                ModelLibrary.Chain(torso, t);
                legs[i] = new Titan.LegChain { thigh = t, shin = s, foot = f, phase = i == 0 ? 1f : -1f };
            }

            GameObject cannon = library.Instantiate("titan_cannon_autocannon", torso);
            Transform housing = ModelLibrary.Part(cannon, "Autocannon_Housing");
            Transform barrel = ModelLibrary.Part(cannon, "Autocannon_Barrel");
            ModelLibrary.Chain(housing, barrel);
            // The cannon mount from the chassis brief, in the chassis's own axes.
            cannon.transform.localPosition = new Vector3(0f, 4.2f, 3.2f);

            float hull = tuning.mecha.baseHullHp;
            titan = new Titan(root.transform, torso, housing, barrel, legs, tuning, hull)
            {
                BarrelLength = ModelLibrary.WorldBounds(barrel.gameObject).size.x,
            };
        }

        /// <summary>Mirrors a part to the other side of the body, across the depth axis.</summary>
        private static void MirrorInDepth(Transform part, Transform body)
        {
            Vector3 local = body.InverseTransformPoint(part.position);
            local.x = -local.x;
            part.position = body.TransformPoint(local);
        }

        private void BuildSystems()
        {
            var library = new ModelLibrary();
            targeting = new TargetingSystem(tuning);
            damage = new DamageSystem(tuning);
            economy = new EconomySystem(level);

            GameObject shellRoot = new GameObject("Shells");
            shellRoot.transform.SetParent(transform, false);
            projectiles = new ProjectileSystem(tuning, damage, i => MakeShell(shellRoot.transform, i));
            projectiles.onHit = OnProjectileHit;

            GameObject scrapRoot = new GameObject("ScrapDrops");
            scrapRoot.transform.SetParent(transform, false);
            scrapDrops = new ScrapDrops(tuning, i =>
            {
                GameObject instance = library.Instantiate("pickup_scrap", scrapRoot.transform,
                                                          $"Scrap_{i}");
                // The asset holds three lumps; one pickup shows one of them.
                Transform[] parts = instance.GetComponentsInChildren<Transform>(true);
                int shown = 0;
                foreach (Transform t in parts)
                {
                    if (!t.name.StartsWith("Scrap_") || t == instance.transform) continue;
                    t.gameObject.SetActive(shown == i % 3);
                    shown++;
                }
                return instance.transform;
            });

            GameObject enemyRoot = new GameObject("Enemies");
            enemyRoot.transform.SetParent(transform, false);
            string enemyAsset = SingleEnemyAssetFor(level);
            spawner = new WaveSpawner(level, database, tuning,
                i => MakeEnemy(library, enemyRoot.transform, enemyAsset, i),
                OnEnemyAttack, randomSeed);
            spawner.onEscaped = _ => escaped++;

            weapon = new WeaponSystem(titan, targeting, projectiles, database.Weapon(weaponId), tuning);
            input = new BattleInput(view, tuning, world.ZFor(world.LaneCount / 2));
        }

        /// <summary>
        /// Phase 1 renders every enemy in a level with one model, so a level that mixes types
        /// is rejected rather than drawn wrongly. Phase 2 adds a model pool per asset, which
        /// is where that belongs; level-01 is a single type, which is why Phase 1 can wait.
        /// </summary>
        private static string SingleEnemyAssetFor(LevelDef level)
        {
            GameDatabase db = GameDatabase.Instance;
            string asset = null;
            foreach (WaveEntry wave in level.waves)
            {
                EnemyDef def = db.Enemy(wave.enemyId);
                if (def == null) continue;
                if (asset == null) asset = def.assetKey;
                else if (asset != def.assetKey)
                    throw new System.NotSupportedException(
                        $"{level.id} mixes enemy models ({asset} and {def.assetKey}). Phase 1 "
                        + "draws one model per level; a model pool per asset is Phase 2 work.");
            }
            return asset ?? "enemy_rustcrawler";
        }

        private Enemy MakeEnemy(ModelLibrary library, Transform parent, string assetId, int index)
        {
            GameObject root = new GameObject($"Enemy_{index}");
            root.transform.SetParent(parent, false);
            GameObject model = library.Instantiate(assetId, root.transform);
            model.transform.localRotation = Quaternion.Euler(0f, 90f, 0f);

            // The brief delivers one leg to be instanced at all six hip sockets. Its own
            // origin is the hip, so a copy placed at each socket swings correctly.
            Transform legSource = ModelLibrary.Part(model, "Rustcrawler_Leg");
            var legs = new List<Transform>();
            if (legSource != null)
            {
                float[] along = { -0.9f, 0f, 0.9f };
                foreach (float y in along)
                {
                    foreach (int side in new[] { -1, 1 })
                    {
                        Transform leg = Object.Instantiate(legSource, legSource.parent);
                        leg.localPosition = new Vector3(0.8f * side, y, 0.2f);
                        leg.localScale = new Vector3(side, 1f, 1f);
                        legs.Add(leg);
                    }
                }
                legSource.gameObject.SetActive(false);
            }

            return new Enemy(root.transform, legs.ToArray(), 0.42f, world.pixelsPerMetre);
        }

        private Transform MakeShell(Transform parent, int index)
        {
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = $"Shell_{index}";
            Object.Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localScale = Vector3.one * world.projectileRadius * 2f;
            Renderer renderer = go.GetComponent<Renderer>();
            renderer.sharedMaterial = ShellMaterial();
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            return go.transform;
        }

        private static Material shellMaterial;

        private static Material ShellMaterial()
        {
            if (shellMaterial != null) return shellMaterial;
            Shader shader = Shader.Find("Universal Render Pipeline/Unlit")
                            ?? Shader.Find("Sprites/Default");
            shellMaterial = new Material(shader) { name = "ShellTracer" };
            if (shellMaterial.HasProperty("_BaseColor"))
                shellMaterial.SetColor("_BaseColor", new Color(1f, 0.86f, 0.45f));
            return shellMaterial;
        }

        // ------------------------------------------------------------------ the loop

        private void Update()
        {
            // Hard rule 6: everything uses delta time, and a stall cannot teleport anything.
            float dt = Mathf.Min(Time.deltaTime, tuning.world.maxFrameSeconds);

            Vector3? tap = input.Update(weapon, battleOver);
            if (tap.HasValue && !battleOver)
                targeting.SetFocus(targeting.PickAt(spawner.Live, tap.Value, 1.5f));

            if (battleOver)
            {
                titan.Update(dt);
                return;
            }

            elapsed += dt;
            ScrollGround(dt);
            economy.Update(dt);
            targeting.Prune();
            spawner.Update(dt);
            weapon.Update(dt, spawner.Live);
            projectiles.Update(dt, spawner.Live);
            scrapDrops.Update(dt);
            titan.Update(dt);
            CheckOutcome();
        }

        private void ScrollGround(float dt)
        {
            float shift = scrollSpeed * dt;
            for (int i = 0; i < groundTiles.Count; i++)
            {
                Transform tile = groundTiles[i];
                Vector3 p = tile.position;
                p.x -= shift;
                if (p.x < world.despawnX) p.x += groundSpan;
                tile.position = p;
            }
        }

        private void OnEnemyAttack(Enemy enemy)
        {
            damage.ApplyToTitan(titan, enemy.DamagePerHit);
        }

        private void OnProjectileHit(Enemy enemy, DamageResult hit, Vector3 at)
        {
            if (!hit.killed) return;
            killed++;
            economy.AwardKill(enemy.ScrapReward);
            scrapDrops.Spawn(enemy.Centre);
            if (ReferenceEquals(targeting.FocusTarget, enemy)) targeting.ClearFocus();
            spawner.Remove(enemy);
        }

        private void CheckOutcome()
        {
            if (titan.IsDestroyed)
            {
                Finish(false);
                return;
            }
            if (spawner.IsTimelineComplete && spawner.AliveCount == 0) Finish(true);
        }

        private void Finish(bool won)
        {
            battleOver = true;
            weapon.Reset();
            projectiles.Clear();
            result = new BattleResult
            {
                won = won,
                scrapEarned = economy.TotalEarned,
                enemiesKilled = killed,
                enemiesEscaped = escaped,
                hullRemaining = titan.Hull,
                hullMax = titan.HullMax,
                durationSeconds = elapsed,
                stars = won ? StarsFor() : 0,
            };
        }

        /// <summary>
        /// Phase 1 scores the two stars it can: the clear itself, and the hull threshold from
        /// the level's own star block. The third star is a Phase 4 criterion.
        /// </summary>
        private int StarsFor()
        {
            int stars = 1;
            if (titan.HullFraction >= level.stars.hullThreshold) stars++;
            return stars;
        }

        public void Retry()
        {
            spawner.Clear();
            projectiles.Clear();
            scrapDrops.Clear();
            targeting.ClearFocus();
            weapon.Reset();
            killed = 0;
            escaped = 0;
            elapsed = 0f;
            battleOver = false;
            titan.Repair(titan.HullMax);
            // The same pooled enemies and the same timeline from the start, so a retry is a
            // clean run without allocating anything.
            spawner.Restart();
        }

        // ------------------------------------------------------------------ readouts

        public Titan PlayerTitan => titan;
        public EconomySystem Economy => economy;
        public WaveSpawner Spawner => spawner;
        public WeaponSystem Weapon => weapon;
        public TargetingSystem Targeting => targeting;
        public Camera View => view;
        public int Killed => killed;
        public int Escaped => escaped;
        public float Elapsed => elapsed;

        private void OnGUI() => hud?.Draw();
    }
}
