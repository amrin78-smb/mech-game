using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using ScrapTitan.Data;
using ScrapTitan.Editor;
using UnityEditor;

namespace ScrapTitan.Tests
{
    /// <summary>
    /// Compares the committed ScriptableObjects against src/data field by field.
    ///
    /// This is deliberately checking the assets that are in the project, not assets imported
    /// during the test. That makes it catch the mistake that actually happens: somebody edits
    /// the JSON, forgets to re-import, and the APK ships yesterday's numbers.
    /// </summary>
    public sealed class DataImportTests
    {
        private const string DatabasePath = "Assets/_Game/Resources/ScrapTitanDatabase.asset";
        private const float Tolerance = 1e-4f;

        private GameDatabase db;

        [SetUp]
        public void LoadDatabase()
        {
            db = AssetDatabase.LoadAssetAtPath<GameDatabase>(DatabasePath);
            Assert.That(db, Is.Not.Null,
                        $"No database at {DatabasePath}. Run: Scrap Titan > Import data from src/data.");
        }

        private static JArray Json(string file) => JArray.Parse(File.ReadAllText(RepoPaths.DataFile(file)));

        [Test]
        public void TheDatabaseHoldsEveryDefinitionAndNoBlanks()
        {
            Assert.That(db.enemies, Has.Length.EqualTo(Json("enemies.json").Count), "enemy count");
            Assert.That(db.weapons, Has.Length.EqualTo(Json("weapons.json").Count), "weapon count");
            Assert.That(db.pilots, Has.Length.EqualTo(Json("pilots.json").Count), "pilot count");
            Assert.That(db.escorts, Has.Length.EqualTo(Json("escorts.json").Count), "escort count");
            Assert.That(db.levels, Has.Length.EqualTo(RepoPaths.LevelFiles().Length), "level count");
            Assert.That(db.tuning, Is.Not.Null, "tuning");

            // A missing asset serialises as null, which would otherwise only show as a
            // NullReferenceException deep in a later phase.
            Assert.That(db.enemies, Is.All.Not.Null);
            Assert.That(db.weapons, Is.All.Not.Null);
            Assert.That(db.pilots, Is.All.Not.Null);
            Assert.That(db.escorts, Is.All.Not.Null);
            Assert.That(db.levels, Is.All.Not.Null);
        }

