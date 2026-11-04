using System.Text;
using ScrapTitan.Data;
using UnityEngine;

namespace ScrapTitan.Boot
{
    /// <summary>
    /// The whole of the Phase 0 APK. It exists to answer three questions on a real phone that
    /// no desktop run can answer:
    ///
    ///  1. does the app start at all, with IL2CPP on this architecture;
    ///  2. did the content load from Resources on the device, not just in the editor;
    ///  3. does it still start after a full close and relaunch, which is the Redmi A3's
    ///     PowerVR-plus-Vulkan failure and only shows on the second launch.
    ///
    /// The launch counter is the point of (3): the number on screen must go up each time the
    /// app is fully closed and reopened. Drawn with IMGUI on purpose, so it needs no canvas,
    /// font asset or UI package and cannot itself be the thing that breaks.
    /// </summary>
    public sealed class Phase0Probe : MonoBehaviour
    {
        private const string LaunchCountKey = "scraptitan.phase0.launchCount";

        private string report = "loading";
        private bool loaded;
        private int launchCount;

        private void Awake()
        {
            Application.targetFrameRate = 60;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;

            launchCount = PlayerPrefs.GetInt(LaunchCountKey, 0) + 1;
            PlayerPrefs.SetInt(LaunchCountKey, launchCount);
            PlayerPrefs.Save();

            report = BuildReport();
        }

        private string BuildReport()
        {
            StringBuilder sb = new();
            sb.AppendLine("SCRAP TITAN  Phase 0");
            sb.AppendLine();
            sb.AppendLine($"app version   {Application.version}");
            sb.AppendLine($"unity         {Application.unityVersion}");
            sb.AppendLine($"device        {SystemInfo.deviceModel}");
            sb.AppendLine($"graphics api  {SystemInfo.graphicsDeviceType}");
            sb.AppendLine($"gpu           {SystemInfo.graphicsDeviceName}");
            sb.AppendLine($"abi           {(IntPtrSize == 8 ? "64-bit" : "32-bit")}");
            sb.AppendLine($"screen        {Screen.width}x{Screen.height} @{Screen.dpi:0}dpi");
            sb.AppendLine();
            sb.AppendLine($"LAUNCH #{launchCount}   (close fully and reopen: this must rise)");
            sb.AppendLine();

            try
            {
                GameDatabase db = GameDatabase.Instance;
                loaded = true;
                sb.AppendLine("content loaded from Resources:");
                sb.AppendLine($"  enemies {db.enemies.Length}   weapons {db.weapons.Length}   "
                              + $"pilots {db.pilots.Length}   escorts {db.escorts.Length}");
                sb.AppendLine($"  levels  {db.levels.Length}");
                sb.AppendLine($"  src/data at {Shorten(db.importedFromRevision)}");

                // Reads right through the data to prove it survived serialisation, rather than
                // only that the arrays are the right length.
                EnemyDef first = db.enemies.Length > 0 ? db.enemies[0] : null;
                if (first != null)
                {
                    sb.AppendLine($"  first enemy: {first.displayName} "
                                  + $"({first.armorClass}, {first.hp} hp, {first.behaviors.Length} behaviours)");
                }

                if (db.tuning != null)
                {
                    float vsLight = db.tuning.damageMatrix.Multiplier(DamageType.Kinetic, ArmorClass.Light);
                    sb.AppendLine($"  tuning: hull {db.tuning.mecha.baseHullHp} hp, "
                                  + $"kinetic vs light {vsLight:0.##}x");
                }
            }
            catch (System.Exception e)
            {
                loaded = false;
                sb.AppendLine("CONTENT FAILED TO LOAD:");
                sb.AppendLine(e.Message);
            }

            return sb.ToString();
        }

        private static int IntPtrSize => System.IntPtr.Size;

        private static string Shorten(string revision)
            => string.IsNullOrEmpty(revision) ? "unknown"
               : revision.Length > 10 ? revision.Substring(0, 10) : revision;

        private void OnGUI()
        {
            // Scaled off screen height so the text is readable on a phone and on a desktop run.
            int fontSize = Mathf.Max(12, Mathf.RoundToInt(Screen.height / 34f));
            GUIStyle style = new(GUI.skin.label)
            {
                fontSize = fontSize,
                wordWrap = true,
                alignment = TextAnchor.UpperLeft,
            };
            style.normal.textColor = loaded ? new Color(0.72f, 0.95f, 0.93f) : new Color(1f, 0.55f, 0.45f);

            float margin = Screen.width * 0.05f;
            GUI.Label(new Rect(margin, margin, Screen.width - margin * 2f, Screen.height - margin * 2f),
                      report, style);
        }
    }
}
