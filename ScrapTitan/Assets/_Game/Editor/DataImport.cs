using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using ScrapTitan.Data;
using UnityEditor;
using UnityEngine;

namespace ScrapTitan.Editor
{
    /// <summary>
    /// Builds the ScriptableObject assets from the JSON in src/data. src/data stays the one
    /// source of truth; everything under Assets/_Game/Data/Generated is derived and safe to
    /// delete. Existing assets are updated in place rather than recreated, so their GUIDs
    /// survive and prefab references made in later phases are not broken by a re-import.
    /// </summary>
    public static class DataImport
    {
        public const string GeneratedDir = "Assets/_Game/Data/Generated";
        public const string ResourcesDir = "Assets/_Game/Resources";
        private const string DatabasePath = ResourcesDir + "/" + GameDatabase.ResourcePath + ".asset";

        [MenuItem("Scrap Titan/Import data from src%2Fdata")]
        public static void ImportMenu()
        {
            int count = ImportAll();
            EditorUtility.DisplayDialog("Scrap Titan", $"Imported {count} assets from src/data.", "OK");
        }

        /// <summary>Entry point for the command line: unity ... --execute-method.</summary>
        public static void ImportAllFromCommandLine()
        {
            int count = ImportAll();
            Debug.Log($"[DataImport] Imported {count} assets from {RepoPaths.DataDir}.");
        }

        /// <summary>
        /// Validates every JSON file against its schema, then writes the assets.
        /// Throws before touching a single asset if anything fails to validate, so a bad
        /// edit cannot leave the project half imported.
        /// </summary>
        public static int ImportAll()
        {
            List<string> problems = DataValidation.ValidateAll();
            if (problems.Count > 0)
            {
                throw new InvalidOperationException(
                    $"src/data does not validate, so nothing was imported:{Environment.NewLine}"
                    + string.Join(Environment.NewLine, problems));
            }

            EnsureFolder(GeneratedDir);
            EnsureFolder(ResourcesDir);

            int written = 0;
            try
            {
                AssetDatabase.StartAssetEditing();

                EnemyDef[] enemies = ImportEnemies(ref written);
                WeaponDef[] weapons = ImportWeapons(ref written);
                PilotDef[] pilots = ImportPilots(ref written);
                EscortDef[] escorts = ImportEscorts(ref written);
                LevelDef[] levels = ImportLevels(ref written);
                TuningDef tuning = ImportTuning(ref written);

                GameDatabase db = LoadOrCreate<GameDatabase>(DatabasePath, ref written);
                db.enemies = enemies;
                db.weapons = weapons;
                db.pilots = pilots;
                db.escorts = escorts;
                db.levels = levels;
                db.tuning = tuning;
                db.importedFromRevision = HeadRevision();
                db.importedAtUtc = DateTime.UtcNow.ToString("u", CultureInfo.InvariantCulture);
                EditorUtility.SetDirty(db);

                RemoveStale(enemies, weapons, pilots, escorts, levels);
            }
            finally
            {
                AssetDatabase.StopAssetEditing();
            }

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            return written;
        }

        // ---------------------------------------------------------------- enemies

