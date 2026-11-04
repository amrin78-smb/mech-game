using System.IO;
using ScrapTitan.Boot;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ScrapTitan.Editor
{
    /// <summary>
    /// Generates the Phase 0 scene rather than keeping a hand-edited .unity file for it. The
    /// scene holds a camera and the probe and nothing else, so generating it keeps it honest
    /// and makes it obvious that Phase 1 replaces it rather than building on it.
    /// </summary>
    public static class Phase0Scene
    {
        public const string ScenePath = "Assets/_Game/Scenes/Phase0Hello.unity";

        [MenuItem("Scrap Titan/Rebuild the Phase 0 scene")]
        public static void Rebuild()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            GameObject cameraObject = new("Main Camera");
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.07f, 0.08f, 0.09f);
            camera.orthographic = true;
            cameraObject.tag = "MainCamera";

            GameObject probe = new("Phase0Probe");
            probe.AddComponent<Phase0Probe>();

            bool saved = EditorSceneManager.SaveScene(scene, ScenePath);
            if (!saved) throw new System.Exception($"Could not save {ScenePath}.");

            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            Debug.Log($"[Phase0Scene] Wrote {ScenePath} and made it the only scene in the build.");
        }
    }
}
