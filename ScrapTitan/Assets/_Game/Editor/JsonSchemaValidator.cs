using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

namespace ScrapTitan.Editor
{
    /// <summary>
    /// Validates the game's JSON against its JSON Schema, so "the data is valid" is a test
    /// rather than a hope. Covers the draft-07 keywords the six schemas in src/data/schemas
    /// actually use, and refuses to run against a schema that uses anything else, instead of
    /// quietly passing a file it did not really check.
    /// </summary>
    public sealed class JsonSchemaValidator
    {
        /// <summary>Every keyword this validator understands. Anything else is an error.</summary>
        private static readonly HashSet<string> Known = new(StringComparer.Ordinal)
        {
            // Checked.
            "type", "enum", "const", "required", "properties", "additionalProperties",
            "items", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
            "minItems", "maxItems", "uniqueItems", "pattern", "minLength", "maxLength",
            "$ref",
            // Carry no constraint, so ignoring them is correct.
            "$schema", "$id", "title", "description", "default", "examples",
            "definitions", "$defs", "$comment",
        };

        private readonly JObject root;

        public JsonSchemaValidator(JObject rootSchema)
        {
            root = rootSchema ?? throw new ArgumentNullException(nameof(rootSchema));
            List<string> unsupported = new();
            FindUnsupported(root, "$", unsupported);
            if (unsupported.Count > 0)
            {
                throw new NotSupportedException(
                    "This schema uses keywords the validator does not check, so it would report "
                    + "a false pass. Add support before relying on it: "
                    + string.Join(", ", unsupported));
            }
        }

        public static JsonSchemaValidator FromFile(string schemaPath)
            => new(JObject.Parse(System.IO.File.ReadAllText(schemaPath)));

        /// <summary>Every way the instance breaks the schema. Empty means valid.</summary>
        public List<string> Validate(JToken instance)
        {
            List<string> errors = new();
            Check(instance, root, "$", errors);
            return errors;
        }

        private void Check(JToken node, JObject schema, string path, List<string> errors)
        {
            if (schema.TryGetValue("$ref", out JToken refToken))
            {
                // draft-07: a $ref replaces the schema; its siblings are ignored.
                Check(node, Resolve(refToken.Value<string>()), path, errors);
                return;
            }

            if (schema.TryGetValue("type", out JToken typeToken) && !MatchesType(node, typeToken))
            {
                errors.Add($"{path}: expected type {typeToken.ToString(Newtonsoft.Json.Formatting.None)}, got {node.Type}");
                return; // Every further check would just repeat this one failure.
            }

            if (schema.TryGetValue("enum", out JToken enumToken) && !ContainsValue((JArray)enumToken, node))
                errors.Add($"{path}: {Describe(node)} is not one of {enumToken.ToString(Newtonsoft.Json.Formatting.None)}");

            if (schema.TryGetValue("const", out JToken constToken) && !SameValue(constToken, node))
                errors.Add($"{path}: expected {Describe(constToken)}, got {Describe(node)}");

            switch (node)
            {
                case JObject obj: CheckObject(obj, schema, path, errors); break;
                case JArray arr: CheckArray(arr, schema, path, errors); break;
                case JValue val: CheckValue(val, schema, path, errors); break;
            }
        }

        private void CheckObject(JObject obj, JObject schema, string path, List<string> errors)
        {
            if (schema.TryGetValue("required", out JToken required))
            {
                foreach (JToken name in (JArray)required)
                {
                    string key = name.Value<string>();
                    if (obj[key] == null) errors.Add($"{path}: missing required property '{key}'");
                }
            }

            JObject properties = schema["properties"] as JObject;
            JToken additional = schema["additionalProperties"];

            foreach (KeyValuePair<string, JToken> member in obj)
            {
                JToken subSchema = properties?[member.Key];
                if (subSchema is JObject sub)
                {
                    Check(member.Value, sub, $"{path}.{member.Key}", errors);
                }
                else if (additional != null)
                {
                    if (additional.Type == JTokenType.Boolean && !additional.Value<bool>())
                        errors.Add($"{path}: unexpected property '{member.Key}'");
                    else if (additional is JObject additionalSchema)
                        Check(member.Value, additionalSchema, $"{path}.{member.Key}", errors);
                }
            }
        }

        private void CheckArray(JArray arr, JObject schema, string path, List<string> errors)
        {
            if (schema["items"] is JObject itemSchema)
            {
                for (int i = 0; i < arr.Count; i++)
                    Check(arr[i], itemSchema, $"{path}[{i}]", errors);
            }

            if (schema.TryGetValue("minItems", out JToken min) && arr.Count < min.Value<int>())
                errors.Add($"{path}: has {arr.Count} items, needs at least {min.Value<int>()}");

            if (schema.TryGetValue("maxItems", out JToken max) && arr.Count > max.Value<int>())
                errors.Add($"{path}: has {arr.Count} items, allows at most {max.Value<int>()}");

            if (schema.TryGetValue("uniqueItems", out JToken unique) && unique.Value<bool>())
            {
                for (int i = 0; i < arr.Count; i++)
                for (int j = i + 1; j < arr.Count; j++)
                {
                    if (SameValue(arr[i], arr[j]))
                        errors.Add($"{path}: items {i} and {j} are both {Describe(arr[i])}, which must be unique");
                }
            }
        }

