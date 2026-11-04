using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;

namespace ScrapTitan.Editor
{
    /// <summary>
    /// Android player settings and builds, driven from the command line through
    /// "unity build --execute-method". Every setting the APK depends on is applied here
    /// rather than clicked in the inspector, so a build cannot quietly depend on what
    /// somebody last left selected.
    /// </summary>
    public static class AndroidBuild
    {
        public const string ApplicationId = "com.scraptitan.game";
        public const string VulkanFilterPath = "Assets/_Game/Settings/VulkanDeviceFilters.asset";
        private const string DefaultOutputPath = "Builds/Android/ScrapTitan-dev.apk";

        /// <summary>A development APK: the Phase 0 scene, IL2CPP, both ABIs, release-signed.</summary>
        public static void Development()
        {
            ApplySettings();
            BuildApk(BuildOptions.Development);
        }

        /// <summary>The same build without the development flags, for anything handed out.</summary>
        public static void Release()
        {
            ApplySettings();
            BuildApk(BuildOptions.None);
        }

        /// <summary>Applies the settings and writes them to disk without building.</summary>
        public static void ApplySettingsOnly()
        {
            ApplySettings();
            AssetDatabase.SaveAssets();
            Debug.Log("[AndroidBuild] Player settings applied.");
        }

        private static void BuildApk(BuildOptions options)
        {
            string[] scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
            if (scenes.Length == 0)
                throw new Exception("No enabled scenes in the build settings. Run Phase0Scene.Rebuild first.");

            string outputPath = ArgValue("-buildOutput") ?? DefaultOutputPath;
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outputPath)));

            BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = outputPath,
                target = BuildTarget.Android,
                targetGroup = BuildTargetGroup.Android,
                options = options,
            });

            BuildSummary summary = report.summary;
            Debug.Log($"[AndroidBuild] {summary.result}: {outputPath}, {summary.totalSize} bytes, {summary.totalTime}");
            if (summary.result != BuildResult.Succeeded)
                throw new Exception($"Android build {summary.result} with {summary.totalErrors} errors.");
        }

        private static void ApplySettings()
        {
            PlayerSettings.productName = "Scrap Titan";
            PlayerSettings.companyName = "Nocvault";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, ApplicationId);

            PlayerSettings.bundleVersion = ArgValue("-appVersion") ?? PlayerSettings.bundleVersion;
            if (ArgValue("-versionCode") is string code) PlayerSettings.Android.bundleVersionCode = int.Parse(code);

            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetIl2CppCompilerConfiguration(NamedBuildTarget.Android, Il2CppCompilerConfiguration.Release);

            // Both ABIs: cheap phones still ship 32-bit Android builds and refuse a
            // 64-bit-only APK. The Redmi A3 is the one that has to work.
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64 | AndroidArchitecture.ARMv7;

            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel25;
            EditorUserBuildSettings.buildAppBundle = false;

            // Landscape only, either way up.
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;

            ApplyGraphicsApis();
            ApplySigning();
        }

        /// <summary>
        /// Vulkan first, OpenGL ES 3 behind it, and a device filter that denies Vulkan to
        /// PowerVR parts.
        ///
        /// Why: the Redmi A3's PowerVR GE8320 runs the first launch after installing and then
        /// closes on every launch after it, which is a Vulkan driver choking on the shader
        /// cache the first run wrote. Roar Rally hit exactly this. The filter sends those
        /// chips down the OpenGL ES path instead, and every other phone keeps Vulkan.
        ///
        /// This only ever shows on a second launch, so testing it means a full close and
        /// relaunch, not a fresh install.
        /// </summary>
        private static void ApplyGraphicsApis()
        {
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android,
                new[] { GraphicsDeviceType.Vulkan, GraphicsDeviceType.OpenGLES3 });
            PlayerSettings.Android.androidVulkanDeviceFilterListAsset = VulkanFilters();
        }

        /// <summary>Creates or updates the deny list asset, and returns it.</summary>
        public static VulkanDeviceFilterLists VulkanFilters()
        {
            VulkanDeviceFilterLists filters = AssetDatabase.LoadAssetAtPath<VulkanDeviceFilterLists>(VulkanFilterPath);
            if (filters == null)
            {
                if (!AssetDatabase.IsValidFolder("Assets/_Game/Settings"))
                    AssetDatabase.CreateFolder("Assets/_Game", "Settings");
                // Not a ScriptableObject, despite living in an .asset file, so it is
                // constructed rather than made with ScriptableObject.CreateInstance.
                filters = new VulkanDeviceFilterLists();
                AssetDatabase.CreateAsset(filters, VulkanFilterPath);
            }

            filters.vulkanDeviceDenyFilters = new[] { new VulkanDeviceFilterData { deviceName = ".*PowerVR.*" } };
            EditorUtility.SetDirty(filters);
            AssetDatabase.SaveAssets();
            return filters;
        }

        /// <summary>
        /// The device-name patterns currently denied Vulkan, or null when no filter list is
        /// assigned at all. Returned as plain strings so a test can check the Redmi A3 fix
        /// without having to reference the Android editor extension that defines the type.
        /// </summary>
        public static string[] VulkanDenyFilterNames()
        {
            VulkanDeviceFilterLists assigned = PlayerSettings.Android.androidVulkanDeviceFilterListAsset;
            if (assigned == null) return null;

            VulkanDeviceFilterData[] denied = assigned.vulkanDeviceDenyFilters;
            if (denied == null) return Array.Empty<string>();

            string[] names = new string[denied.Length];
            for (int i = 0; i < denied.Length; i++) names[i] = denied[i].deviceName;
            return names;
        }

        /// <summary>
        /// Signs with the release key when the environment points at one, and says loudly
        /// when it does not. The keystore and its passwords live outside the repository and
        /// are never read from a file in it.
        /// </summary>
        private static void ApplySigning()
        {
            string keystore = Environment.GetEnvironmentVariable("SCRAPTITAN_KEYSTORE");
            string keystorePass = Environment.GetEnvironmentVariable("SCRAPTITAN_KEYSTORE_PASS");
            string alias = Environment.GetEnvironmentVariable("SCRAPTITAN_KEY_ALIAS");
            string aliasPass = Environment.GetEnvironmentVariable("SCRAPTITAN_KEY_ALIAS_PASS");

            bool complete = !string.IsNullOrEmpty(keystore) && !string.IsNullOrEmpty(keystorePass)
                            && !string.IsNullOrEmpty(alias) && !string.IsNullOrEmpty(aliasPass);

            if (!complete)
            {
                PlayerSettings.Android.useCustomKeystore = false;
                Debug.LogWarning("[AndroidBuild] SCRAPTITAN_KEYSTORE* are not all set, so this APK is "
                                 + "signed with Unity's debug key. Fine for a local check; not what we hand out.");
                return;
            }

            if (!File.Exists(keystore))
                throw new FileNotFoundException($"SCRAPTITAN_KEYSTORE points at {keystore}, which does not exist.");

            if (keystore.StartsWith(Path.GetFullPath(RepoPaths.RepoRoot), StringComparison.Ordinal))
                throw new InvalidOperationException(
                    $"The keystore is inside the repository ({keystore}). Signing keys stay outside it.");

            PlayerSettings.Android.useCustomKeystore = true;
            PlayerSettings.Android.keystoreName = keystore;
            PlayerSettings.Android.keystorePass = keystorePass;
            PlayerSettings.Android.keyaliasName = alias;
            PlayerSettings.Android.keyaliasPass = aliasPass;
            Debug.Log($"[AndroidBuild] Signing with the release key, alias '{alias}'.");
        }

        private static string ArgValue(string flag)
        {
            string[] args = Environment.GetCommandLineArgs();
            int index = Array.IndexOf(args, flag);
            return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
        }
    }
}