        [Test]
        public void EveryEnemyMatchesItsJson()
        {
            foreach (JObject e in Json("enemies.json").Cast<JObject>())
            {
                string id = e["id"].Value<string>();
                EnemyDef def = db.enemies.FirstOrDefault(x => x.id == id);
                Assert.That(def, Is.Not.Null, $"no imported enemy '{id}'");

                Assert.That(def.displayName, Is.EqualTo(e["name"].Value<string>()), $"{id} name");
                Assert.That(def.assetKey, Is.EqualTo(e["spriteKey"].Value<string>()), $"{id} assetKey");
                Assert.That(def.armorClass.ToString().ToLowerInvariant(),
                            Is.EqualTo(e["armorClass"].Value<string>()), $"{id} armorClass");
                Assert.That(def.hp, Is.EqualTo(e["hp"].Value<int>()), $"{id} hp");
                Assert.That(def.speed, Is.EqualTo(e["speed"].Value<float>()).Within(Tolerance), $"{id} speed");
                Assert.That(def.damage, Is.EqualTo(e["damage"].Value<float>()).Within(Tolerance), $"{id} damage");
                Assert.That(def.attackInterval, Is.EqualTo(e["attackInterval"].Value<float>()).Within(Tolerance),
                            $"{id} attackInterval");
                Assert.That(def.reward, Is.EqualTo(e["reward"].Value<int>()), $"{id} reward");
                Assert.That(def.scale, Is.EqualTo(e["scale"].Value<float>()).Within(Tolerance), $"{id} scale");
                Assert.That(def.flying, Is.EqualTo(e["flying"]?.Value<bool>() ?? false), $"{id} flying");
                Assert.That(def.attackRange, Is.EqualTo(e["attackRange"]?.Value<float>() ?? 0f).Within(Tolerance),
                            $"{id} attackRange");
                Assert.That(def.shieldHp, Is.EqualTo(e["shieldHp"]?.Value<int>() ?? 0), $"{id} shieldHp");

                string[] expected = ((JArray)e["behaviors"]).Select(b => b.Value<string>()).ToArray();
                string[] actual = def.behaviors.Select(b => b.ToString().ToLowerInvariant()).ToArray();
                Assert.That(actual, Is.EqualTo(expected), $"{id} behaviors");

                Assert.That(def.hasBarrier, Is.EqualTo(e["barrier"] != null), $"{id} hasBarrier");
                if (e["barrier"] is JObject barrier)
                {
                    Assert.That(def.barrier.radius, Is.EqualTo(barrier["radius"].Value<float>()).Within(Tolerance));
                    Assert.That(def.barrier.offsetX, Is.EqualTo(barrier["offsetX"].Value<float>()).Within(Tolerance));
                }

                Assert.That(def.hasSpawns, Is.EqualTo(e["spawns"] != null), $"{id} hasSpawns");
                if (e["spawns"] is JObject spawns)
                {
                    Assert.That(def.spawns.enemyId, Is.EqualTo(spawns["enemyId"].Value<string>()));
                    Assert.That(def.spawns.count, Is.EqualTo(spawns["count"].Value<int>()));
                    Assert.That(def.spawns.interval, Is.EqualTo(spawns["interval"].Value<float>()).Within(Tolerance));
                }

                Assert.That(def.hasBurnZone, Is.EqualTo(e["burnZone"] != null), $"{id} hasBurnZone");
                if (e["burnZone"] is JObject burn)
                {
                    Assert.That(def.burnZone.damagePerSecond,
                                Is.EqualTo(burn["damagePerSecond"].Value<float>()).Within(Tolerance));
                    Assert.That(def.burnZone.duration, Is.EqualTo(burn["duration"].Value<float>()).Within(Tolerance));
                    Assert.That(def.burnZone.radius, Is.EqualTo(burn["radius"].Value<float>()).Within(Tolerance));
                    Assert.That(def.burnZone.spreadX, Is.EqualTo(burn["spreadX"].Value<float>()).Within(Tolerance));
                    Assert.That(def.burnZone.offsetX, Is.EqualTo(burn["offsetX"].Value<float>()).Within(Tolerance));
                }

                Assert.That(def.hasWeakPoints, Is.EqualTo(e["weakPoints"] != null), $"{id} hasWeakPoints");
                if (e["weakPoints"] is JObject weak)
                {
                    Assert.That(def.weakPoints.enemyId, Is.EqualTo(weak["enemyId"].Value<string>()));
                    Assert.That(def.weakPoints.bodyDamageFactor,
                                Is.EqualTo(weak["bodyDamageFactor"].Value<float>()).Within(Tolerance));
                    JArray mounts = (JArray)weak["mounts"];
                    Assert.That(def.weakPoints.mounts, Has.Length.EqualTo(mounts.Count), $"{id} mount count");
                    for (int i = 0; i < mounts.Count; i++)
                    {
                        Assert.That(def.weakPoints.mounts[i].x,
                                    Is.EqualTo(mounts[i]["x"].Value<float>()).Within(Tolerance));
                        Assert.That(def.weakPoints.mounts[i].y,
                                    Is.EqualTo(mounts[i]["y"].Value<float>()).Within(Tolerance));
                    }
                }
            }
        }

