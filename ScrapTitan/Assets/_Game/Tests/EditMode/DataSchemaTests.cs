using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using ScrapTitan.Editor;

namespace ScrapTitan.Tests
{
    /// <summary>
    /// src/data is the source of truth for all content, so these tests are the gate on it:
    /// every file against its schema, and every borrowed id against the file that defines it.
    /// </summary>
    public sealed class DataSchemaTests
    {
        [Test]
        public void EveryDataFileMatchesItsSchema()
        {
            List<string> problems = DataValidation.ValidateSchemas();
            Assert.That(problems, Is.Empty, "src/data does not match its schemas:\n" + string.Join("\n", problems));
        }

        [Test]
        public void EveryReferencedIdExists()
        {
            List<string> problems = DataValidation.ValidateReferences();
            Assert.That(problems, Is.Empty, "src/data has dangling references:\n" + string.Join("\n", problems));
        }

        [Test]
        public void EverySchemaFileIsReadableAndFullySupported()
        {
            // The validator refuses a schema using a keyword it does not check, so this also
            // proves no schema has quietly grown a constraint we are not enforcing.
            foreach (string schema in Directory.GetFiles(RepoPaths.SchemaDir, "*.schema.json"))
            {
                Assert.DoesNotThrow(() => JsonSchemaValidator.FromFile(schema),
                                    $"{Path.GetFileName(schema)} is not fully supported by the validator.");
            }
        }

        [Test]
        public void TheValidatorRejectsDataThatBreaksTheSchema()
        {
            // A validator that passes everything would make the two tests above meaningless,
            // so each kind of breakage gets checked against a real schema.
            JsonSchemaValidator schema = JsonSchemaValidator.FromFile(RepoPaths.SchemaFile("enemy.schema.json"));
            JObject good = (JObject)JArray.Parse(File.ReadAllText(RepoPaths.DataFile("enemies.json")))[0];
            Assert.That(schema.Validate(good), Is.Empty, "the first real enemy should validate");

            void AssertRejected(string why, System.Action<JObject> breakIt)
            {
                JObject broken = (JObject)good.DeepClone();
                breakIt(broken);
                Assert.That(schema.Validate(broken), Is.Not.Empty, $"should have been rejected: {why}");
            }

            AssertRejected("a required field is missing", o => o.Remove("hp"));
            AssertRejected("a number where a string belongs", o => o["id"] = 7);
            AssertRejected("hp of 0, which the schema excludes", o => o["hp"] = 0);
            AssertRejected("a negative speed", o => o["speed"] = -1);
            AssertRejected("an id with a capital letter", o => o["id"] = "Rustcrawler");
            AssertRejected("an unknown armour class", o => o["armorClass"] = "ceramic");
            AssertRejected("an unknown behaviour", o => o["behaviors"] = new JArray("dancing"));
            AssertRejected("a repeated behaviour", o => o["behaviors"] = new JArray("melee", "melee"));
            AssertRejected("a property the schema does not allow", o => o["mystery"] = 1);
            AssertRejected("a bodyDamageFactor above 1", o => o["weakPoints"] = new JObject
            {
                ["enemyId"] = "rustcrawler",
                ["mounts"] = new JArray(new JObject { ["x"] = 0, ["y"] = 0 }),
                ["bodyDamageFactor"] = 1.5,
            });
            AssertRejected("weakPoints with no mounts", o => o["weakPoints"] = new JObject
            {
                ["enemyId"] = "rustcrawler",
                ["mounts"] = new JArray(),
                ["bodyDamageFactor"] = 0.25,
            });
        }

        [Test]
        public void IntegerFieldsAcceptAWholeFloatButNotAFraction()
        {
            // JSON has one number type, so "integer" has to mean a mathematical integer:
            // 10.0 is a valid reward, 10.5 is not.
            JsonSchemaValidator schema = JsonSchemaValidator.FromFile(RepoPaths.SchemaFile("enemy.schema.json"));
            JObject enemy = (JObject)JArray.Parse(File.ReadAllText(RepoPaths.DataFile("enemies.json")))[0];

            JObject whole = (JObject)enemy.DeepClone();
            whole["reward"] = 10.0;
            Assert.That(schema.Validate(whole), Is.Empty, "10.0 is a whole number and should pass");

            JObject fraction = (JObject)enemy.DeepClone();
            fraction["reward"] = 10.5;
            Assert.That(schema.Validate(fraction), Is.Not.Empty, "10.5 is not an integer and should fail");
        }
    }
}
