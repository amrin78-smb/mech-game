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

        private void Awake() => Build();

        /// <summary>
        /// Builds the whole battle from the data. Public and separate from Awake so the
        /// editor can stand a battle up outside play mode and render frames of it: the model
        /// rules say a model is judged from frames of the running game, and this is what
        /// produces them without an APK and a phone in hand.
        /// </summary>
        public void Build()
        {
            database = GameDatabase.Instance;
            tuning = database.tuning;
            world = tuning.world3d;
            level = string.IsNullOrEmpty(levelId) ? database.levels[0] : database.Level(levelId);

            BuildCamera();
            BuildLighting();
            BuildGround();
            BuildBackground();
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
                    // Brief 28 puts the broken cliff lip on the model's front, which the
                    // import faces +Z, away from the camera. Turn it round so it shows.
                    instance.transform.rotation = Quaternion.Euler(0f, 180f, 0f);
                    groundTiles.Add(instance.transform);
                }
            }
        }

        /// <summary>
        /// The two background layers the plan asks Phase 1 for: a nearer band of ruins and a
        /// far ridge line, each scrolling at its own rate from tuning.world.parallax, so the
        /// world reads as moving past the Titan rather than the Titan as sliding along it.
        ///
        /// Grey-box on purpose. Brief 29 holds the real Rust Flats ruins and that is Phase 2
        /// work; what matters now is that the depth cue is there for the owner to judge.
        /// </summary>
        private void BuildBackground()
        {
            GameObject root = new GameObject("Background");
            root.transform.SetParent(transform, false);

            // Behind the farthest lane, so nothing in the fight can ever be hidden by them.
            float behind = world.ZFor(0) + world.ground.tileDepth;
            backdropSpan = (world.spawnX - world.despawnX) * 2f;
            BuildBackdropLayer(root.transform, "Ruins", behind + 12f, tuning.world.parallax.ruins,
                               new Color(0.30f, 0.22f, 0.19f), 5f, 12f, 3f, 9f, 731);
            BuildBackdropLayer(root.transform, "Ridge", behind + 46f, tuning.world.parallax.sky,
                               new Color(0.44f, 0.35f, 0.30f), 10f, 20f, 10f, 26f, 977);
        }

        private readonly List<Transform> backdrop = new();
        private readonly List<float> backdropSpeed = new();
        private float backdropSpan;

        private void BuildBackdropLayer(Transform parent, string name, float z, float parallax,
                                        Color colour, float minHeight, float maxHeight,
                                        float minWidth, float maxWidth, int seed)
        {
            GameObject layer = new GameObject(name);
            layer.transform.SetParent(parent, false);
            Material material = FlatMaterial(name, colour);
            var random = new System.Random(seed);

            float x = world.despawnX;
            float until = world.despawnX + backdropSpan;
            while (x < until)
            {
                float width = Mathf.Lerp(minWidth, maxWidth, (float)random.NextDouble());
                float height = Mathf.Lerp(minHeight, maxHeight, (float)random.NextDouble());
                GameObject block = GameObject.CreatePrimitive(PrimitiveType.Cube);
                block.name = $"{name}_{backdrop.Count}";
                DestroyNow(block.GetComponent<Collider>());
                block.transform.SetParent(layer.transform, false);
                block.transform.position = new Vector3(x + width * 0.5f, height * 0.5f, z);
                block.transform.localScale = new Vector3(width, height, 2f);
                Renderer renderer = block.GetComponent<Renderer>();
                renderer.sharedMaterial = material;
                renderer.shadowCastingMode = ShadowCastingMode.Off;
                backdrop.Add(block.transform);
                backdropSpeed.Add(parallax);
                x += width + Mathf.Lerp(1f, 6f, (float)random.NextDouble());
            }
        }

        /// <summary>
        /// The battle is also stood up outside play mode, to render frames of it, and Destroy
        /// does nothing there.
        /// </summary>
        private static void DestroyNow(Object victim)
        {
            if (Application.isPlaying) Destroy(victim);
            else DestroyImmediate(victim);
        }

        private static readonly Dictionary<string, Material> flatMaterials = new();

        private static Material FlatMaterial(string name, Color colour)
        {
            if (flatMaterials.TryGetValue(name, out Material cached) && cached != null)
                return cached;
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var material = new Material(shader) { name = name };
            if (material.HasProperty("_BaseColor")) material.SetColor("_BaseColor", colour);
            if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", 0.08f);
            flatMaterials[name] = material;
            return material;
        }

        /// <summary>
        /// The Titan, hung together at the pivots its briefs give.
        ///
        /// Three things here are measured rather than assumed, because each was wrong first
        /// time and the frames in Logs/frames are what showed it:
        /// the second leg is cloned from the flat parts before anything is chained, or the
        /// clone carries a copy of whatever is already hanging beneath it; the mirror and the
        /// cannon mount are both expressed in the chassis root's frame, because each imported
        /// part carries a rotation of its own and measuring through one of them turns the
        /// axes; and the whole Titan is then lifted so its soles rest on the lane, rather
        /// than its hips being put at ground level and the legs buried.
        /// </summary>
        private void BuildTitan()
        {
            var library = new ModelLibrary();
            GameObject root = new GameObject("Titan");
            root.transform.SetParent(transform, false);
            int lane = world.LaneCount / 2;
            root.transform.position = new Vector3(world.titanX, world.GroundYFor(lane),
                                                  world.ZFor(lane));
            // Measured from the import (Logs/model-layout.txt, pinned by ModelImportTests):
            // a model arrives with its width on X, its height on Y, and the front its brief
            // puts on -Y facing +Z. The battle runs along X with the raiders on the right.
            root.transform.rotation = Quaternion.Euler(0f, ModelFront.ToPlusX, 0f);

            GameObject chassis = library.Instantiate("titan_chassis", root.transform);
            Transform frame = chassis.transform;
            Transform torso = ModelLibrary.Part(chassis, "Titan_Torso");

            var legs = new Titan.LegChain[2];
            Transform[] flat =
            {
                ModelLibrary.Part(chassis, "Titan_Leg_Upper"),
                ModelLibrary.Part(chassis, "Titan_Leg_Lower"),
                ModelLibrary.Part(chassis, "Titan_Foot"),
            };
            Transform[] mirrored =
            {
                Object.Instantiate(flat[0], flat[0].parent),
                Object.Instantiate(flat[1], flat[1].parent),
                Object.Instantiate(flat[2], flat[2].parent),
            };
            for (int i = 0; i < mirrored.Length; i++)
            {
                mirrored[i].name = flat[i].name + "_B";
                MirrorAcrossBody(mirrored[i], frame);
            }

            for (int i = 0; i < 2; i++)
            {
                Transform[] leg = i == 0 ? flat : mirrored;
                ModelLibrary.Chain(leg[1], leg[2]);
                ModelLibrary.Chain(leg[0], leg[1]);
                ModelLibrary.Chain(torso, leg[0]);
                legs[i] = new Titan.LegChain
                {
                    thigh = leg[0], shin = leg[1], foot = leg[2], phase = i == 0 ? 1f : -1f,
                };
            }

            // A mount in the chassis's own frame, so the cannon is not turned by whatever
            // rotation the torso's import carries. Brief 01 puts the main cannon's collar
            // 4.2 m above the hip axle and 3.2 m forward.
            Transform mount = new GameObject("CannonMount").transform;
            mount.SetParent(torso, false);
            mount.SetPositionAndRotation(frame.TransformPoint(new Vector3(0f, 4.2f, 3.2f)),
                                         frame.rotation);

            GameObject cannon = library.Instantiate("titan_cannon_autocannon", mount);
            Transform housing = ModelLibrary.Part(cannon, "Autocannon_Housing");
            Transform barrel = ModelLibrary.Part(cannon, "Autocannon_Barrel");
            ModelLibrary.Chain(housing, barrel);

            // Stand it on the ground: the chassis is modelled from the hip, so its soles are
            // 7.7 m below the root until it is lifted.
            float lowest = ModelLibrary.WorldBounds(chassis).min.y;
            root.transform.position += Vector3.up * (world.GroundYFor(lane) - lowest);

            float hull = tuning.mecha.baseHullHp;
            titan = new Titan(root.transform, torso, housing, barrel, legs, tuning, hull)
            {
                // The barrel's longest axis, whichever way it is currently turned.
                BarrelLength = Longest(ModelLibrary.WorldBounds(barrel.gameObject).size),
                // Which way the barrel points, in its parent's space, so recoil slides it
                // back along itself rather than along a guessed axis.
                BarrelAxis = housing.InverseTransformDirection(barrel.forward),
            };
        }

        /// <summary>
        /// Mirrors a part to the other side of the body. A model's width is on its local X,
        /// which is where brief 01 puts the hips at 2.20 m, so that is the axis to negate.
        /// Once the Titan is turned to face +X this reads on screen as depth.
        /// </summary>
        private static void MirrorAcrossBody(Transform part, Transform frame)
        {
            Vector3 local = frame.InverseTransformPoint(part.position);
            local.x = -local.x;
            part.position = frame.TransformPoint(local);
        }

        private static float Longest(Vector3 size) =>
            Mathf.Max(size.x, Mathf.Max(size.y, size.z));

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
            input = new BattleInput(view, tuning, world.ZFor(world.LaneCount / 2), ResolveAim);
        }

        /// <summary>
        /// What a screen point means as something to shoot at.
        ///
        /// The nearest enemy the camera ray passes through, so a drag aimed at a raider in
        /// any lane hits that raider. With nothing under the ray it falls back to a point on
        /// the Titan's own lane, which is what a drag at empty ground should do.
        /// </summary>
        private Vector3 ResolveAim(Vector2 screen)
        {
            Ray ray = input.RayThrough(screen);
            Enemy best = null;
            float bestAlong = float.PositiveInfinity;

            for (int i = 0; i < spawner.Live.Count; i++)
            {
                Enemy enemy = spawner.Live[i];
                if (!enemy.IsAlive) continue;
                Vector3 toCentre = enemy.Centre - ray.origin;
                float along = Vector3.Dot(toCentre, ray.direction);
                if (along <= 0f) continue;
                float offAxis = (toCentre - ray.direction * along).magnitude;
                // A little slack, because a finger is not a cursor.
                if (offAxis > enemy.Radius + 1.2f || along >= bestAlong) continue;
                bestAlong = along;
                best = enemy;
            }

            return best != null ? best.Centre : input.WorldPoint(screen);
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
            // Raiders close on the Titan, so their front turns to -X.
            model.transform.localRotation = Quaternion.Euler(0f, ModelFront.ToMinusX, 0f);

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
            // The battle is also stood up outside play mode, to render frames of it, and
            // Destroy does nothing there.
            DestroyNow(go.GetComponent<Collider>());
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
            Tick(Mathf.Min(Time.deltaTime, tuning.world.maxFrameSeconds), readInput: true);
        }

        /// <summary>One step of the battle. `readInput` is false when the editor drives it.</summary>
        public void Tick(float dt, bool readInput = true)
        {
            Vector3? tap = readInput ? input.Update(weapon, battleOver) : null;
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
            for (int i = 0; i < backdrop.Count; i++)
            {
                Vector3 p = backdrop[i].position;
                p.x -= shift * backdropSpeed[i];
                if (p.x < world.despawnX) p.x += backdropSpan;
                backdrop[i].position = p;
            }
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
