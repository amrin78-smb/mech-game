using System.Linq;
using NUnit.Framework;
using ScrapTitan.Editor;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine.Rendering;

namespace ScrapTitan.Tests
{
    /// <summary>
    /// The Android settings the plan commits to, as tests rather than as something somebody
    /// has to remember to check in the inspector.
    ///
    /// The Vulkan deny filter matters most. Without it the Redmi A3 runs once after
    /// installing and then closes on every later launch, and because it only shows on the
    /// second launch it is exactly the kind of setting that gets lost in a merge and is not
    /// noticed for weeks.
    ///
    /// Applying the settings is the setup step, so running the suite also repairs them.
    /// </summary>
    public sealed class AndroidSettingsTests
    {
        [OneTimeSetUp]
        public void ApplyBuildSettings() => AndroidBuild.ApplySettingsOnly();

        [Test]
        public void TheApplicationIdAndNameAreOurs()
        {
            Assert.That(PlayerSettings.GetApplicationIdentifier(NamedBuildTarget.Android),
                        Is.EqualTo(AndroidBuild.ApplicationId));
            Assert.That(PlayerSettings.productName, Is.EqualTo("Scrap Titan"));
        }

        [Test]
        public void TheScriptingBackendIsIl2Cpp()
        {
            Assert.That(PlayerSettings.GetScriptingBackend(NamedBuildTarget.Android),
                        Is.EqualTo(ScriptingImplementation.IL2CPP));
        }

        [Test]
        public void BothArchitecturesAreBuilt()
        {
            // ARMv7 as well as ARM64: a 64-bit-only APK is refused by phones still running a
            // 32-bit Android, and the Redmi A3 is one of the phones this has to install on.
            AndroidArchitecture target = PlayerSettings.Android.targetArchitectures;
            Assert.That(target.HasFlag(AndroidArchitecture.ARM64), Is.True, "ARM64 missing");
            Assert.That(target.HasFlag(AndroidArchitecture.ARMv7), Is.True, "ARMv7 missing");
        }

        [Test]
        public void TheGraphicsApisAreVulkanThenOpenGles3()
        {
            Assert.That(PlayerSettings.GetUseDefaultGraphicsAPIs(BuildTarget.Android), Is.False,
                        "the API list has to be explicit, or Unity picks its own order");

            GraphicsDeviceType[] apis = PlayerSettings.GetGraphicsAPIs(BuildTarget.Android);
            Assert.That(apis, Is.EqualTo(new[] { GraphicsDeviceType.Vulkan, GraphicsDeviceType.OpenGLES3 }));
        }

        [Test]
        public void PowerVrChipsAreDeniedVulkan()
        {
            string[] denied = AndroidBuild.VulkanDenyFilterNames();
            Assert.That(denied, Is.Not.Null, "no Vulkan device filter list assigned in Player Settings");
            Assert.That(denied, Contains.Item(".*PowerVR.*"),
                        "the PowerVR deny filter is the Redmi A3 relaunch fix; it must stay");
        }

        [Test]
        public void TheGameIsLandscapeOnly()
        {
            Assert.That(PlayerSettings.allowedAutorotateToLandscapeLeft, Is.True);
            Assert.That(PlayerSettings.allowedAutorotateToLandscapeRight, Is.True);
            Assert.That(PlayerSettings.allowedAutorotateToPortrait, Is.False);
            Assert.That(PlayerSettings.allowedAutorotateToPortraitUpsideDown, Is.False);
        }

        [Test]
        public void TheBuildIsAnApkNotAnAppBundle()
        {
            // The deliverable is an APK the owner installs directly, not a Play Store bundle.
            Assert.That(EditorUserBuildSettings.buildAppBundle, Is.False);
        }

        [Test]
        public void ThereIsExactlyOneSceneInTheBuildAndItIsOurs()
        {
            EditorBuildSettingsScene[] enabled = EditorBuildSettings.scenes.Where(s => s.enabled).ToArray();
            Assert.That(enabled, Has.Length.EqualTo(1), "Phase 0 ships one scene");
            Assert.That(enabled[0].path, Is.EqualTo(BattleScene.ScenePath));
        }
    }
}
