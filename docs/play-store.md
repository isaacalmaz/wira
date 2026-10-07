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

## Account deletion (Play "Data deletion" form)
- In-app: customer app Profile → "Hapus Akun"; Wira Mitra Settings → "Hapus Akun".
- Web URL for the form: https://wira.one/hapus-akun (partners sign in there with their Wira Mitra email).
- Needs migration 0106 (`delete_my_account`). Deleted: profile, contact data, photos, saved
  addresses, partner ID/licence photos; listings suspended. Kept: orders, payments, reviews (anonymised).
- After a deletion, admins find stored files to remove in `account_deletions.files_to_purge`.

## Reviewer test accounts (Play "App access")
Google's reviewers must sign in. Create two dedicated accounts — never a real customer's or your own:
1. **Wira:** register at https://wira.one/register with a new email (e.g. `wira.reviewer+user@gmail.com`
   style, an inbox you control) and a long random password.
2. **Wira Mitra:** register at https://mitra.wira.one/register as a **driver** with another new email,
   then approve it in Admin → Mitra. Leave it offline; reviewers only need to see the screens.
3. In Play Console → App content → App access → "All or some functionality is restricted", add each
   email + password and a one-line note, e.g. "Sign in with the details below. Orders need a real
   partner nearby, so the order screens can be viewed but not completed."
4. Keep both accounts free of real data, and don't delete them while the app is in review.