        [Test]
        public void EveryWeaponMatchesItsJson()
        {
            foreach (JObject w in Json("weapons.json").Cast<JObject>())
            {
                string id = w["id"].Value<string>();
                WeaponDef def = db.weapons.FirstOrDefault(x => x.id == id);
                Assert.That(def, Is.Not.Null, $"no imported weapon '{id}'");

                Assert.That(def.displayName, Is.EqualTo(w["name"].Value<string>()), $"{id} name");
                Assert.That(def.slot.ToString().ToLowerInvariant(), Is.EqualTo(w["slot"].Value<string>()), $"{id} slot");
                Assert.That(def.damageType.ToString().ToLowerInvariant(),
                            Is.EqualTo(w["damageType"].Value<string>()), $"{id} damageType");
                Assert.That(def.baseDamage, Is.EqualTo(w["baseDamage"].Value<float>()).Within(Tolerance),
                            $"{id} baseDamage");
                Assert.That(def.fireRate, Is.EqualTo(w["fireRate"].Value<float>()).Within(Tolerance), $"{id} fireRate");

                JObject p = (JObject)w["projectile"];
                Assert.That(def.projectile.kind.ToString().ToLowerInvariant(),
                            Is.EqualTo(p["kind"].Value<string>()), $"{id} projectile kind");
                Assert.That(def.projectile.speed, Is.EqualTo(p["speed"].Value<float>()).Within(Tolerance));
                Assert.That(def.projectile.aoeRadius,
                            Is.EqualTo(p["aoeRadius"]?.Value<float>() ?? 0f).Within(Tolerance));
                Assert.That(def.projectile.pellets, Is.EqualTo(p["pellets"]?.Value<int>() ?? 0));
                Assert.That(def.projectile.spreadDegrees,
                            Is.EqualTo(p["spreadDegrees"]?.Value<float>() ?? 0f).Within(Tolerance));
                Assert.That(def.projectile.hasDot, Is.EqualTo(p["dot"] != null), $"{id} hasDot");
                if (p["dot"] is JObject dot)
                {
                    Assert.That(def.projectile.dotDps, Is.EqualTo(dot["dps"].Value<float>()).Within(Tolerance));
                    Assert.That(def.projectile.dotDuration,
                                Is.EqualTo(dot["duration"].Value<float>()).Within(Tolerance));
                }

                JArray track = (JArray)w["upgradeTrack"];
                Assert.That(def.upgradeTrack, Has.Length.EqualTo(track.Count), $"{id} upgradeTrack length");
                for (int i = 0; i < track.Count; i++)
                {
                    JObject step = (JObject)track[i];
                    Assert.That(def.upgradeTrack[i].costCores, Is.EqualTo(step["costCores"].Value<int>()));
                    Assert.That(def.upgradeTrack[i].damageBonus,
                                Is.EqualTo(step["damageBonus"]?.Value<float>() ?? 0f).Within(Tolerance));
                    Assert.That(def.upgradeTrack[i].fireRateBonus,
                                Is.EqualTo(step["fireRateBonus"]?.Value<float>() ?? 0f).Within(Tolerance));
                }
            }
        }

        [Test]
        public void EveryLevelMatchesItsJsonAndTheyAreInOrder()
        {
            string[] files = RepoPaths.LevelFiles();

            for (int i = 0; i < files.Length; i++)
            {
                JObject l = JObject.Parse(File.ReadAllText(files[i]));
                string id = l["id"].Value<string>();

                Assert.That(db.levels[i].id, Is.EqualTo(id), $"level {i} is out of order");
                LevelDef def = db.levels[i];

                Assert.That(def.displayName, Is.EqualTo(l["name"].Value<string>()), $"{id} name");
                Assert.That(def.zone, Is.EqualTo(l["zone"].Value<int>()), $"{id} zone");
                Assert.That(def.background, Is.EqualTo(l["background"].Value<string>()), $"{id} background");
                Assert.That(def.music, Is.EqualTo(l["music"].Value<string>()), $"{id} music");
                Assert.That(def.scrollSpeed, Is.EqualTo(l["scrollSpeed"].Value<float>()).Within(Tolerance));
                Assert.That(def.hpMultiplier, Is.EqualTo(l["hpMultiplier"].Value<float>()).Within(Tolerance));
                Assert.That(def.economy.startingScrap, Is.EqualTo(l["economy"]["startingScrap"].Value<int>()));
                Assert.That(def.economy.trickle,
                            Is.EqualTo(l["economy"]["trickle"].Value<float>()).Within(Tolerance));
                Assert.That(def.stars.hullThreshold,
                            Is.EqualTo(l["stars"]["hullThreshold"].Value<float>()).Within(Tolerance));
                Assert.That(def.rewards.firstClearCores, Is.EqualTo(l["rewards"]["firstClearCores"].Value<int>()));
                Assert.That(def.rewards.coresPerStar, Is.EqualTo(l["rewards"]["coresPerStar"].Value<int>()));

                JArray waves = (JArray)l["waves"];
                Assert.That(def.waves, Has.Length.EqualTo(waves.Count), $"{id} wave count");
                for (int w = 0; w < waves.Count; w++)
                {
                    JObject wave = (JObject)waves[w];
                    WaveEntry got = def.waves[w];
                    string where = $"{id} wave {w}";

                    Assert.That(got.time, Is.EqualTo(wave["time"].Value<float>()).Within(Tolerance), $"{where} time");
                    Assert.That(got.enemyId, Is.EqualTo(wave["enemyId"].Value<string>()), $"{where} enemyId");
                    Assert.That(got.count, Is.EqualTo(wave["count"].Value<int>()), $"{where} count");
                    Assert.That(got.interval, Is.EqualTo(wave["interval"].Value<float>()).Within(Tolerance),
                                $"{where} interval");

                    // An absent lane means the spawner chooses, which is not the same as lane 0.
                    Assert.That(got.hasLane, Is.EqualTo(wave["lane"] != null), $"{where} hasLane");
                    if (wave["lane"] != null)
                        Assert.That(got.lane, Is.EqualTo(wave["lane"].Value<int>()), $"{where} lane");

                    Assert.That(got.hasHpMultiplier, Is.EqualTo(wave["hpMultiplier"] != null),
                                $"{where} hasHpMultiplier");
                    if (wave["hpMultiplier"] != null)
                        Assert.That(got.hpMultiplier,
                                    Is.EqualTo(wave["hpMultiplier"].Value<float>()).Within(Tolerance), $"{where} hpMultiplier");
                }

                Assert.That(def.hasBoss, Is.EqualTo(l["boss"] != null), $"{id} hasBoss");
                if (l["boss"] is JObject boss)
                {
                    Assert.That(def.boss.enemyId, Is.EqualTo(boss["enemyId"].Value<string>()));
                    Assert.That(def.boss.time, Is.EqualTo(boss["time"].Value<float>()).Within(Tolerance));
                    Assert.That(def.boss.hpMultiplier,
                                Is.EqualTo(boss["hpMultiplier"].Value<float>()).Within(Tolerance));
                }
            }
        }