        private static void CheckValue(JValue val, JObject schema, string path, List<string> errors)
        {
            if (IsNumber(val))
            {
                double v = val.Value<double>();

                if (schema.TryGetValue("minimum", out JToken min) && v < min.Value<double>())
                    errors.Add($"{path}: {Fmt(v)} is below the minimum {Fmt(min.Value<double>())}");

                if (schema.TryGetValue("maximum", out JToken max) && v > max.Value<double>())
                    errors.Add($"{path}: {Fmt(v)} is above the maximum {Fmt(max.Value<double>())}");

                if (schema.TryGetValue("exclusiveMinimum", out JToken xmin) && v <= xmin.Value<double>())
                    errors.Add($"{path}: {Fmt(v)} must be greater than {Fmt(xmin.Value<double>())}");

                if (schema.TryGetValue("exclusiveMaximum", out JToken xmax) && v >= xmax.Value<double>())
                    errors.Add($"{path}: {Fmt(v)} must be less than {Fmt(xmax.Value<double>())}");
            }

            if (val.Type == JTokenType.String)
            {
                string s = val.Value<string>() ?? string.Empty;

                if (schema.TryGetValue("pattern", out JToken pattern)
                    && !Regex.IsMatch(s, pattern.Value<string>()))
                    errors.Add($"{path}: '{s}' does not match /{pattern.Value<string>()}/");

                if (schema.TryGetValue("minLength", out JToken minLen) && s.Length < minLen.Value<int>())
                    errors.Add($"{path}: '{s}' is shorter than {minLen.Value<int>()}");

                if (schema.TryGetValue("maxLength", out JToken maxLen) && s.Length > maxLen.Value<int>())
                    errors.Add($"{path}: '{s}' is longer than {maxLen.Value<int>()}");
            }
        }

        private JObject Resolve(string pointer)
        {
            if (pointer == null || !pointer.StartsWith("#/", StringComparison.Ordinal))
                throw new NotSupportedException($"Only local $refs like '#/definitions/x' are supported, got '{pointer}'.");

            JToken node = root;
            foreach (string rawPart in pointer.Substring(2).Split('/'))
            {
                string part = rawPart.Replace("~1", "/").Replace("~0", "~");
                node = node?[part];
                if (node == null) throw new NotSupportedException($"$ref '{pointer}' does not resolve.");
            }

            return node as JObject ?? throw new NotSupportedException($"$ref '{pointer}' is not an object.");
        }

        private static bool MatchesType(JToken node, JToken typeToken)
        {
            if (typeToken is JArray any)
            {
                foreach (JToken one in any)
                    if (MatchesOneType(node, one.Value<string>())) return true;
                return false;
            }
            return MatchesOneType(node, typeToken.Value<string>());
        }

        private static bool MatchesOneType(JToken node, string type) => type switch
        {
            "object" => node.Type == JTokenType.Object,
            "array" => node.Type == JTokenType.Array,
            "string" => node.Type == JTokenType.String,
            "boolean" => node.Type == JTokenType.Boolean,
            "null" => node.Type == JTokenType.Null,
            "number" => IsNumber(node),
            // JSON Schema means a mathematical integer, so 3.0 counts and 3.5 does not.
            "integer" => IsNumber(node) && Math.Abs(node.Value<double>() % 1d) < double.Epsilon,
            _ => throw new NotSupportedException($"Unknown schema type '{type}'."),
        };

        private static bool IsNumber(JToken node)
            => node.Type is JTokenType.Integer or JTokenType.Float;

        private static bool ContainsValue(JArray allowed, JToken node)
        {
            foreach (JToken option in allowed)
                if (SameValue(option, node)) return true;
            return false;
        }

        /// <summary>
        /// JSON equality, where 1 and 1.0 are the same number. JToken.DeepEquals treats those
        /// as different, which would reject valid data.
        /// </summary>
        private static bool SameValue(JToken a, JToken b)
        {
            if (IsNumber(a) && IsNumber(b)) return a.Value<double>().Equals(b.Value<double>());
            return JToken.DeepEquals(a, b);
        }

        private static string Describe(JToken node) => node.Type == JTokenType.String
            ? $"'{node.Value<string>()}'"
            : node.ToString(Newtonsoft.Json.Formatting.None);

        private static string Fmt(double v) => v.ToString("0.####", CultureInfo.InvariantCulture);

        private static void FindUnsupported(JToken node, string path, List<string> found)
        {
            if (node is JObject obj)
            {
                foreach (KeyValuePair<string, JToken> member in obj)
                {
                    if (!Known.Contains(member.Key)) found.Add($"{path}.{member.Key}");
                }

                // Only recurse where a subschema can legitimately live, so a "properties"
                // entry named e.g. "type" is not mistaken for the type keyword.
                Recurse(obj["properties"] as JObject, $"{path}.properties", found);
                Recurse(obj["definitions"] as JObject, $"{path}.definitions", found);
                Recurse(obj["$defs"] as JObject, $"{path}.$defs", found);

                if (obj["items"] is JObject items) FindUnsupported(items, $"{path}.items", found);
                if (obj["additionalProperties"] is JObject add) FindUnsupported(add, $"{path}.additionalProperties", found);
            }
        }

        private static void Recurse(JObject container, string path, List<string> found)
        {
            if (container == null) return;
            foreach (KeyValuePair<string, JToken> member in container)
            {
                if (member.Value is JObject sub) FindUnsupported(sub, $"{path}.{member.Key}", found);
            }
        }
    }
}
