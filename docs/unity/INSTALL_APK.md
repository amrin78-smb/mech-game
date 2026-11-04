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