        [Test]
        public void EveryPilotAndEscortMatchesItsJson()
        {
            foreach (JObject p in Json("pilots.json").Cast<JObject>())
            {
                string id = p["id"].Value<string>();
                PilotDef def = db.pilots.FirstOrDefault(x => x.id == id);
                Assert.That(def, Is.Not.Null, $"no imported pilot '{id}'");

                Assert.That(def.displayName, Is.EqualTo(p["name"].Value<string>()));
                Assert.That(def.ability.displayName, Is.EqualTo(p["ability"]["name"].Value<string>()));
                Assert.That(def.ability.kind, Is.EqualTo(p["ability"]["kind"].Value<string>()));
                Assert.That(def.ability.cooldown,
                            Is.EqualTo(p["ability"]["cooldown"].Value<float>()).Within(Tolerance));
                Assert.That(def.ability.duration,
                            Is.EqualTo(p["ability"]["duration"].Value<float>()).Within(Tolerance));
                Assert.That(def.ability.magnitude,
                            Is.EqualTo(p["ability"]["magnitude"].Value<float>()).Within(Tolerance));
                Assert.That(def.passive.kind, Is.EqualTo(p["passive"]["kind"].Value<string>()));
                Assert.That(def.passive.perLevel,
                            Is.EqualTo(p["passive"]["perLevel"].Value<float>()).Within(Tolerance));
                Assert.That(def.levelCosts,
                            Is.EqualTo(((JArray)p["levelCosts"]).Select(c => c.Value<int>()).ToArray()));
            }

            foreach (JObject e in Json("escorts.json").Cast<JObject>())
            {
                string id = e["id"].Value<string>();
                EscortDef def = db.escorts.FirstOrDefault(x => x.id == id);
                Assert.That(def, Is.Not.Null, $"no imported escort '{id}'");

                Assert.That(def.displayName, Is.EqualTo(e["name"].Value<string>()));
                Assert.That(def.hp, Is.EqualTo(e["hp"].Value<int>()));
                Assert.That(def.weaponId, Is.EqualTo(e["weaponId"].Value<string>()));
                Assert.That(def.damageScale, Is.EqualTo(e["damageScale"].Value<float>()).Within(Tolerance));
                Assert.That(def.assetKey, Is.EqualTo(e["spriteKey"].Value<string>()));
                Assert.That(def.standoffX, Is.EqualTo(e["standoffX"].Value<float>()).Within(Tolerance));
                Assert.That(def.cost, Is.EqualTo(e["cost"].Value<int>()));
                Assert.That(def.costGrowth, Is.EqualTo(e["costGrowth"].Value<float>()).Within(Tolerance));
            }
        }

        [Test]
        public void TheDamageMatrixMatchesTuningJsonInBothDirections()
        {
            JObject matrix = (JObject)JObject.Parse(File.ReadAllText(RepoPaths.DataFile("tuning.json")))["damageMatrix"];

            // Every one of the sixteen pairings, read back through the accessor gameplay uses.
            // A transposed matrix would still have the right numbers in it, so each is checked
            // at its own coordinates.
            foreach (DamageType type in System.Enum.GetValues(typeof(DamageType)).Cast<DamageType>())
            foreach (ArmorClass armor in System.Enum.GetValues(typeof(ArmorClass)).Cast<ArmorClass>())
            {
                float expected = matrix[type.ToString().ToLowerInvariant()][armor.ToString().ToLowerInvariant()]
                    .Value<float>();
                Assert.That(db.tuning.damageMatrix.Multiplier(type, armor),
                            Is.EqualTo(expected).Within(Tolerance), $"{type} vs {armor}");
            }
        }

