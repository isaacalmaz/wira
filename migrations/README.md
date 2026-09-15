# Wira database migrations — historical reconstruction

## What this is

This directory is a **historical reconstruction** of the Wira production
database schema, built by reading every root-level `*.sql` file in this repo
(the ones that were previously copy-pasted by hand into the Supabase SQL
Editor, in no particular tracked order) and re-ordering their **exact,
unmodified SQL content** into numbered files that reflect the dependency
order they'd need to run in on a **fresh** database to arrive at (approximately)
the current live schema.

**Nothing here has been run.** No SQL in this directory (or anywhere else)
was executed against the live database as part of producing this
reconstruction. The live production database already has all of this
applied — you do **not** need to (and should not) replay migrations
0001–0015 against it.

Where the source files are genuinely redundant, conflicting, or depend on
something that doesn't appear to exist anywhere in this repo, that is called
out in the affected file's header comment rather than silently fixed —
per the ground rules for this reconstruction, **no SQL logic was invented,
rewritten, or "cleaned up"**, only reorganized, renamed, and split from the
real files.

## Going forward

New schema changes should be added here as new numbered files
(`0016_...sql`, `0017_...sql`, etc.), not as new ad-hoc scripts dropped in
the repo root and run by hand. Each new migration should:

- Get the next sequential number.
- Have a short header comment: what it does, and what it depends on.
- Contain real, reviewed SQL — not a copy-paste scratchpad.

The old root-level `*.sql` files (`master_schema.sql`, `setup_wallet.sql`,
etc.) have been left in place for now; they were the source material for
this reconstruction and should only be deleted once someone has verified
this `migrations/` folder is complete and correct.

`backend/database/schema.sql` and `backend/database/seed.sql` were **not**
used as a source and were **not** modified. They describe a schema that
diverges significantly from what's actually live (separate `wallets` table,
`restaurants`/`menu_items` instead of `merchants`/`products`, a `drivers`
table with no matching `driver_profiles`, a `feature_flags` table keyed by a
UUID `id` instead of by `region`, etc.) — confirmed stale/fictional per this
task's background, and out of scope to touch.

## File listing (run order on a fresh database)

