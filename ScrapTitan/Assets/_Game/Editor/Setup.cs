using UnityEditor;
using UnityEngine;

namespace ScrapTitan.Editor
{
    /// <summary>
    /// Everything the project needs doing, in one call, so it costs one editor launch rather
    /// than several. Safe to re-run: the importer updates assets in place, and the scene,
    /// the model import settings and the player settings are all regenerated from code.
    /// </summary>
    public static class Setup
    {
        [MenuItem("Scrap Titan/Run project setup")]
        public static void RunAll()
        {
            Debug.Log("[Setup] Importing src/data ...");
            int assets = DataImport.ImportAll();
            Debug.Log($"[Setup] Imported {assets} assets.");

            Debug.Log("[Setup] Applying model import settings ...");
            BattleScene.ApplyModelImportSettings();

            Debug.Log("[Setup] Rebuilding the battle scene ...");
            BattleScene.Rebuild();

            Debug.Log("[Setup] Applying Android player settings ...");
            AndroidBuild.ApplySettingsOnly();

            AssetDatabase.SaveAssets();
            Debug.Log("[Setup] Done.");
        }
    }
}