        [Test]
        public void TuningCarriesTheNumbersGameplayReads()
        {
            JObject t = JObject.Parse(File.ReadAllText(RepoPaths.DataFile("tuning.json")));
            TuningDef tuning = db.tuning;

            Assert.That(tuning.mecha.baseHullHp, Is.EqualTo(t["mecha"]["baseHullHp"].Value<int>()));
            Assert.That(tuning.mecha.lanesY,
                        Is.EqualTo(((JArray)t["mecha"]["lanesY"]).Select(v => v.Value<float>()).ToArray()));
            Assert.That(tuning.mecha.turretMountOffsets,
                        Has.Length.EqualTo(((JArray)t["mecha"]["turretMountOffsets"]).Count));
            Assert.That(tuning.combat.shieldNonPiercingFactor,
                        Is.EqualTo(t["combat"]["shieldNonPiercingFactor"].Value<float>()).Within(Tolerance));
            Assert.That(tuning.targeting.manualShotDamageMultiplier,
                        Is.EqualTo(t["targeting"]["manualShotDamageMultiplier"].Value<float>()).Within(Tolerance));
            Assert.That(tuning.endless.waveCount, Is.EqualTo(t["endless"]["waveCount"].Value<int>()));
            Assert.That(tuning.endless.tiers, Has.Length.EqualTo(((JArray)t["endless"]["tiers"]).Count));
            Assert.That(tuning.tutorial.steps, Has.Length.EqualTo(((JArray)t["tutorial"]["steps"]).Count));
            Assert.That(tuning.pools.enemies, Is.EqualTo(t["pools"]["enemies"].Value<int>()));

            // enemyBaseSize is stored as an array indexed by ArmorClass, so a wrong order here
            // would silently give every enemy the wrong hit box.
            JObject sizes = (JObject)t["world"]["enemyBaseSize"];
            foreach (ArmorClass armor in System.Enum.GetValues(typeof(ArmorClass)).Cast<ArmorClass>())
            {
                JObject expected = (JObject)sizes[armor.ToString().ToLowerInvariant()];
                EnemySize got = tuning.world.BaseSizeFor(armor);
                Assert.That(got.width, Is.EqualTo(expected["width"].Value<float>()).Within(Tolerance),
                            $"{armor} width");
                Assert.That(got.height, Is.EqualTo(expected["height"].Value<float>()).Within(Tolerance),
                            $"{armor} height");
            }
        }

        [Test]
        public void EveryBossOverrideIsReachableByItsEnemyId()
        {
            JObject byId = (JObject)JObject.Parse(File.ReadAllText(RepoPaths.DataFile("tuning.json")))["boss"]["byId"];

            foreach (JProperty p in byId.Properties())
            {
                Assert.That(db.tuning.TryGetBoss(p.Name, out BossOverride found), Is.True,
                            $"no boss tuning imported for '{p.Name}'");
                Assert.That(found.kind.ToString().ToLowerInvariant().Replace("_", string.Empty),
                            Is.EqualTo(p.Value["kind"].Value<string>().Replace("_", string.Empty)),
                            $"{p.Name} kind");
            }

            Assert.That(db.tuning.TryGetBoss("not_a_boss", out _), Is.False);
        }

        [Test]
        public void TheDatabaseLooksUpByIdAndSaysSoWhenAnIdIsWrong()
        {
            Assert.That(db.Enemy("rustcrawler").id, Is.EqualTo("rustcrawler"));
            Assert.That(db.Level("level-01").id, Is.EqualTo("level-01"));
            Assert.That(db.TryGetEnemy("rustcrawler", out _), Is.True);
            Assert.That(db.TryGetEnemy("nope", out _), Is.False);
            Assert.Throws<KeyNotFoundException>(() => db.Enemy("nope"));
        }

        [Test]
        public void TheDatabaseRecordsWhichRevisionOfTheDataItWasBuiltFrom()
        {
            Assert.That(db.importedFromRevision, Is.Not.Null.And.Not.Empty);
            Assert.That(db.importedAtUtc, Is.Not.Null.And.Not.Empty);
        }
    }
}
