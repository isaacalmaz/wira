# Global Rules for Wira Project

## 1. Supabase `.update()` & `.delete()` RLS Trap
When performing `.update()` or `.delete()` operations via the Supabase JS client, Supabase will return a `null` error if the operation is blocked by Row-Level Security (RLS). It treats it as a successful operation that just affected 0 rows.
**Rule:** You MUST always chain `.select()` to these operations and manually verify the response array length (e.g., `if (!data || data.length === 0) throw new Error("Blocked by RLS")`).

## 2. PostgreSQL / PL/pgSQL Parameter Collisions
When writing Supabase RPC functions (`RETURNS TABLE`), input parameters share the same namespace as the returned columns. 
**Rule:** If you use identical names (e.g. `lat DOUBLE PRECISION` as input and `lat DOUBLE PRECISION` in output), Postgres will throw a fatal compilation error. Always prefix input parameters with `p_` or `user_` (e.g., `user_lat`).

---

# Working notes (handoff, updated 2026-10-11)

Everything below was learned while building Wira with the owner. Read it all before your first change.
Then read `WIRA_HANDOFF.md` (Indonesian, deep detail on money RPCs, RLS lessons, db-tests) and
`migrations/README.md`. Where those older docs disagree with this file, **this file wins** (they
predate the payment change in §5).

## 3. Who you work with and how

The owner is not at a laptop all the time and often writes in Indonesian; answer in the language they
write in. They decide product questions. You do the engineering.

- **Never type passwords or secrets anywhere.** The owner signs in themselves. To test a logged-in
  flow, mint a session without a password (see `WIRA_HANDOFF.md` §2.1).