        private static EnemyDef[] ImportEnemies(ref int written)
        {
            JArray json = JArray.Parse(File.ReadAllText(RepoPaths.DataFile("enemies.json")));
            List<EnemyDef> all = new(json.Count);

            foreach (JObject e in json.Cast<JObject>())
            {
                string id = Str(e, "id");
                EnemyDef def = LoadOrCreate<EnemyDef>($"{GeneratedDir}/Enemies/{id}.asset", ref written);

                def.id = id;
                def.displayName = Str(e, "name");
                def.assetKey = Str(e, "spriteKey");
                def.armorClass = ParseEnum<ArmorClass>(Str(e, "armorClass"));
                def.hp = Int(e, "hp");
                def.speed = Num(e, "speed");
                def.damage = Num(e, "damage");
                def.attackInterval = Num(e, "attackInterval");
                def.reward = Int(e, "reward");
                def.scale = Num(e, "scale");
                def.flying = Bool(e, "flying", false);
                def.attackRange = Num(e, "attackRange", 0f);
                def.shieldHp = Int(e, "shieldHp", 0);
                def.behaviors = ((JArray)e["behaviors"])
                    .Select(b => ParseEnum<EnemyBehavior>(b.Value<string>()))
                    .ToArray();

                def.hasBarrier = e["barrier"] is JObject;
                if (e["barrier"] is JObject barrier)
                {
                    def.barrier = new BarrierSpec
                    {
                        radius = Num(barrier, "radius"),
                        offsetX = Num(barrier, "offsetX"),
                    };
                }

                def.hasSpawns = e["spawns"] is JObject;
                if (e["spawns"] is JObject spawns)
                {
                    def.spawns = new SpawnsSpec
                    {
                        enemyId = Str(spawns, "enemyId"),
                        count = Int(spawns, "count"),
                        interval = Num(spawns, "interval"),
                    };
                }

                def.hasBurnZone = e["burnZone"] is JObject;
                if (e["burnZone"] is JObject burn)
                {
                    def.burnZone = new BurnZoneSpec
                    {
                        damagePerSecond = Num(burn, "damagePerSecond"),
                        duration = Num(burn, "duration"),
                        radius = Num(burn, "radius"),
                        spreadX = Num(burn, "spreadX"),
                        offsetX = Num(burn, "offsetX"),
                    };
                }

                def.hasWeakPoints = e["weakPoints"] is JObject;
                if (e["weakPoints"] is JObject weak)
                {
                    def.weakPoints = new WeakPointsSpec
                    {
                        enemyId = Str(weak, "enemyId"),
                        bodyDamageFactor = Num(weak, "bodyDamageFactor"),
                        mounts = ((JArray)weak["mounts"])
                            .Cast<JObject>()
                            .Select(m => new WeakPointMount { x = Num(m, "x"), y = Num(m, "y") })
                            .ToArray(),
                    };
                }

                EditorUtility.SetDirty(def);
                all.Add(def);
            }

            return all.ToArray();
        }

        // ---------------------------------------------------------------- weapons

        private static WeaponDef[] ImportWeapons(ref int written)
        {
            JArray json = JArray.Parse(File.ReadAllText(RepoPaths.DataFile("weapons.json")));
            List<WeaponDef> all = new(json.Count);

            foreach (JObject w in json.Cast<JObject>())
            {
                string id = Str(w, "id");
                WeaponDef def = LoadOrCreate<WeaponDef>($"{GeneratedDir}/Weapons/{id}.asset", ref written);

                def.id = id;
                def.displayName = Str(w, "name");
                def.slot = ParseEnum<WeaponSlot>(Str(w, "slot"));
                def.damageType = ParseEnum<DamageType>(Str(w, "damageType"));
                def.baseDamage = Num(w, "baseDamage");
                def.fireRate = Num(w, "fireRate");

                JObject p = (JObject)w["projectile"];
                ProjectileSpec spec = new()
                {
                    kind = ParseEnum<ProjectileKind>(Str(p, "kind")),
                    speed = Num(p, "speed"),
                    aoeRadius = Num(p, "aoeRadius", 0f),
                    pellets = Int(p, "pellets", 0),
                    spreadDegrees = Num(p, "spreadDegrees", 0f),
                    hasDot = p["dot"] is JObject,
                };
                if (p["dot"] is JObject dot)
                {
                    spec.dotDps = Num(dot, "dps");
                    spec.dotDuration = Num(dot, "duration");
                }
                def.projectile = spec;

                def.upgradeTrack = ((JArray)w["upgradeTrack"])
                    .Cast<JObject>()
                    .Select(step => new WeaponUpgradeStep
                    {
                        costCores = Int(step, "costCores"),
                        damageBonus = Num(step, "damageBonus", 0f),
                        fireRateBonus = Num(step, "fireRateBonus", 0f),
                    })
                    .ToArray();

                EditorUtility.SetDirty(def);
                all.Add(def);
            }

            return all.ToArray();
        }

        // ---------------------------------------------------------------- pilots, escorts

