using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using ScrapTitan.Data;
using ScrapTitan.Editor;

namespace ScrapTitan.Tests
{
    /// <summary>
    /// Every field a schema defines must exist somewhere in the ScriptableObject it imports
    /// into. Written after `projectile.pierce` was found missing from WeaponDef: it is in
    /// weapons.json and in the schema, it is the Railgun's defining property, and the
    /// existing import tests could not see it because they only compare fields that exist on
    /// both sides. A field that is silently absent is data loss no other test can catch.
    ///
    /// The check is by name anywhere in the type graph rather than by path, which keeps it
    /// quiet about the places the C# shape differs on purpose: a JSON object keyed by id
    /// becomes an array of entries, an optional object becomes a `hasX` boolean beside an
    /// `x`, and `name` becomes `displayName`.
    /// </summary>
    public sealed class SchemaCoverageTests
    {
        /// <summary>Schema file to the type it imports into.</summary>
        private static readonly (string schema, Type type)[] Contracts =
        {
            ("enemy.schema.json", typeof(EnemyDef)),
            ("weapon.schema.json", typeof(WeaponDef)),
            ("pilot.schema.json", typeof(PilotDef)),
            ("escort.schema.json", typeof(EscortDef)),
            ("level.schema.json", typeof(LevelDef)),
            ("tuning.schema.json", typeof(TuningDef)),
        };

        /// <summary>
        /// Schema property names that are data, not fields: the keys of an object the import
        /// turns into an array. Each one is a deliberate reshaping, so each is named here
        /// rather than the check being loosened.
        /// </summary>
        private static readonly HashSet<string> DataKeys = new(StringComparer.Ordinal)
        {
            // tuning.damageMatrix is keyed by damage type, then by armour class.
            "kinetic", "chemical", "piercing", "explosive",
            "light", "armored", "shielded", "swarm",
            // tuning.meta.weaponUnlockCosts is keyed by weapon id.
            "acid_spitter", "railgun", "scattergun", "gatling_pod",
            // tuning.meta.zoneNames is keyed by zone number.
            "1", "2", "3", "4",
        };

        /// <summary>
        /// Renames the import makes on purpose, from the schema's name to the C# one. An
        /// optional object becomes `hasX` plus `x`, which the "anywhere in the graph" rule
        /// already covers, so only true renames appear here.
        /// </summary>
        private static readonly Dictionary<string, string> Renames = new(StringComparer.Ordinal)
        {
            { "*:name", "displayName" },
            { "*:spriteKey", "assetKey" },
            // weapon.projectile.dot becomes hasDot, dotDps and dotDuration. Keyed by schema,
            // because enemy.burnZone and pilot.ability have a `duration` of their own and a
            // global rename accused both of being missing.
            { "weapon.schema.json:dot", "hasDot" },
            { "weapon.schema.json:dps", "dotDps" },
            { "weapon.schema.json:duration", "dotDuration" },
            // `default` is a C# keyword, so tuning.boss.default imports as `defaults`.
            { "tuning.schema.json:default", "defaults" },
        };

        private static string Rename(string schemaFile, string name)
        {
            if (Renames.TryGetValue($"{schemaFile}:{name}", out string scoped)) return scoped;
            if (Renames.TryGetValue($"*:{name}", out string any)) return any;
            return name;
        }

        private static IEnumerable<string> SchemaPropertyNames(JToken node)
        {
            switch (node)
            {
                case JObject obj:
                    if (obj["properties"] is JObject props)
                        foreach (JProperty p in props.Properties())
                        {
                            yield return p.Name;
                            foreach (string nested in SchemaPropertyNames(p.Value)) yield return nested;
                        }
                    foreach (string key in new[] { "items", "additionalProperties" })
                        if (obj[key] is JObject child)
                            foreach (string nested in SchemaPropertyNames(child)) yield return nested;
                    if (obj["$defs"] is JObject defs)
                        foreach (JProperty p in defs.Properties())
                            foreach (string nested in SchemaPropertyNames(p.Value)) yield return nested;
                    if (obj["definitions"] is JObject older)
                        foreach (JProperty p in older.Properties())
                            foreach (string nested in SchemaPropertyNames(p.Value)) yield return nested;
                    break;
            }
        }

        /// <summary>Every serialisable field name reachable from `root`, to any depth.</summary>
        private static HashSet<string> FieldNames(Type root)
        {
            var found = new HashSet<string>(StringComparer.Ordinal);
            var seen = new HashSet<Type>();
            var queue = new Queue<Type>();
            queue.Enqueue(root);

            while (queue.Count > 0)
            {
                Type type = queue.Dequeue();
                if (type == null || !seen.Add(type)) continue;

                foreach (FieldInfo field in type.GetFields(BindingFlags.Public | BindingFlags.Instance))
                {
                    found.Add(field.Name);
                    Type ft = field.FieldType;
                    if (ft.IsArray) ft = ft.GetElementType();
                    if (ft == null || ft.IsPrimitive || ft.IsEnum || ft == typeof(string)) continue;
                    queue.Enqueue(ft);
                }
                // Computed helpers such as HpMultiplierOrOne stand in for a schema field too.
                foreach (PropertyInfo p in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
                    found.Add(p.Name);
            }
            return found;
        }

        [Test]
        public void EverySchemaFieldExistsInTheTypeItImportsInto()
        {
            string schemaDir = RepoPaths.SchemaDir;
            var missing = new List<string>();

            foreach ((string schemaFile, Type type) in Contracts)
            {
                string path = Path.Combine(schemaDir, schemaFile);
                Assert.That(File.Exists(path), $"no schema at {path}");
                JObject schema = JObject.Parse(File.ReadAllText(path));
                HashSet<string> fields = FieldNames(type);

                foreach (string name in SchemaPropertyNames(schema).Distinct())
                {
                    if (DataKeys.Contains(name)) continue;
                    string wanted = Rename(schemaFile, name);
                    if (fields.Contains(wanted)) continue;
                    // Case differences are not a dropped field.
                    if (fields.Any(f => string.Equals(f, wanted, StringComparison.OrdinalIgnoreCase)))
                        continue;
                    missing.Add($"{schemaFile}: '{name}' has no field in {type.Name}");
                }
            }

            Assert.That(missing, Is.Empty,
                "Fields in src/data/schemas that nothing in the Unity data model holds, so the "
                + "value is dropped on import:\n  " + string.Join("\n  ", missing));
        }

        [Test]
        public void TheRailgunPiercesAfterImport()
        {
            // The specific loss that prompted the test above. The Railgun's brief and
            // GAME_DESIGN both rest on one shot carrying through everything in the lane.
            WeaponDef railgun = GameDatabase.Instance.Weapon("railgun");
            Assert.That(railgun, Is.Not.Null, "railgun missing from the database");
            Assert.That(railgun.projectile.pierce, Is.True,
                "weapons.json gives the railgun projectile.pierce = true");
        }

        [Test]
        public void NoOtherWeaponPierces()
        {
            foreach (WeaponDef weapon in GameDatabase.Instance.weapons)
            {
                if (weapon.id == "railgun") continue;
                Assert.That(weapon.projectile.pierce, Is.False,
                    $"{weapon.id} should not pierce; only the railgun does");
            }
        }
    }
}
