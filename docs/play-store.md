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

## Updates once the apps are on Play
- Screens (web code) still update themselves through the live bundle — Play allows JavaScript
  updates inside the WebView.
- Native changes need a new AAB: bump `versionCode`/`versionName`, build, upload to Play.
- Admin → Rilis Aplikasi still works: builds from Play (versionCode ≥ 3) are sent to their Play Store
  page, older sideloaded APKs to wira.one/install (Play forbids a Play app from installing APKs).
- When the Play listing is public, point wira.one/install at the Play Store instead of APK files: an
  APK signed with our key cannot be updated by Play (Play re-signs with its own key).

## Play Console answers (App content)
**Privacy policy:** https://wira.one/privacy · **Data deletion URL:** https://wira.one/hapus-akun
**Ads:** No ads. **Target audience:** Wira → 18 and over. Wira Mitra → 18 and over (partners confirm 18+ when registering). **News app:** No. **Government app:** No.
**Health:** None (WiraAsuh allergy notes are declared under Data safety, not as a health app). **Financial features:** WiraPay balance (top-up by QRIS, pay for services) — tick
"Digital wallet / mobile payments" only while WiraPay exists; untick if it is removed.
**Content rating (IARC):** category "All other app types"; no violence, sexuality, language, drugs,
gambling; *Users can interact / exchange messages:* Yes (chat with partner); *Shares user location
with other users:* Yes (during an order); *Digital purchases:* No.
**Category:** Wira → Travel & Local · Wira Mitra → Business.

### Data safety — Wira (com.wira.user)
Collects data: Yes · Shares data: No (service providers and the partner serving an order the user
placed do not count as sharing) · Encrypted in transit: Yes · Users can request deletion: Yes.
| Data type | Collected | Optional? | Purpose |
|---|---|---|---|
| Location: precise + approximate | Yes | Required | App functionality |
| Personal info: name, email, phone, address | Yes | Required (address optional) | App functionality, Account management |
| Financial info: purchase history | Yes | Required | App functionality |
| Messages: other in-app messages (chat) | Yes | Optional | App functionality |
| Photos | Yes | Optional (profile, chat, review) | App functionality |
| App activity: other user-generated content (reviews) | Yes | Optional | App functionality |
| Device or other IDs (push token) | Yes | Required | App functionality (notifications) |
| Personal info: other info (WiraAsuh: child's nickname and age) | Yes | Optional (only when booking WiraAsuh) | App functionality |
| Health and fitness: health info (WiraAsuh notes: allergies, medication) | Yes | Optional | App functionality |

### Data safety — Wira Mitra (com.wira.mitra)
Same as Wira, plus:
| Data type | Collected | Optional? | Purpose |
|---|---|---|---|
| Personal info: other info (ID card, selfie, driving licence, vehicle) | Yes | Required | Account management, Fraud prevention/security |
| Financial info: other financial info (bank / e-wallet account for payouts) | Yes | Required | App functionality |
| Location | Yes | Required | App functionality (shown to customers during an order) |