        private static PilotDef[] ImportPilots(ref int written)
        {
            JArray json = JArray.Parse(File.ReadAllText(RepoPaths.DataFile("pilots.json")));
            List<PilotDef> all = new(json.Count);

            foreach (JObject p in json.Cast<JObject>())
            {
                string id = Str(p, "id");
                PilotDef def = LoadOrCreate<PilotDef>($"{GeneratedDir}/Pilots/{id}.asset", ref written);

                def.id = id;
                def.displayName = Str(p, "name");

                JObject ability = (JObject)p["ability"];
                def.ability = new PilotAbility
                {
                    displayName = Str(ability, "name"),
                    kind = Str(ability, "kind"),
                    cooldown = Num(ability, "cooldown"),
                    duration = Num(ability, "duration"),
                    magnitude = Num(ability, "magnitude"),
                };

                JObject passive = (JObject)p["passive"];
                def.passive = new PilotPassive
                {
                    kind = Str(passive, "kind"),
                    perLevel = Num(passive, "perLevel"),
                };

                def.levelCosts = ((JArray)p["levelCosts"]).Select(c => c.Value<int>()).ToArray();

                EditorUtility.SetDirty(def);
                all.Add(def);
            }

            return all.ToArray();
        }

        private static EscortDef[] ImportEscorts(ref int written)
        {
            JArray json = JArray.Parse(File.ReadAllText(RepoPaths.DataFile("escorts.json")));
            List<EscortDef> all = new(json.Count);

            foreach (JObject e in json.Cast<JObject>())
            {
                string id = Str(e, "id");
                EscortDef def = LoadOrCreate<EscortDef>($"{GeneratedDir}/Escorts/{id}.asset", ref written);

                def.id = id;
                def.displayName = Str(e, "name");
                def.hp = Int(e, "hp");
                def.weaponId = Str(e, "weaponId");
                def.damageScale = Num(e, "damageScale");
                def.assetKey = Str(e, "spriteKey");
                def.standoffX = Num(e, "standoffX");
                def.cost = Int(e, "cost");
                def.costGrowth = Num(e, "costGrowth");

                EditorUtility.SetDirty(def);
                all.Add(def);
            }

            return all.ToArray();
        }

        // ---------------------------------------------------------------- levels

        private static LevelDef[] ImportLevels(ref int written)
        {
            string[] files = RepoPaths.LevelFiles();
            List<LevelDef> all = new(files.Length);

            foreach (string file in files)
            {
                JObject l = JObject.Parse(File.ReadAllText(file));
                string id = Str(l, "id");
                LevelDef def = LoadOrCreate<LevelDef>($"{GeneratedDir}/Levels/{id}.asset", ref written);

                def.id = id;
                def.displayName = Str(l, "name");
                def.zone = Int(l, "zone");
                def.background = Str(l, "background");
                def.music = Str(l, "music");
                def.scrollSpeed = Num(l, "scrollSpeed");
                def.hpMultiplier = Num(l, "hpMultiplier");

                JObject economy = (JObject)l["economy"];
                def.economy = new EconomySpec
                {
                    startingScrap = Int(economy, "startingScrap"),
                    trickle = Num(economy, "trickle"),
                };

                def.stars = new StarSpec { hullThreshold = Num((JObject)l["stars"], "hullThreshold") };

                JObject rewards = (JObject)l["rewards"];
                def.rewards = new RewardSpec
                {
                    firstClearCores = Int(rewards, "firstClearCores"),
                    coresPerStar = Int(rewards, "coresPerStar"),
                };

                def.waves = ((JArray)l["waves"])
                    .Cast<JObject>()
                    .Select(w => new WaveEntry
                    {
                        time = Num(w, "time"),
                        enemyId = Str(w, "enemyId"),
                        count = Int(w, "count"),
                        interval = Num(w, "interval"),
                        hasLane = w["lane"] != null,
                        lane = Int(w, "lane", 0),
                        hasHpMultiplier = w["hpMultiplier"] != null,
                        hpMultiplier = Num(w, "hpMultiplier", 1f),
                    })
                    .ToArray();

                def.hasBoss = l["boss"] is JObject;
                if (l["boss"] is JObject boss)
                {
                    def.boss = new BossEntry
                    {
                        enemyId = Str(boss, "enemyId"),
                        time = Num(boss, "time"),
                        hpMultiplier = Num(boss, "hpMultiplier"),
                    };
                }

                EditorUtility.SetDirty(def);
                all.Add(def);
            }

            return all.ToArray();
        }