- **Production SQL goes through the Supabase MCP connector** (`.mcp.json`; the owner signs in to
  Supabase through claude.ai Settings → Connectors, no password ever in chat). The owner granted
  write access on 2026-10-13, under these rules:
  1. Every schema change is still a file first (`migrations/01xx_….sql`, a row in
     `migrations/README.md`), tested locally (PGlite or `db-tests/`), so history stays in git.
  2. **Before anything that changes the database** (a migration, an UPDATE/INSERT/DELETE on real
     data, a function or policy change) tell the owner in one or two sentences what it does and wait
     for an explicit "jalankan"/"ya". Approval covers that one change only.
  3. **Never** drop tables, delete or rewrite data in bulk, change money (wallet, payable_balance,
     commission, payouts, deposits) by hand, or disable RLS, without the owner's explicit approval
     for that specific action.
  4. Read-only queries and verification (`SELECT`, or a `DO` block that ends in `RAISE EXCEPTION`
     so it rolls back) may run without asking.
  5. Apply migrations with the connector's `apply_migration` (named like the file), verify live,
     then commit and push the frontend that depends on it. If a migration must run *after* the
     frontend deploys, say so in its header and in `migrations/README.md`.
  Without the connector (e.g. it isn't signed in), fall back to the old flow: give the owner the
  migration file to run in the Supabase SQL Editor, and don't write to production with a service key.
- **Never force-push. Never rewrite pushed history.** Stage only the files you changed (other tools
  may have left untracked files, e.g. `skills-lock.json`; leave them alone).
- **Batch commits.** Vercel is on the Hobby plan: 100 deployments/day, and every push to `main`
  deploys 4 projects (wira-user, wira-mitra, wira-admin, wira-backend). One push = 4 deploys. Group
  related work into one push. If deploys silently stop, check for the quota error
  (`api-deployments-free-per-day`) via a manual redeploy before suspecting the GitHub webhook;
  the only fix is waiting 24h.
- **Mockup first for visible redesigns.** For a new screen or a redesign, the owner wants to see a
  mockup (a standalone HTML file) and say "oke deploy" before you change the app.
- **Don't open `/driver` home in the partner app with a real account**: it puts the driver online
  and they start receiving real orders.
- Build every workspace you touched (`npm run build --workspace=frontend-user` etc.) and read the
  **full** output, not just the tail.
- Commit messages explain *why*. Format used so far: `fix: ...`, `feat: ...`, `chore: ...`.

## 4. Repo map (quick)

- `frontend-user/` → wira.one (customers). `frontend-mitra/` → mitra.wira.one (drivers, restaurants,
  villa hosts, technicians, nannies). `frontend-admin/` → admin.wira.one. `backend/` → Express on
  Vercel serverless (Midtrans, Mutasiku webhook, FCM, dispatch cron). Database: Supabase.
- React + Vite + Tailwind. Design tokens: `laut-*` (sea teal, brand), `emas-*` (gold), `brand`,
  `ink`, `line`, `card`, `ground`; decorative `tenun-band` stripe. Shared UI kit in
  `src/components/ui` per app (`Sheet`, `Button`, `Field`, `Input`, `Badge`, `Notice`, `Table`, `cx`).
- **User app is bilingual.** Every user-facing string in `frontend-user` goes through
  `useTranslation()` (`t`, `lang`, `toggleLang`) with keys in **both** `src/i18n/id.json` and
  `src/i18n/en.json`. Mitra and Admin are Indonesian-only, hardcoded.
- Visitors who are not signed in on the **web** see `pages/LandingPage.jsx` at `/` (inside the
  Capacitor app they go to `/login`). Public pages without login: `/terms`, `/refund`, `/contact`.
- Home (Beranda) in the user app: `components/home/SpotlightCard.jsx` (swipeable cards: running
  orders → unread notice ≤3 days → promo → "order again"/time-of-day tip) above the service grid.
- Display name: read from `public.users` via `hooks/useMyProfile.js`, never from auth metadata (a
  person can have a customer and a partner account with the same email; metadata goes stale).
- Highest migration today: `0118_tester_signups.sql`. Always `ls migrations | tail` before adding one,
  and add a row to `migrations/README.md`.
- `db-tests/` + CI job `db-tests` test money/security migrations on Postgres 16 (see `WIRA_HANDOFF.md` §6.9).

## 5. Product decisions by the owner (don't change without asking)

**Payments: customers pay the partner directly.**
- Cash for every service, or a static QRIS per order. **WiraPay (wallet) is OFF everywhere since
  2026-10-08**: `WALLET_ENABLED = false` in `frontend-user/src/config/wallet.js` and
  `frontend-mitra/src/config/wallet.js`. Hidden: balance, top-up, transfers, tips, projects
  (escrow), partner withdrawals. Reason: Google Play rejected both apps because wallet features need
  an organisation developer account. **Do not turn WiraPay or any stored balance back on without
  asking**; it blocks Play publishing. QRIS refunds still credit the wallet server-side, and the admin
  transfers them back by hand. The owner refuses payment gateways; Wira isn't a registered company
  (e-money licence grey area).
- Cash food works like Gojek/Grab: the driver pays the restaurant the menu price at pickup and
  collects the total from the customer. The restaurant owes commission on the subtotal, the driver
  on the delivery fee; Wira funds promo discounts (refunded to the driver). Migration 0109.
- Partners pay commission via **"Setor Komisi"** (transfer, upload proof, admin approves in
  Keuangan); paying ahead works as a deposit. Reminder every 3 days. Debt above **Rp 200.000 for more
  than 7 days** blocks taking new orders (admin-editable).
- Partners must be 18+ (register checkbox, privacy policy, Play target audience).

**Commission is admin-editable per service** (since 0099, admin menu "Komisi",
`admin_set_commission_rate`, history in `commission_rate_changes`). Defaults: villa 5%, projects 10%,
WiraAsuh (nanny) 5%, everything else 20%; materials are never cut. **Never hardcode a rate.** Orders
stamp `orders.commission_rate` at completion, projects stamp `projects.commission_rate` at award;
client code reads `loadCommissionRates`/`commissionRate` in `frontend-mitra/src/services/orderService.js`.

**Technician vertical** (4 phases: foundation fixes, ratings, partner profiles + directory,
projects/request-for-quote):
- Projects (RFQ) are paid as down payment + instalments (e.g. 30% then progress payments). Holding
  customer money across milestones may need a payment-licence check (Bank Indonesia) before launch;
  flag it.
- Technician signup needs KTP + selfie (private storage, admin-only); "Terverifikasi" badge only after
  admin approval.
- Small fixed-price jobs (AC service, pool) stay instant booking; RFQ only for big jobs.
- To test the technician portal, temporarily grant `technician` in `mitra_access` to the owner's own
  Superadmin account, then revoke it.

## 6. Android apps and Google Play

| App | Package | On Play? | Version now | Build |
|---|---|---|---|---|
| Wira | `com.wira.user` | Yes (closed testing) | 1.4 / versionCode 5 | `bundleRelease` (AAB) |
| Wira Mitra | `com.wira.mitra` | Yes (closed testing) | 1.4 / versionCode 5 | `bundleRelease` (AAB), **JDK 21 only** |
| Wira Admin | (not on Play) | No, sideloaded APK | 1.3 / versionCode 4 | `assembleDebug` (APK) |

**Status 2026-10-11:** 1.4 of Wira and Wira Mitra is live on internal testing and in Google review
for closed testing (Alpha). **Managed publishing is OFF on both apps**, so approved changes go
live by themselves. Tester email list in Play Console: **"tim wira"** (shared by both apps; add a
tester once). Google wants 12+ opted-in testers for 14 continuous days before production access.
Opt-in links: `play.google.com/apps/testing/com.wira.user` and `.../com.wira.mitra`. People who want
to test leave their Gmail on wira.one ("Unduh aplikasi" → Android, RPC `request_tester_access`,
table `tester_signups`, migration 0118); admins see them in Admin → Rilis Aplikasi and copy them into
the Play list by hand. Store contact email: halo@wira.one.

**Building** (full steps and Play Console answers in `docs/play-store.md`):
```bash
cd frontend-mitra && npm run build && npx cap sync android
cd android && JAVA_HOME=~/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home ./gradlew bundleRelease
```
JDK 25/26 fails on Mitra with "Unsupported class file major version 70". Bump `versionCode` (+1) and
`versionName` in `android/app/build.gradle` for every Play upload. Signing uses
`android/keystore.properties` (gitignored; original in `~/wira-keys/`). Copy finished AAB/APK files to
`release-aab/` (gitignored) for the owner. Play Console uploads need a real file picker: the owner
uploads, or a browser tool that can set files on the upload input.

**Live updates (screens update without Play):** `npm run build` also runs
`scripts/live-bundle.mjs`, which writes `dist/live/<version>.zip` + `dist/live/manifest.json`
(with a SHA-256 `checksum`). Vercel serves them; the app (`src/native/appUpdates.js`, plugin
`@capgo/capacitor-updater` 6.x in manual mode) downloads the zip, then applies it when the app goes to
the background or on the next cold start. Hard-won facts:
- The plugin **rejects downloads without the checksum**. Builds ≤ 1.3 never installed a live update
  for this reason; testers must install 1.4 from Play once, then updates flow.
- `next()` only applies on a cold start, so the code also calls `set()` when the app is
  backgrounded. The app must call `notifyAppReady` within 15 s or the plugin rolls back.
- Web-only changes ship by pushing to `main`. Native changes (plugins, permissions, `MainActivity`,
  Capacitor config) need a new AAB.

## 7. Pending / ideas the owner deferred

- Restructure admin "Rilis Aplikasi" into "Tester & Aplikasi": tester signups on top, APK upload only
  for Wira Admin (the Play apps don't use it), links to Play Console. The owner said "later".
- `WIRA_HANDOFF.md` §4 lists manual tasks for the owner (rotate the Firebase key, VAPID key, etc.).
  Some may be done by now; ask before assuming either way.
