using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;
using ScrapTitan.Battle;

namespace ScrapTitan.Editor
{
    /// <summary>
    /// Prints what Unity actually made of each model: the hierarchy, every part's local and
    /// world position, and its bounds.
    ///
    /// Exists because the axis mapping between the briefs' convention (Z up, front on -Y) and
    /// Unity's (Y up, front on +Z) is easy to reason about wrongly, and a wrong guess puts
    /// both of the Titan's legs in the same place. Reading the import is cheaper than
    /// deriving it, and ModelImportTests then pins whatever this reports.
    /// </summary>
    public static class ModelDiagnostics
    {
        [MenuItem("Scrap Titan/Print model layout")]
        public static void Dump()
        {
            var sb = new StringBuilder();
            foreach (string guid in AssetDatabase.FindAssets(
                "t:Model", new[] { "Assets/_Game/Resources/Models" }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (prefab == null) continue;

                GameObject instance = Object.Instantiate(prefab);
                sb.AppendLine($"=== {Path.GetFileName(path)}");
                Bounds whole = ModelLibrary.WorldBounds(instance);
                sb.AppendLine($"    whole: centre {whole.center:F3} size {whole.size:F3}");
                sb.AppendLine($"    root scale {instance.transform.localScale:F4}");

                foreach (Transform t in instance.GetComponentsInChildren<Transform>(true))
                {
                    string parent = t.parent == null ? "-" : t.parent.name;
                    string bounds = "";
                    if (t.TryGetComponent(out Renderer r))
                        bounds = $" bounds.size {r.bounds.size:F3} min.y {r.bounds.min.y:F3}";
                    sb.AppendLine($"    {t.name,-28} parent {parent,-28} "
                                  + $"local {t.localPosition:F3} world {t.position:F3}{bounds}");
                }
                Object.DestroyImmediate(instance);
            }

            string outPath = Path.Combine(RepoPaths.RepoRoot, "Logs", "model-layout.txt");
            Directory.CreateDirectory(Path.GetDirectoryName(outPath));
            File.WriteAllText(outPath, sb.ToString());
            Debug.Log(sb.ToString());
            Debug.Log($"[ModelDiagnostics] written to {outPath}");
        }
    }
}