        // ---------------------------------------------------------------- tuning

        private static TuningDef ImportTuning(ref int written)
        {
            JObject t = JObject.Parse(File.ReadAllText(RepoPaths.DataFile("tuning.json")));
            TuningDef def = LoadOrCreate<TuningDef>($"{GeneratedDir}/Tuning.asset", ref written);

            JObject matrix = (JObject)t["damageMatrix"];
            def.damageMatrix = new DamageMatrix
            {
                kinetic = Armor((JObject)matrix["kinetic"]),
                chemical = Armor((JObject)matrix["chemical"]),
                piercing = Armor((JObject)matrix["piercing"]),
                explosive = Armor((JObject)matrix["explosive"]),
            };

            JObject m = (JObject)t["mecha"];
            JObject leg = (JObject)m["legArticulation"];
            def.mecha = new MechaTuning
            {
                baseHullHp = Int(m, "baseHullHp"),
                lanesY = ((JArray)m["lanesY"]).Select(v => v.Value<float>()).ToArray(),
                turretMountCount = Int(m, "turretMountCount"),
                bobAmplitude = Num(m, "bobAmplitude"),
                bobPeriod = Num(m, "bobPeriod"),
                swayAmplitude = Num(m, "swayAmplitude"),
                swayPeriod = Num(m, "swayPeriod"),
                turretMountOffsets = ((JArray)m["turretMountOffsets"])
                    .Cast<JArray>()
                    .Select(pair => new Vector2(pair[0].Value<float>(), pair[1].Value<float>()))
                    .ToArray(),
                walkPeriod = Num(m, "walkPeriod"),
                walkBob = Num(m, "walkBob"),
                walkPitch = Num(m, "walkPitch"),
                legsFaceLeft = Bool(m, "legsFaceLeft", true),
                legArticulation = new LegArticulation
                {
                    hipFraction = Num(leg, "hipFraction"),
                    gapFraction = Num(leg, "gapFraction"),
                    overlapFraction = Num(leg, "overlapFraction"),
                    swingDegrees = Num(leg, "swingDegrees"),
                    liftPixels = Num(leg, "liftPixels"),
                },
            };

            JObject w = (JObject)t["world"];
            JObject parallax = (JObject)w["parallax"];
            JObject sizes = (JObject)w["enemyBaseSize"];
            def.world = new WorldTuning
            {
                baseWidth = Num(w, "baseWidth"),
                baseHeight = Num(w, "baseHeight"),
                mechaXFraction = Num(w, "mechaXFraction"),
                spawnXFraction = Num(w, "spawnXFraction"),
                despawnXFraction = Num(w, "despawnXFraction"),
                meleeStandoff = Num(w, "meleeStandoff"),
                projectileRadius = Num(w, "projectileRadius"),
                projectileLifetime = Num(w, "projectileLifetime"),
                parallax = new ParallaxTuning
                {
                    sky = Num(parallax, "sky"),
                    ruins = Num(parallax, "ruins"),
                    ground = Num(parallax, "ground"),
                },
                maxFrameSeconds = Num(w, "maxFrameSeconds"),
                burrowSpawnXFraction = Num(w, "burrowSpawnXFraction"),
                flyingYOffset = Num(w, "flyingYOffset"),
                hitscanRangeFactor = Num(w, "hitscanRangeFactor"),
                // Ordered to match the ArmorClass enum so BaseSizeFor can index straight in.
                enemyBaseSize = Enum.GetNames(typeof(ArmorClass))
                    .Select(n => (JObject)sizes[n.ToLowerInvariant()])
                    .Select(s => new EnemySize { width = Num(s, "width"), height = Num(s, "height") })
                    .ToArray(),
            };

            JObject up = (JObject)t["inBattleUpgrades"];
            def.inBattleUpgrades = new InBattleUpgradeTuning
            {
                damage = Cost((JObject)up["damage"]),
                fireRate = Cost((JObject)up["fireRate"]),
                repair = Cost((JObject)up["repair"]),
            };

            JObject v = (JObject)t["vfx"];
            def.vfx = new VfxTuning
            {
                maxParticlesDesktop = Int(v, "maxParticlesDesktop"),
                maxParticlesMobile = Int(v, "maxParticlesMobile"),
                shakeMaxIntensity = Num(v, "shakeMaxIntensity"),
                damageNumberPoolSize = Int(v, "damageNumberPoolSize"),
                scrapPickupRiseSpeed = Num(v, "scrapPickupRiseSpeed"),
                scrapPickupLifetime = Num(v, "scrapPickupLifetime"),
                hitFlashDuration = Num(v, "hitFlashDuration"),
                hitFlashCooldown = Num(v, "hitFlashCooldown"),
                hitFlashTint = Int(v, "hitFlashTint"),
                damageNumberRise = Num(v, "damageNumberRise"),
                damageNumberLifetime = Num(v, "damageNumberLifetime"),
                muzzleFlashDuration = Num(v, "muzzleFlashDuration"),
                shakePerDamage = Num(v, "shakePerDamage"),
                shakeDurationMs = Num(v, "shakeDurationMs"),
                impactParticleCount = Int(v, "impactParticleCount"),
                deathParticleCount = Int(v, "deathParticleCount"),
                exhaustSmokeFrequency = Num(v, "exhaustSmokeFrequency"),
                cannonRecoilPixels = Num(v, "cannonRecoilPixels"),
                turretRecoilPixels = Num(v, "turretRecoilPixels"),
                recoilRecovery = Num(v, "recoilRecovery"),
                muzzleFlashPoolSize = Int(v, "muzzleFlashPoolSize"),
            };

            JObject pools = (JObject)t["pools"];
            def.pools = new PoolTuning
            {
                projectiles = Int(pools, "projectiles"),
                enemies = Int(pools, "enemies"),
                scrapPickups = Int(pools, "scrapPickups"),
            };

            JObject tg = (JObject)t["targeting"];
            def.targeting = new TargetingTuning
            {
                priorityOrder = ((JArray)tg["priorityOrder"]).Select(s => s.Value<string>()).ToArray(),
                manualShotDamageMultiplier = Num(tg, "manualShotDamageMultiplier"),
                autoFireResumeDelay = Num(tg, "autoFireResumeDelay"),
                manualDragThreshold = Num(tg, "manualDragThreshold"),
                touchDragOriginMinYFraction = Num(tg, "touchDragOriginMinYFraction"),
                touchAimOffsetY = Num(tg, "touchAimOffsetY"),
            };

            JObject b = (JObject)t["boss"];
            JObject bd = (JObject)b["default"];
            def.boss = new BossTuning
            {
                defaults = new BossDefaults
                {
                    phase2HpFraction = Num(bd, "phase2HpFraction"),
                    chargeSpeedMultiplier = Num(bd, "chargeSpeedMultiplier"),
                    chargeDuration = Num(bd, "chargeDuration"),
                    chargeCooldown = Num(bd, "chargeCooldown"),
                    entranceShakeIntensity = Num(bd, "entranceShakeIntensity"),
                    slamShakeIntensity = Num(bd, "slamShakeIntensity"),
                },
                byId = ((JObject)b["byId"]).Properties().Select(prop =>
                {
                    JObject o = (JObject)prop.Value;
                    return new BossOverride
                    {
                        enemyId = prop.Name,
                        kind = ParseEnum<BossKind>(Str(o, "kind")),
                        shieldUpDuration = Num(o, "shieldUpDuration", 0f),
                        ventDuration = Num(o, "ventDuration", 0f),
                        enrageThresholds = o["enrageThresholds"] is JArray th
                            ? th.Select(x => x.Value<float>()).ToArray()
                            : Array.Empty<float>(),
                        enrageSpeedBonus = Num(o, "enrageSpeedBonus", 0f),
                        enrageDamageBonus = Num(o, "enrageDamageBonus", 0f),
                    };
                }).ToArray(),
            };

            JObject a = (JObject)t["audio"];
            def.audio = new AudioTuning
            {
                masterVolume = Num(a, "masterVolume"),
                sfxVolume = Num(a, "sfxVolume"),
                musicVolume = Num(a, "musicVolume"),
            };

            def.combat = new CombatTuning
            {
                shieldNonPiercingFactor = Num((JObject)t["combat"], "shieldNonPiercingFactor"),
            };

            JObject meta = (JObject)t["meta"];
            JObject hull = (JObject)meta["hullUpgrade"];
            def.meta = new MetaTuning
            {
                startingWeapons = ((JArray)meta["startingWeapons"]).Select(s => s.Value<string>()).ToArray(),
                weaponUnlockCosts = ((JObject)meta["weaponUnlockCosts"]).Properties()
                    .Select(p => new NamedCost { id = p.Name, costCores = p.Value.Value<int>() })
                    .ToArray(),
                turretMountCosts = ((JArray)meta["turretMountCosts"]).Select(c => c.Value<int>()).ToArray(),
                hullUpgrade = new HullUpgradeTuning
                {
                    costs = ((JArray)hull["costs"]).Select(c => c.Value<int>()).ToArray(),
                    bonusPerLevel = Num(hull, "bonusPerLevel"),
                },
                zoneNames = ((JObject)meta["zoneNames"]).Properties()
                    .Select(p => new ZoneName
                    {
                        zone = int.Parse(p.Name, CultureInfo.InvariantCulture),
                        displayName = p.Value.Value<string>(),
                    })
                    .ToArray(),
            };

            JObject tut = (JObject)t["tutorial"];
            def.tutorial = new TutorialTuning
            {
                levelId = Str(tut, "levelId"),
                steps = ((JArray)tut["steps"]).Cast<JObject>()
                    .Select(s => new TutorialStep
                    {
                        at = Num(s, "at"),
                        duration = Num(s, "duration"),
                        text = Str(s, "text"),
                    })
                    .ToArray(),
            };

            JObject en = (JObject)t["endless"];
            def.endless = new EndlessTuning
            {
                firstWaveAt = Num(en, "firstWaveAt"),
                waveInterval = Num(en, "waveInterval"),
                waveCount = Int(en, "waveCount"),
                hpGrowth = Num(en, "hpGrowth"),
                countGrowth = Num(en, "countGrowth"),
                maxCount = Int(en, "maxCount"),
                eliteEvery = Int(en, "eliteEvery"),
                coresPerNewWave = Int(en, "coresPerNewWave"),
                unlockAfterLevel = Str(en, "unlockAfterLevel"),
                tiers = ((JArray)en["tiers"]).Cast<JObject>()
                    .Select(tier => new EndlessTier
                    {
                        fromWave = Int(tier, "fromWave"),
                        enemies = ((JArray)tier["enemies"]).Select(s => s.Value<string>()).ToArray(),
                    })
                    .ToArray(),
                elites = ((JArray)en["elites"]).Select(s => s.Value<string>()).ToArray(),
            };

            EditorUtility.SetDirty(def);
            return def;
        }