| # | File | Source | Purpose |
|---|------|--------|---------|
| 0001 | `0001_initial_core_schema.sql` | `master_schema.sql` | Core tables: `users`, `merchants`, `orders`, `messages`; base RLS policies; realtime for `orders`/`messages`; auth-sync safety net insert. |
| 0002 | `0002_merchants_rls_full_access.sql` | `fix_merchants_rls.sql` | Widens `merchants` RLS from read-only to full public access. |
| 0003 | `0003_feature_flags_table.sql` | `fix_feature_flags_rls.sql` | Creates `feature_flags` table (region-keyed) + RLS. Real origin of this table on the live DB. |
| 0004 | `0004_feature_flags_data_cleanup_and_realtime.sql` | `fix_feature_flags_data.sql` | Deletes a stale `feature_flags` row, enables realtime on the table. |
| 0005 | `0005_mitra_access_column.sql` | `migrate_mitra_access.sql` | Adds `mitra_access` JSONB column to `users`, backfills from `role` and from `merchants.owner_id`. |
| 0006 | `0006_users_rls_disable.sql` | `fix_users_rls.sql` | Disables RLS on `users` entirely (MVP admin-portal workaround). |
| 0007 | `0007_driver_profiles_table.sql` | `create_driver_profiles.sql` | Creates `driver_profiles` table (distinct from `drivers` — see 0014) + RLS. |
| 0008 | `0008_users_vehicle_columns_redundant.sql` | `update_users_table.sql` | Adds `vehicle_type`/`plate_number`/`specialization` to `users`. **Redundant** — already in 0001's tail; idempotent no-op if replayed. |
| 0009 | `0009_messages_table_redundant.sql` | `create_messages_table.sql` | Re-creates the `messages` table/RLS/realtime. **Duplicate** of the block already in 0001 — replaying it after 0001 on a fresh DB **will error** on `ALTER PUBLICATION ... ADD TABLE messages` (already a member). Skip when replaying end-to-end. |
| 0010 | `0010_seed_dummy_notifications_products.sql` | `seed_dummy_data.sql` | Creates `notifications` (`desc`/`read` columns) and `products` tables + seed rows. **Conflicts with 0011** — see warning in file header. |
| 0011 | `0011_seed_all_data.sql` | `seed_all_data.sql` | Creates `locations`, `promos`, `vehicles` tables; creates `notifications` (`description`/`is_read` columns — **conflicts with 0010**) and `products` (`+category_id` — **conflicts with 0010**); adds `merchants.price_per_night`/`description`; conditionally seeds merchants/products/villas. |
| 0012 | `0012_seed_operational_zones_flag.sql` | `seed_operational_zones.sql` | Inserts an `operational_zones` row into `feature_flags`; adds an admin UPDATE RLS policy. **Likely broken as written** — references a non-existent `is_active` column on `feature_flags`; see warning in file header. |
| 0013 | `0013_postgis_geofencing.sql` | `setup_geofencing.sql` | Enables `postgis`; creates `operational_zones` table + RLS; migrates the row from `feature_flags` into it; creates `get_zone_for_location()` RPC. |
| 0013b | `0013b_drivers_table_reconstructed.sql` | *(none — reconstructed from live schema, 2026-09-15)* | Creates `public.drivers` (id PK/FK -> `users.id`, vehicle_type, vehicle_plate, is_online, rating, status). Fills the gap below 0014 relies on. Not sourced from any root `.sql` file — see known issue #1 for how it was confirmed. |
| 0014 | `0014_postgis_nearest_driver.sql` | `setup_nearest_driver.sql` | Adds spatial columns/index/trigger to `public.drivers`; creates `get_nearest_drivers()`/`find_nearest_drivers()` RPCs, RLS, `driver_locations` view. Depends on 0013b now existing first. |
| 0015 | `0015_wallet_topup_system.sql` | `setup_wallet.sql` | Adds `users.wallet_balance`; creates `topup_requests` + `transactions` tables, RLS, unique-code trigger, and `approve_topup_request()`/`reject_topup_request()`/`cancel_topup_request()`/`get_pending_topup_codes()` RPCs. |
| 0016 | `0016_vehicles_pricing_admin.sql` | *(none — new feature, 2026-09-15)* | Adds `per_km_rate` to `vehicles`; admin INSERT/UPDATE/DELETE RLS policies (previously public-SELECT-only, no write policy existed at all). |
| 0017 | `0017_orders_pickup_coords.sql` | *(none — new feature, 2026-09-15)* | Adds real `pickup_lat`/`pickup_lng` columns to `orders` (previously only buried as JSON text in `details`, unusable by SQL/PostGIS). Stage 1 of upgrading driver matching from island-wide broadcast to distance-aware. |
| 0018 | `0018_nearby_pending_orders_rpc.sql` | *(none — new feature, 2026-09-15)* | Creates `get_nearby_pending_orders()` RPC (mirrors `get_nearest_drivers()` in the opposite direction) - scopes a driver's pending-orders list to a 15km radius, while always still showing orders with no pickup coordinates yet (send/service/pool). Stage 2 of driver matching. |
| 0019 | `0019_messages_rls.sql` | *(none — security fix, 2026-09-15)* | Enables RLS on `messages` (was enabled then immediately disabled in 0001/0009, no policies ever existed - any client could read/write any order's private chat). Scopes to the order's customer, assigned mitra, owning merchant, or admin. |
| 0020 | `0020_orders_dropoff_coords.sql` | *(none — new feature, 2026-09-15)* | Adds real `dropoff_lat`/`dropoff_lng` columns to `orders`, mirroring `pickup_lat`/`pickup_lng` from 0017. Powers GPS-assisted trip-stage confirmation in `DriverHomePage.jsx` (distance-to-target display, arrival radius highlight) - only `RidePage.jsx` populates these so far. |

## Files intentionally excluded from the numbered sequence

These were read and cataloged but not turned into migrations, because they
are not schema-altering in a way worth replaying, or are pure test/diagnostic
artifacts:

- **`test_realtime.sql`** — a single `ALTER PUBLICATION supabase_realtime ADD TABLE orders;` statement, already covered by 0001. Replaying it after 0001 would error (table already a publication member).
- **`test_insert_mock.sql`** — a single test `INSERT` of one mock driver user row, not real seed data.
- **`check_users_rls.sql`** — a read-only `SELECT` diagnostic query against `pg_tables`; no schema/data effect at all.
- **`generate_sql.mjs`** — a Node script that *generates* SQL to `seed_all_data.sql`; it was never itself executed against the database, and its current content has drifted from what `seed_all_data.sql` actually contains (evidence that `seed_all_data.sql` was hand-edited after being generated).
- **All other root-level `*.js` files** (`apply_sql.js`, `fix_admin.js`, `patch_*.js`, `rollback_gps.js`, `test_*.js`, etc.) — inspected individually. `apply_sql.js` is an inert stub that never executes DDL (its own comment says it can't). The rest are frontend `.jsx` source-code patchers or Supabase-client-level data/verification scripts (row inserts/updates through the REST API, GPS error-message rewrites, UI patches) — none contain raw schema-altering SQL.

## Known issues to resolve with a human who has DB access

1. **RESOLVED (2026-09-15).** ~~Missing `public.drivers` table~~ — confirmed live via `information_schema.columns` + `table_constraints`: `id UUID PRIMARY KEY REFERENCES users(id)`, `vehicle_type`, `vehicle_plate`, `is_online`, `rating`, `status` (plus `lat`/`lng`/`location`/`updated_at` added later by 0014 itself). It genuinely was never captured in any root `.sql` file — most likely created by hand via the Table Editor. Reconstructed as `0013b_drivers_table_reconstructed.sql`, built from the live schema, not from `backend/database/schema.sql`.

2. **RESOLVED (2026-09-15).** ~~`notifications`/`products` schema conflict~~ — confirmed live via `information_schema.columns`: `notifications` has `description`/`is_read` (i.e. `seed_all_data.sql` / 0011's shape won), while `products` has **no** `category_id` (i.e. `seed_dummy_data.sql` / 0010's shape won). Split result — neither file fully "won"; each table independently ended up matching a different source file. No further action needed since this only documents historical fact, but if either 0010 or 0011 is ever replayed against a fresh DB, expect the losing file's inserts for these two tables to fail exactly like they silently did in production.

3. **RESOLVED (2026-09-15).** ~~`seed_operational_zones.sql` (0012) references non-existent `is_active`~~ — confirmed live: `feature_flags` only has `(id, region, features, updated_at)`, no `is_active`. 0012's insert would indeed fail as written. Since 0013 already migrates the zones data out of `feature_flags` into a dedicated `operational_zones` table, this is dead code going forward — no fix needed unless 0012 is ever replayed standalone.

4. **Duplicate `messages` table creation (0001 vs 0009).** `create_messages_table.sql` (0009) is a byte-for-byte duplicate of the "TABEL CHAT" block already appended to the end of `master_schema.sql` (0001). Harmless as two separate historical files, but not both replayable back-to-back on a fresh DB (see 0009's header).

5. **Git commit history for these files does not reliably reflect real chronological order** — many of the source files share identical first-commit timestamps (e.g. everything touched around `2026-09-12 20:37:45`), consistent with a bulk/batched import rather than incremental commits as each file was actually written and run. Ordering in this `migrations/` folder was determined primarily from **logical dependency** (a table must exist before it's altered) and secondarily from **on-disk file modification times** (which vary at minute/second granularity and are more informative here), not from `git log` dates. `git log` dates are still recorded in each file's header per the task instructions, but should be read as "when this file entered version control," not "when it ran against the database."
