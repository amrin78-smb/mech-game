using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using ScrapTitan.Battle;

namespace ScrapTitan.Editor
{
    /// <summary>
    /// Generates the Phase 1 battle scene. Hard rule 7 keeps a scene thin, and this one is
    /// thinner than most: a single BattleDirector, which builds the camera, the lighting, the
    /// ground, the Titan and every pool from src/data at Awake.
    ///
    /// Generated rather than hand-saved for the same reason the Phase 0 scene was: a scene
    /// file is the one thing in a Unity project a merge cannot sensibly resolve, and a
    /// generated one can be rebuilt by anyone with one command.
    /// </summary>
    public static class BattleScene
    {
        public const string ScenePath = "Assets/_Game/Scenes/Battle.unity";

        [MenuItem("Scrap Titan/Rebuild the battle scene")]
        public static void Rebuild()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,
                                                      NewSceneMode.Single);

            GameObject director = new GameObject("Battle");
            director.AddComponent<BattleDirector>();

            EditorSceneManager.SaveScene(scene, ScenePath);
            SetAsOnlyBuildScene(ScenePath);
            Debug.Log($"Battle scene written to {ScenePath} and set as the build scene.");
        }

        private static void SetAsOnlyBuildScene(string path)
        {
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(path, true) };
        }

        /// <summary>
        /// Model import settings for everything under Resources/Models. The generated FBX
        /// files already carry the briefs' metre scale and Y-up orientation, so the importer
        /// must not add a correction of its own.
        /// </summary>
        public static void ApplyModelImportSettings()
        {
            foreach (string guid in AssetDatabase.FindAssets("t:Model", new[] { "Assets/_Game/Resources/Models" }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var importer = (ModelImporter)AssetImporter.GetAtPath(path);
                bool changed = false;

                if (!Mathf.Approximately(importer.globalScale, 1f)) { importer.globalScale = 1f; changed = true; }
                if (!importer.useFileScale) { importer.useFileScale = true; changed = true; }
                if (importer.importAnimation) { importer.importAnimation = false; changed = true; }
                // The briefs forbid rigs; nothing here is skinned.
                if (importer.animationType != ModelImporterAnimationType.None)
                {
                    importer.animationType = ModelImporterAnimationType.None;
                    changed = true;
                }
                if (importer.importCameras) { importer.importCameras = false; changed = true; }
                if (importer.importLights) { importer.importLights = false; changed = true; }
                // No colliders: the battle resolves hits by distance, not by physics.
                if (importer.addCollider) { importer.addCollider = false; changed = true; }
                if (importer.materialImportMode != ModelImporterMaterialImportMode.ImportStandard)
                {
                    importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
                    changed = true;
                }

                if (!changed) continue;
                importer.SaveAndReimport();
            }
        }
    }
}
