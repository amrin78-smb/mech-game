# Installing a Scrap Titan test APK

Every phase ends with an APK published as a GitHub **pre-release** on
`amrin78-smb/mech-game`, tagged `demo-x.y.z`. Nothing but the APK is in the release; the tag
sits on an empty commit.

Test phones: **Samsung Galaxy S25 Ultra** and **Redmi A3**. Both have to be tested, and the
Redmi has to be tested a particular way (see below).

## Getting it onto the phone

### From the phone itself (easiest)

1. Open the release page on the phone and download the `.apk`.
2. Chrome will warn about the file type. Accept the download.
3. Tap the downloaded file. Android asks to allow installing unknown apps from Chrome (or
   from Files) the first time; allow it. On the Redmi this is **Settings > Apps > Special app
   access > Install unknown apps**; on the Samsung, **Settings > Apps > Special access >
   Install unknown apps**.
4. Install. Play Protect may say it does not recognise the developer, which is expected for
   an app signed with our own key and never published. Choose **Install anyway**.

### From this computer over USB

With the phone's USB debugging turned on (**Settings > About phone**, tap *Build number*
seven times, then **Settings > Developer options > USB debugging**):

```
adb devices                 # the phone should be listed; accept the prompt on its screen
adb install -r ScrapTitan-0.0.1.apk
```

`-r` reinstalls over an existing copy, keeping its data.

## Testing it, from Phase 0 on

Scrap Titan is signed with our own release key, not a debug key, so **an upgrade installs
over the old one**. If Android ever refuses with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, an
older debug-signed build is still on the phone: uninstall Scrap Titan and install again.

### Both phones

- It starts, and shows its screen the right way round in landscape.
- Nothing is cut off by the notch or the rounded corners.

### The Redmi A3, the important one

The Redmi A3's PowerVR GE8320 has a Vulkan driver that chokes on the shader cache Unity
writes on the first run. The symptom is nasty: the app works perfectly the first time and
then closes immediately on **every later launch**. Roar Rally hit exactly this.

The build denies Vulkan to PowerVR chips, so it should take the OpenGL ES path instead. That
fix is only proved one way:

1. Install and open the app. Note what it says.
2. **Close it completely** — swipe it away from the recent apps list, do not just press home.
3. Open it again. **And a third time.**

A fresh install proves nothing here. If launch 2 or 3 fails, say so: it means the filter is
not taking effect and it has to be fixed before anything is built on top of it.

The Phase 0 APK shows a **LAUNCH #n** counter for exactly this reason. The number must go up
each time, and the `graphics api` line says which path the phone actually took. On the Redmi
that line should read `OpenGLES3`; on the Samsung, `Vulkan`.

## What to look at in `demo-0.2.0` (Phase 1)

This is the first build with gameplay. It opens straight into level-01, First Contact.

**It plays itself.** Every weapon auto fires, so the level can be won without touching the
screen. That is intended: the drag is an override, not the only control.

1. **Drag anywhere on the lower half of the screen** and release. Auto fire pauses, an aim
   point follows your finger above where it is touching, and releasing fires one precision
   shot at 1.5x damage. Auto fire comes back 0.8 s later.
2. **Tap a raider** to focus every weapon on it. Tap it again to let go. The readout says
   FOCUS LOCKED while one is held.
3. **Watch the three lanes.** They are separated in depth and the ground steps up behind,
   which is the thing most worth your opinion: is a raider in the far lane clearly in a
   different lane from one in the near lane, at arm's length, on each phone?
4. **Let one through on purpose.** Stop shooting a lane and let a Rustcrawler reach the
   Titan. The hull bar top left should start dropping.
5. **Lose on purpose** if you have the patience, or **win** and use RETRY on the results
   screen. The level takes about 82 s to clear.

The bottom-right line still carries the Phase 0 readouts: the graphics API, the launch
counter and the frame rate.

- On the **Redmi A3** it must say `OpenGLES3`, and the launch counter must keep going up
  across full closes. The frame rate is the number that matters for the Phase 1 target of 30.
- On the **S25 Ultra** it should say `Vulkan`.

**The Redmi relaunch test still applies and is still the one that matters.** Open it, swipe
it away from recent apps, open it again, three times. A fresh install proves nothing.