        private static ArmorMultipliers Armor(JObject o) => new()
        {
            light = Num(o, "light"),
            armored = Num(o, "armored"),
            shielded = Num(o, "shielded"),
            swarm = Num(o, "swarm"),
        };

        private static UpgradeCost Cost(JObject o) => new()
        {
            baseCost = Num(o, "baseCost"),
            costGrowth = Num(o, "costGrowth"),
            bonusPerLevel = Num(o, "bonusPerLevel", 0f),
            healFraction = Num(o, "healFraction", 0f),
        };

        // ---------------------------------------------------------------- plumbing

        private static T LoadOrCreate<T>(string path, ref int written) where T : ScriptableObject
        {
            EnsureFolder(Path.GetDirectoryName(path).Replace('\\', '/'));
            T asset = AssetDatabase.LoadAssetAtPath<T>(path);
            if (asset == null)
            {
                asset = ScriptableObject.CreateInstance<T>();
                AssetDatabase.CreateAsset(asset, path);
            }
            written++;
            return asset;
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            string leaf = Path.GetFileName(path);
            if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, leaf);
        }

        /// <summary>
        /// Deletes generated assets whose id has gone from the JSON, so removing an enemy from
        /// src/data removes it from the project too rather than leaving a ghost behind.
        /// </summary>
        private static void RemoveStale(EnemyDef[] enemies, WeaponDef[] weapons, PilotDef[] pilots,
                                       EscortDef[] escorts, LevelDef[] levels)
        {
            HashSet<string> keep = new(StringComparer.Ordinal) { $"{GeneratedDir}/Tuning.asset" };
            foreach (EnemyDef e in enemies) keep.Add($"{GeneratedDir}/Enemies/{e.id}.asset");
            foreach (WeaponDef w in weapons) keep.Add($"{GeneratedDir}/Weapons/{w.id}.asset");
            foreach (PilotDef p in pilots) keep.Add($"{GeneratedDir}/Pilots/{p.id}.asset");
            foreach (EscortDef e in escorts) keep.Add($"{GeneratedDir}/Escorts/{e.id}.asset");
            foreach (LevelDef l in levels) keep.Add($"{GeneratedDir}/Levels/{l.id}.asset");

            foreach (string guid in AssetDatabase.FindAssets("", new[] { GeneratedDir }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                if (AssetDatabase.IsValidFolder(path)) continue;
                if (!keep.Contains(path))
                {
                    Debug.Log($"[DataImport] Removing {path}: no longer in src/data.");
                    AssetDatabase.DeleteAsset(path);
                }
            }
        }

        /// <summary>
        /// The commit src/data was read at, recorded on the database so an APK can be traced
        /// back to its content. Read from .git rather than by running git, so it works
        /// wherever the editor runs.
        /// </summary>
        private static string HeadRevision()
        {
            try
            {
                string gitDir = Path.Combine(RepoPaths.RepoRoot, ".git");
                string head = File.ReadAllText(Path.Combine(gitDir, "HEAD")).Trim();
                if (!head.StartsWith("ref:", StringComparison.Ordinal)) return head;

                string refName = head.Substring(4).Trim();
                string refPath = Path.Combine(gitDir, refName.Replace('/', Path.DirectorySeparatorChar));
                if (File.Exists(refPath)) return File.ReadAllText(refPath).Trim();

                foreach (string line in File.ReadAllLines(Path.Combine(gitDir, "packed-refs")))
                {
                    if (line.EndsWith(" " + refName, StringComparison.Ordinal))
                        return line.Split(' ')[0];
                }
                return "unknown";
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[DataImport] Could not read the git revision: {e.Message}");
                return "unknown";
            }
        }

        private static string Str(JObject o, string key) => o[key]?.Value<string>()
            ?? throw new InvalidOperationException($"'{key}' is missing. Validation should have caught this.");

        private static float Num(JObject o, string key) => o[key]?.Value<float>()
            ?? throw new InvalidOperationException($"'{key}' is missing. Validation should have caught this.");

        private static float Num(JObject o, string key, float fallback) => o[key]?.Value<float>() ?? fallback;

        private static int Int(JObject o, string key) => o[key]?.Value<int>()
            ?? throw new InvalidOperationException($"'{key}' is missing. Validation should have caught this.");

        private static int Int(JObject o, string key, int fallback) => o[key]?.Value<int>() ?? fallback;

        private static bool Bool(JObject o, string key, bool fallback) => o[key]?.Value<bool>() ?? fallback;

        /// <summary>snake_case in the JSON to PascalCase in C#: "shield_cycler" to ShieldCycler.</summary>
        private static T ParseEnum<T>(string jsonValue) where T : struct, Enum
        {
            string pascal = jsonValue.Replace("_", string.Empty);
            if (Enum.TryParse(pascal, ignoreCase: true, out T parsed)) return parsed;
            throw new InvalidOperationException(
                $"'{jsonValue}' is not a {typeof(T).Name}. Known: {string.Join(", ", Enum.GetNames(typeof(T)))}");
        }
    }
}
