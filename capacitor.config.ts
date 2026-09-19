import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android wrap for the static Vite build (Phase 4).
 *
 * The game is a plain web build, so Capacitor only needs to point at `dist`.
 * No Capacitor plugin APIs are imported by the game, which keeps the browser
 * bundle identical between the web and Android builds.
 *
 * First time setup, run once:
 *   npm run build
 *   npx cap add android
 * Then after every change:
 *   npm run android:sync     # build + copy into the native project
 *   npm run android:open     # open Android Studio to run or package
 */
const config: CapacitorConfig = {
  appId: 'com.scraptitan.game',
  appName: 'Scrap Titan',
  webDir: 'dist',
  android: {
    // The game draws its own background; a black shell avoids a white flash.
    backgroundColor: '#1a1512',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
