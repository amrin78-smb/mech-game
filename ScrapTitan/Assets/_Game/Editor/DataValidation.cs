using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace ScrapTitan.Editor
{
    /// <summary>
    /// Checks src/data two ways: every file against its JSON Schema, and every id that one
    /// file uses against the file that defines it. The schemas catch a malformed field; only
    /// the cross-reference pass catches a wave pointing at an enemy that does not exist,
    /// which is the mistake authoring a level actually invites.
    /// </summary>
    public static class DataValidation
    {
        /// <summary>Every problem in src/data. Empty means the data is good.</summary>
        public static List<string> ValidateAll()
        {
            List<string> problems = new();
            problems.AddRange(ValidateSchemas());
            // Cross-references read the files assuming they are well formed, so only run
            // that pass once the schemas are happy.
            if (problems.Count == 0) problems.AddRange(ValidateReferences());
            return problems;
        }

        /// <summary>Each file against the schema that governs it.</summary>
        public static List<string> ValidateSchemas()
        {
            List<string> problems = new();

            ValidateArrayFile("enemies.json", "enemy.schema.json", problems);
            ValidateArrayFile("weapons.json", "weapon.schema.json", problems);
            ValidateArrayFile("pilots.json", "pilot.schema.json", problems);
            ValidateArrayFile("escorts.json", "escort.schema.json", problems);

            JsonSchemaValidator levelSchema = JsonSchemaValidator.FromFile(RepoPaths.SchemaFile("level.schema.json"));
            foreach (string file in RepoPaths.LevelFiles())
            {
                string name = Path.GetFileName(file);
                foreach (string error in levelSchema.Validate(JObject.Parse(File.ReadAllText(file))))
                    problems.Add($"levels/{name} {error}");
            }

            JsonSchemaValidator tuningSchema = JsonSchemaValidator.FromFile(RepoPaths.SchemaFile("tuning.schema.json"));
            foreach (string error in tuningSchema.Validate(JObject.Parse(File.ReadAllText(RepoPaths.DataFile("tuning.json")))))
                problems.Add($"tuning.json {error}");

            return problems;
        }

        private static void ValidateArrayFile(string dataFile, string schemaFile, List<string> problems)
        {
            JsonSchemaValidator schema = JsonSchemaValidator.FromFile(RepoPaths.SchemaFile(schemaFile));
            JArray items = JArray.Parse(File.ReadAllText(RepoPaths.DataFile(dataFile)));

            for (int i = 0; i < items.Count; i++)
            {
                string id = (items[i] as JObject)?["id"]?.Value<string>() ?? $"index {i}";
                foreach (string error in schema.Validate(items[i]))
                    problems.Add($"{dataFile} [{id}] {error}");
            }
        }

        /// <summary>Every id one file borrows from another.</summary>
        public static List<string> ValidateReferences()
        {
            List<string> problems = new();

            JArray enemies = JArray.Parse(File.ReadAllText(RepoPaths.DataFile("enemies.json")));
            JArray weapons = JArray.Parse(File.ReadAllText(RepoPaths.DataFile("weapons.json")));
            JArray escorts = JArray.Parse(File.ReadAllText(RepoPaths.DataFile("escorts.json")));
            JObject tuning = JObject.Parse(File.ReadAllText(RepoPaths.DataFile("tuning.json")));

            HashSet<string> enemyIds = Ids(enemies);
            HashSet<string> weaponIds = Ids(weapons);
            HashSet<string> levelIds = new(StringComparer.Ordinal);

            CheckUnique(enemies, "enemies.json", problems);
            CheckUnique(weapons, "weapons.json", problems);
            CheckUnique(escorts, "escorts.json", problems);
            CheckUnique(JArray.Parse(File.ReadAllText(RepoPaths.DataFile("pilots.json"))), "pilots.json", problems);

            // Enemies pointing at other enemies: what a spawner releases, what a carrier carries.
            foreach (JObject e in enemies.Cast<JObject>())
            {
                string id = e["id"].Value<string>();

                if (e["spawns"]?["enemyId"]?.Value<string>() is string spawned && !enemyIds.Contains(spawned))
                    problems.Add($"enemies.json [{id}] spawns unknown enemy '{spawned}'");

                if (e["weakPoints"]?["enemyId"]?.Value<string>() is string part && !enemyIds.Contains(part))
                    problems.Add($"enemies.json [{id}] weakPoints point at unknown enemy '{part}'");

                // A behaviour that needs a data block but has none would silently do nothing.
                JArray behaviors = (JArray)e["behaviors"];
                bool Has(string b) => behaviors.Any(x => x.Value<string>() == b);

                if (Has("barrier") && e["barrier"] == null)
                    problems.Add($"enemies.json [{id}] has the barrier behaviour but no barrier block");
                if (Has("spawner") && e["spawns"] == null)
                    problems.Add($"enemies.json [{id}] has the spawner behaviour but no spawns block");
                if (Has("burner") && e["burnZone"] == null)
                    problems.Add($"enemies.json [{id}] has the burner behaviour but no burnZone block");
                if (Has("shielded") && (e["shieldHp"]?.Value<int>() ?? 0) <= 0)
                    problems.Add($"enemies.json [{id}] has the shielded behaviour but no shieldHp");
                if (Has("ranged") && (e["attackRange"]?.Value<float>() ?? 0f) <= 0f)
                    problems.Add($"enemies.json [{id}] has the ranged behaviour but no attackRange");
            }

            foreach (JObject e in escorts.Cast<JObject>())
            {
                string weaponId = e["weaponId"].Value<string>();
                if (!weaponIds.Contains(weaponId))
                    problems.Add($"escorts.json [{e["id"]}] uses unknown weapon '{weaponId}'");
            }

            foreach (string file in RepoPaths.LevelFiles())
            {
                string name = Path.GetFileName(file);
                JObject level = JObject.Parse(File.ReadAllText(file));
                string id = level["id"].Value<string>();

                if (!levelIds.Add(id)) problems.Add($"levels/{name} repeats the level id '{id}'");

                if (Path.GetFileNameWithoutExtension(file) != id)
                    problems.Add($"levels/{name} declares id '{id}', which does not match its filename");

                foreach (JObject wave in ((JArray)level["waves"]).Cast<JObject>())
                {
                    string enemyId = wave["enemyId"].Value<string>();
                    if (!enemyIds.Contains(enemyId))
                        problems.Add($"levels/{name} wave at {wave["time"]}s spawns unknown enemy '{enemyId}'");
                }

                if (level["boss"]?["enemyId"]?.Value<string>() is string bossId && !enemyIds.Contains(bossId))
                    problems.Add($"levels/{name} names unknown boss '{bossId}'");
            }

            // Tuning naming content elsewhere.
            JObject meta = (JObject)tuning["meta"];
            foreach (JToken w in (JArray)meta["startingWeapons"])
                if (!weaponIds.Contains(w.Value<string>()))
                    problems.Add($"tuning.json meta.startingWeapons names unknown weapon '{w}'");

            foreach (JProperty p in ((JObject)meta["weaponUnlockCosts"]).Properties())
                if (!weaponIds.Contains(p.Name))
                    problems.Add($"tuning.json meta.weaponUnlockCosts names unknown weapon '{p.Name}'");

            JObject endless = (JObject)tuning["endless"];
            foreach (JObject tier in ((JArray)endless["tiers"]).Cast<JObject>())
            foreach (JToken e in (JArray)tier["enemies"])
                if (!enemyIds.Contains(e.Value<string>()))
                    problems.Add($"tuning.json endless tier from wave {tier["fromWave"]} names unknown enemy '{e}'");

            foreach (JToken e in (JArray)endless["elites"])
                if (!enemyIds.Contains(e.Value<string>()))
                    problems.Add($"tuning.json endless.elites names unknown enemy '{e}'");

            string unlockAfter = endless["unlockAfterLevel"].Value<string>();
            if (!levelIds.Contains(unlockAfter))
                problems.Add($"tuning.json endless.unlockAfterLevel names unknown level '{unlockAfter}'");

            string tutorialLevel = tuning["tutorial"]["levelId"].Value<string>();
            if (!levelIds.Contains(tutorialLevel))
                problems.Add($"tuning.json tutorial.levelId names unknown level '{tutorialLevel}'");

            foreach (JProperty p in ((JObject)tuning["boss"]["byId"]).Properties())
                if (!enemyIds.Contains(p.Name))
                    problems.Add($"tuning.json boss.byId names unknown enemy '{p.Name}'");

            return problems;
        }

        private static HashSet<string> Ids(JArray items)
            => new(items.Select(i => i["id"].Value<string>()), StringComparer.Ordinal);

        private static void CheckUnique(JArray items, string file, List<string> problems)
        {
            HashSet<string> seen = new(StringComparer.Ordinal);
            foreach (JToken item in items)
            {
                string id = item["id"].Value<string>();
                if (!seen.Add(id)) problems.Add($"{file} repeats the id '{id}'");
            }
        }
    }
}
