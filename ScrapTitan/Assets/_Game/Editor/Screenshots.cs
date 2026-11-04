using System.Globalization;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using ScrapTitan.Battle;

namespace ScrapTitan.Editor
{
    /// <summary>
    /// Renders frames of the running battle to PNG files, headlessly.
    ///
    /// The model rules say a model is judged from frames of the running game rather than from
    /// a render or a measurement. Without this that meant building an APK, installing it and
    /// holding a phone, so it only happened at a playtest. The battle is built and ticked by
    /// code, so the editor can stand one up outside play mode, run it forward and photograph
    /// it. Needs a graphics device, so it runs under xvfb rather than -nographics.
    /// </summary>
    public static class Screenshots
    {
        private const int Width = 1280;
        private const int Height = 720;

        /// <summary>
        /// Moments worth looking at: the Titan alone, the first contact, the middle of a
        /// wave, and the pincer at 45 seconds where two lanes come at once.
        /// </summary>
        private static readonly float[] Moments = { 0.5f, 5f, 18f, 32f, 47f, 70f, 95f };

        [MenuItem("Scrap Titan/Capture battle frames")]
        public static void CaptureBattle()
        {
            string outDir = Path.Combine(RepoPaths.RepoRoot, "Logs", "frames");
            Directory.CreateDirectory(outDir);

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var director = new GameObject("Battle").AddComponent<BattleDirector>();
            director.Build();

            DumpLayout(director);

            // A fixed step, so the frames are the same every run and a change in them means a
            // change in the game rather than a change in the frame rate.
            const float step = 1f / 60f;
            float now = 0f;
            int shot = 0;

            foreach (float at in Moments)
            {
                while (now < at)
                {
                    director.Tick(step, readInput: false);
                    now += step;
                }
                string path = Path.Combine(outDir,
                    $"battle_{shot:00}_t{at.ToString("00.0", CultureInfo.InvariantCulture)}s.png");
                Capture(director.View, path);
                Debug.Log($"[Screenshots] {path}  "
                          + $"enemies={director.Spawner.AliveCount} "
                          + $"hull={director.PlayerTitan.Hull:0} "
                          + $"killed={director.Killed} scrap={director.Economy.Balance}");
                shot++;
            }

            // Again at the end, because a part can be in the right place when the battle is
            // built and in the wrong one once it has been animated for a while.
            DumpLayout(director);
            BattleResult r = director.Result;
            Debug.Log($"[Screenshots] outcome: over={director.BattleOver} won={r.won} "
                      + $"stars={r.stars} killed={r.enemiesKilled} past={r.enemiesEscaped} "
                      + $"hull={r.hullRemaining:0}/{r.hullMax:0} time={r.durationSeconds:0.0}s");
            Debug.Log($"[Screenshots] {shot} frames in {outDir}");
        }

        /// <summary>A close look at one model, lit by the battle's own light.</summary>
        [MenuItem("Scrap Titan/Capture model portraits")]
        public static void CaptureModels()
        {
            string outDir = Path.Combine(RepoPaths.RepoRoot, "Logs", "frames");
            Directory.CreateDirectory(outDir);
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            GameObject lightGo = new GameObject("Light");
            Light light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(1f, 0.93f, 0.82f);
            light.intensity = 1.5f;
            // Keyed from the camera's side. The battle's own light comes across the lane,
            // which from a portrait camera is from behind and leaves the model a silhouette.
            lightGo.transform.rotation = Quaternion.Euler(35f, -140f, 0f);
            GameObject fillGo = new GameObject("Fill");
            Light fill = fillGo.AddComponent<Light>();
            fill.type = LightType.Directional;
            fill.color = new Color(0.55f, 0.6f, 0.7f);
            fill.intensity = 0.5f;
            fillGo.transform.rotation = Quaternion.Euler(10f, -20f, 0f);

            GameObject camGo = new GameObject("PortraitCamera");
            Camera cam = camGo.AddComponent<Camera>();
            cam.orthographic = true;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.16f, 0.15f, 0.14f);

