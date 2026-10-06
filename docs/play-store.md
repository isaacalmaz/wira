# Google Play release

Apps on Play: **Wira** (`com.wira.user`) and **Wira Mitra** (`com.wira.mitra`). The admin app stays off Play.

## Upload key
- Keystore: `~/wira-keys/wira-upload.jks` (alias `wira-upload`), passwords in `~/wira-keys/keystore.properties`.
- Both are outside git. Back the folder up (e.g. a private drive). With Play App Signing this is only the
  *upload* key: if lost, Google can reset it, but that takes days.
- Each `frontend-*/android/keystore.properties` is a copy of the file above (gitignored). Without it,
  release builds are unsigned.

## Build an AAB
```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd frontend-user && npm run build && npx cap sync android && (cd android && ./gradlew bundleRelease)
# output: frontend-user/android/app/build/outputs/bundle/release/app-release.aab
```
Same for `frontend-mitra`. Bump `versionCode` (+1) and `versionName` in `android/app/build.gradle` for every upload.

## Requirements
- targetSdk 36 (Play rule for new apps since 31 Aug 2026). Android 15+ is edge-to-edge, so
  `MainActivity` pads the WebView for system bars / keyboard.
- Privacy policy URL: https://wira.one/privacy
