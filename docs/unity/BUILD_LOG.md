# Build log

One entry per APK built. Each records the Unity version, what was in it, how it was signed,
its size and SHA-256, and — separately — what was actually tested on a phone and what was
not. "Built" and "works on the phone" are kept apart on purpose: only the owner's playtest
can move something into the second column.

## 2026-11-04: Phase 0 setup, `demo-0.0.1`

| Item | Value |
|---|---|
| Unity | 6000.3.27f2, URP 17.3.0 |
| Contents | The Phase 0 probe screen only. No gameplay |
| Build type | Development, IL2CPP (Release config), ARM64 + ARMv7, APK |
| Package | `com.scraptitan.game`, label "Scrap Titan", versionName 0.0.1, versionCode 1 |
| SDK | min 25, target 36, compiled against 36 |
| Orientation | `sensorLandscape` (11) |
| Graphics APIs | Vulkan, then OpenGL ES 3. Vulkan denied to `.*PowerVR.*` |
| Signing | Our release key (`CN=Scrap Titan, OU=Nocvault`), APK Signature Scheme v2. `apksigner verify` passes |
| ABIs in the APK | `lib/arm64-v8a` and `lib/armeabi-v7a`, both confirmed present |
| Size | 79,146,827 bytes (76 MB) |
| SHA-256 | `6927b4bc930ee7016127554a1b5af879277ef4f4fc82be1a8ec841aff16a2549` |
| Build time | 17 min 38 s (first build on this machine: shader and IL2CPP compilation) |
| Data | 49 assets generated from `src/data`: 17 enemies, 6 weapons, 2 pilots, 2 escorts, 20 levels, tuning, database |
| Tests | 23/23 EditMode passing |
| Published | GitHub pre-release `demo-0.0.1`, APK only, tag on an empty-tree commit. Downloaded back and the SHA-256 matches |
| Tested on a phone | **Not yet. Nothing here is known to work on the S25 Ultra or the Redmi A3.** |

Notes:

- GitHub returned a 502 on the step that publishes the release, after the 75 MB asset had
  uploaded fully, leaving a draft that `gh`'s own cleanup then failed to remove. The release
  was published with a `PATCH`. `scripts/release-apk.sh` now creates the draft and publishes
  it as separate steps, checks the uploaded size against the local file, and retries only the
  cheap publish call.
- `BuildReport.summary.totalSize` reported 1,006,969,979 bytes. That is the uncompressed
  build artifacts, not the APK, which is 76 MB. Do not log the former as the APK size.
- A relative `-buildOutput` is resolved against the editor's working directory, which is the
  repository root rather than the Unity project, so the first APK appeared in `./Builds`.
  The script now passes an absolute path.
