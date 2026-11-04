using System.IO;
using UnityEngine;

namespace ScrapTitan.Editor
{
    /// <summary>
    /// Where the Phaser build's data lives. The Unity project sits at &lt;repo&gt;/ScrapTitan,
    /// and src/data stays the single source of truth for content until the Phaser version is
    /// archived, so nothing is copied into Assets and there is no second copy to drift.
    /// </summary>
    public static class RepoPaths
    {
        /// <summary>The repository root, found by walking up until src/data/schemas appears.</summary>
        public static string RepoRoot
        {
            get
            {
                DirectoryInfo dir = new DirectoryInfo(Application.dataPath);
                while (dir != null)
                {
                    if (Directory.Exists(Path.Combine(dir.FullName, "src", "data", "schemas")))
                        return dir.FullName;
                    dir = dir.Parent;
                }
                throw new DirectoryNotFoundException(
                    $"Walked up from {Application.dataPath} without finding src/data/schemas. "
                    + "The Unity project is expected to sit inside the mech-game repository.");
            }
        }

        public static string DataDir => Path.Combine(RepoRoot, "src", "data");

        public static string SchemaDir => Path.Combine(DataDir, "schemas");

        public static string LevelsDir => Path.Combine(DataDir, "levels");

        public static string DataFile(string name) => Path.Combine(DataDir, name);

        public static string SchemaFile(string name) => Path.Combine(SchemaDir, name);

        /// <summary>level-01.json ... level-20.json, in order.</summary>
        public static string[] LevelFiles()
        {
            string[] files = Directory.GetFiles(LevelsDir, "level-*.json");
            System.Array.Sort(files, System.StringComparer.Ordinal);
            return files;
        }
    }
}
