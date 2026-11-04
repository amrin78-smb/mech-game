using UnityEngine;
using ScrapTitan.Data;

namespace ScrapTitan.Battle
{
    /// <summary>
    /// Phase 1's readouts and the results screen, drawn with IMGUI.
    ///
    /// Deliberately the simplest thing that works: this is the grey-box phase, and a
    /// code-generated scene with no UI prefabs cannot lose a reference. It is replaced with a
    /// real canvas in Phase 2, along with the in-battle upgrade panel. Every label is built
    /// once per frame at worst and there are a handful of them, so it is not in the way of
    /// the 30 fps target on the Redmi.
    /// </summary>
    public sealed class BattleHud
    {
        private readonly BattleDirector battle;
        private readonly TuningDef tuning;
        private GUIStyle label;
        private GUIStyle big;
        private GUIStyle button;
        private Texture2D bar;

        /// <summary>Shared with the Phase 0 probe, so the count carries across builds.</summary>
        private const string LaunchCountKey = "scraptitan.phase0.launchCount";
        private int launchCount;

        public BattleHud(BattleDirector battle, TuningDef tuning)
        {
            this.battle = battle;
            this.tuning = tuning;
        }

        private void EnsureStyles()
        {
            if (label != null) return;
            int unit = Mathf.Max(Screen.height / 34, 11);
            label = new GUIStyle(GUI.skin.label) { fontSize = unit, fontStyle = FontStyle.Bold };
            label.normal.textColor = Color.white;
            big = new GUIStyle(label) { fontSize = unit * 2, alignment = TextAnchor.MiddleCenter };
            button = new GUIStyle(GUI.skin.button) { fontSize = unit };
            bar = new Texture2D(1, 1);
            bar.SetPixel(0, 0, Color.white);
            bar.Apply();
        }

        public void Draw()
        {
            EnsureStyles();
            float pad = Screen.height * 0.03f;
            float barWidth = Screen.width * 0.3f;
            float barHeight = Screen.height * 0.028f;

            // Hull.
            Rect hull = new Rect(pad, pad, barWidth, barHeight);
            Titan titan = battle.PlayerTitan;
            DrawBar(hull, titan.HullFraction, new Color(0.18f, 0.72f, 0.68f));
            GUI.Label(new Rect(pad, pad + barHeight, barWidth, barHeight * 1.6f),
                      $"HULL {Mathf.CeilToInt(titan.Hull)} / {Mathf.CeilToInt(titan.HullMax)}", label);

            // Wave progress.
            Rect wave = new Rect(Screen.width - pad - barWidth, pad, barWidth, barHeight);
            DrawBar(wave, battle.Spawner.Progress, new Color(0.91f, 0.72f, 0.16f));
            GUI.Label(new Rect(Screen.width - pad - barWidth, pad + barHeight, barWidth,
                               barHeight * 1.6f),
                      $"WAVES  {battle.Spawner.AliveCount} on field", label);

            // Scrap and the weapon, bottom left, clear of the drag area's middle.
            GUI.Label(new Rect(pad, Screen.height - pad - barHeight * 2.4f, barWidth * 1.4f,
                               barHeight * 2.4f),
                      $"SCRAP {battle.Economy.Balance}    {battle.Weapon.WeaponName}"
                      + (battle.Weapon.IsManualAiming ? "   MANUAL" : ""), label);

            if (battle.Targeting.FocusTarget != null)
                GUI.Label(new Rect(Screen.width * 0.5f - barWidth * 0.5f, pad, barWidth,
                                   barHeight * 1.6f), "FOCUS LOCKED", label);

            DrawDeviceLine(pad);

            if (battle.BattleOver) DrawResults();
        }

        /// <summary>
        /// The one line from the Phase 0 probe screen worth keeping, now that the battle
        /// scene is the only scene in the build: the graphics API in use and how many times
        /// the app has been launched. The Redmi A3's PowerVR fault only shows from the second
        /// launch, so a playtest needs both numbers visible without a separate build.
        /// </summary>
        private void DrawDeviceLine(float pad)
        {
            if (launchCount == 0)
            {
                launchCount = PlayerPrefs.GetInt(LaunchCountKey, 0) + 1;
                PlayerPrefs.SetInt(LaunchCountKey, launchCount);
                PlayerPrefs.Save();
            }
            GUI.Label(
                new Rect(Screen.width * 0.5f, Screen.height - pad - label.fontSize * 1.4f,
                         Screen.width * 0.5f - pad, label.fontSize * 1.6f),
                $"{SystemInfo.graphicsDeviceType}   launch #{launchCount}   "
                + $"{Mathf.RoundToInt(1f / Mathf.Max(Time.smoothDeltaTime, 0.0001f))} fps",
                label);
        }

        private void DrawBar(Rect rect, float fill, Color colour)
        {
            Color was = GUI.color;
            GUI.color = new Color(0f, 0f, 0f, 0.55f);
            GUI.DrawTexture(rect, bar);
            GUI.color = colour;
            GUI.DrawTexture(new Rect(rect.x, rect.y, rect.width * Mathf.Clamp01(fill), rect.height),
                            bar);
            GUI.color = was;
        }

        /// <summary>The results screen, with retry. The plan asks Phase 1 for exactly this.</summary>
        private void DrawResults()
        {
            BattleResult r = battle.Result;
            float w = Screen.width * 0.52f;
            float h = Screen.height * 0.56f;
            Rect panel = new Rect((Screen.width - w) * 0.5f, (Screen.height - h) * 0.5f, w, h);

            Color was = GUI.color;
            GUI.color = new Color(0.06f, 0.06f, 0.07f, 0.92f);
            GUI.DrawTexture(panel, bar);
            GUI.color = was;

            float line = h * 0.1f;
            float y = panel.y + line * 0.4f;
            GUI.Label(new Rect(panel.x, y, w, line), r.won ? "ZONE HELD" : "TITAN DOWN", big);
            y += line * 1.6f;

            string stars = r.won ? new string('*', r.stars).PadRight(3, '-') : "---";
            foreach (string row in new[]
            {
                $"STARS           {stars}",
                $"SCRAP EARNED    {r.scrapEarned}",
                $"RAIDERS KILLED  {r.enemiesKilled}",
                $"GOT PAST        {r.enemiesEscaped}",
                $"HULL LEFT       {Mathf.CeilToInt(r.hullRemaining)} / {Mathf.CeilToInt(r.hullMax)}",
                $"TIME            {r.durationSeconds:0.0}s",
            })
            {
                GUI.Label(new Rect(panel.x + w * 0.12f, y, w, line), row, label);
                y += line * 0.82f;
            }

            Rect retry = new Rect(panel.x + w * 0.25f, panel.yMax - line * 1.5f, w * 0.5f, line);
            if (GUI.Button(retry, "RETRY", button)) battle.Retry();
        }
    }
}