            foreach (string assetId in new[]
            {
                "titan_chassis", "titan_cannon_autocannon", "enemy_rustcrawler",
                "pickup_scrap", "env_rust_flats_ground",
            })
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(
                    $"Assets/_Game/Resources/Models/{assetId}.fbx");
                if (prefab == null) continue;
                GameObject instance = Object.Instantiate(prefab);
                Bounds bounds = ModelLibrary.WorldBounds(instance);

                // The briefs' own camera: side on, 12 degrees above.
                cam.orthographicSize = Mathf.Max(bounds.extents.y, bounds.extents.x) * 1.25f;
                camGo.transform.rotation = Quaternion.Euler(12f, -90f, 0f);
                camGo.transform.position = bounds.center
                                           - camGo.transform.forward * (bounds.size.magnitude + 20f);
                // Keyed off the camera, so the lit side is the side being photographed. A
                // fixed world direction left every portrait a silhouette.
                lightGo.transform.rotation = camGo.transform.rotation * Quaternion.Euler(28f, -32f, 0f);
                fillGo.transform.rotation = camGo.transform.rotation * Quaternion.Euler(-12f, 46f, 0f);

                Capture(cam, Path.Combine(outDir, $"model_{assetId}.png"));
                Debug.Log($"[Screenshots] model_{assetId}.png  size={bounds.size}");
                Object.DestroyImmediate(instance);
            }
        }

        /// <summary>
        /// Where everything actually ended up, and where that lands on screen. A frame shows
        /// that something is wrong; this says what.
        /// </summary>
        private static void DumpLayout(BattleDirector director)
        {
            Camera cam = director.View;
            var sb = new System.Text.StringBuilder();
            sb.AppendLine($"[Layout] camera pos {cam.transform.position:F2} "
                          + $"rot {cam.transform.eulerAngles:F1} ortho {cam.orthographicSize} "
                          + $"aspect {cam.aspect:F3} pixelRect {cam.pixelRect}");

            foreach (Transform t in director.transform.GetComponentsInChildren<Transform>(true))
            {
                if (!t.TryGetComponent(out Renderer r)) continue;
                if (t.name.StartsWith("Ground_L") || t.name.StartsWith("Shell_")
                    || t.name.StartsWith("Scrap_") || t.name.StartsWith("Enemy_")) continue;
                Vector3 screen = cam.WorldToScreenPoint(r.bounds.center);
                sb.AppendLine($"[Layout] {t.name,-26} world {r.bounds.center:F2} "
                              + $"size {r.bounds.size:F2} screen ({screen.x:F0},{screen.y:F0})");
            }
            Debug.Log(sb.ToString());
        }

        private static void Capture(Camera camera, string path)
        {
            // No MSAA on the target: URP blits its own 4x buffer into this one, and a
            // mismatch there fails the blit and leaves the texture black, which is exactly
            // how the first frames came out.
            RenderTexture target = new RenderTexture(Width, Height, 24, RenderTextureFormat.ARGB32)
            {
                antiAliasing = 1,
            };
            RenderTexture previousTarget = camera.targetTexture;
            RenderTexture previousActive = RenderTexture.active;

            // In batch mode the "screen" is whatever the virtual display is, so the camera's
            // aspect does not follow the texture by itself. Left alone it framed 48 metres
            // across instead of 64 and pushed the Titan off the side.
            float previousAspect = camera.aspect;
            camera.targetTexture = target;
            camera.aspect = Width / (float)Height;
            camera.Render();

            RenderTexture.active = target;
            Texture2D image = new Texture2D(Width, Height, TextureFormat.RGB24, false);
            image.ReadPixels(new Rect(0, 0, Width, Height), 0, 0);
            image.Apply();

            File.WriteAllBytes(path, image.EncodeToPNG());

            camera.targetTexture = previousTarget;
            camera.aspect = previousAspect;
            RenderTexture.active = previousActive;
            Object.DestroyImmediate(image);
            target.Release();
            Object.DestroyImmediate(target);
        }
    }
}
