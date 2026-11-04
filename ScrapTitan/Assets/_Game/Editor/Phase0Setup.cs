using UnityEditor;
using UnityEngine;

namespace ScrapTitan.Editor
{
    /// <summary>
    /// Everything Phase 0 needs doing to the project, in one call, so it costs one editor
    /// launch rather than three. Safe to re-run: the importer updates assets in place and the
    /// scene and settings are regenerated from code.
    /// </summary>
    public static class Phase0Setup
    {
        [MenuItem("Scrap Titan/Run Phase 0 setup")]
        public static void RunAll()
        {
            Debug.Log("[Phase0Setup] Importing src/data ...");
            int assets = DataImport.ImportAll();
            Debug.Log($"[Phase0Setup] Imported {assets} assets.");

            Debug.Log("[Phase0Setup] Rebuilding the Phase 0 scene ...");
            Phase0Scene.Rebuild();

            Debug.Log("[Phase0Setup] Applying Android player settings ...");
            AndroidBuild.ApplySettingsOnly();

            AssetDatabase.SaveAssets();
            Debug.Log("[Phase0Setup] Done.");
        }
    }
}
