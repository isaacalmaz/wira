# db-tests

Automated checks for the money/security migrations. `run.sh` creates a fresh
database, loads a small Supabase stand-in (`schema_stub.sql`), applies the
**real** migration files from `../migrations/` unmodified, loads the assertion
helpers (`helpers.sql`) and runs `tests/*.sql` in name order. Every assertion
`RAISE`s on failure and psql runs with `ON_ERROR_STOP=1`, so the first failure
makes `run.sh` exit non-zero. CI runs it in the `db-tests` job
(`.github/workflows/ci.yml`, `postgres:16` service container).

## Running

```sh
# CI / docker postgres
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres db-tests/run.sh

# a local cluster over the unix socket, own database name
PGHOST=/var/run/postgresql PGPORT=5499 PGUSER=postgres WIRA_TEST_DB=my_db db-tests/run.sh
```

- The user must be a superuser (it creates the database and does
  `SET ROLE anon/authenticated/service_role`).
- `WIRA_TEST_DB` (default `wira_db_tests`) is **dropped and recreated** on
  every run. The roles `anon`, `authenticated`, `service_role` are
  cluster-wide and only created if missing, so several databases on one
  cluster can share them.
- SQL files are fed to psql on stdin, so the psql process never needs read
  access to the checkout.
- Output: one `NOTICE:  ok - ...` line per assertion; a failure prints
  `ERROR:  FAIL: <what> (expected ..., got ...)` and stops.

## Migrations applied for real (in this order)

| File | Why |
|---|---|
| `0045_topup_midtrans_method_and_amount_fix.sql` | `topup_requests.method`, `transactions.reference_id`, unique-amount trigger + index (QRIS amount) |
| `0046_promos_usage_limit_and_admin_rls.sql` | `promos.usage_limit`, admin promo policy, `increment_promo_usage` |
| `0059_orders_server_side_price_computation.sql` | server price trigger + `compute_promo_discount` |
| `0070_atomic_wallet_checkout.sql` | `enforce_orders_state_machine` body, `charge_wallet_for_order`, `create_order_and_pay` |
| `0071_atomic_webhook_topup_approval.sql` | `approve_topup_and_credit` |
| `0074_orders_require_login.sql` | `orders_insert_own` without the guest branch, anon INSERT revoked |
| `0076_server_side_promo_usage.sql` | `per_user_limit`, `consume_promo_for_order`, `trg_orders_promo_usage` |
| `0077_qris_order_checkout.sql` | `topup_requests.order_id`, `create_order_awaiting_qris`, `trg_zz_orders_await_qris` |
| `0078_qris_order_payment.sql` | deferred payment trigger, awaiting_payment guard, cancel/expire RPCs, `cron.schedule` |
| `0079_close_anon_data_leaks.sql` | anon-leak policy fixes + REVOKEs |
| `0080_counterparty_profiles.sql` | `users_select` own-only, `get_counterparty_profiles`, drivers visibility |

All eleven files apply whole and unmodified; no function body is copied into
the stub. Migrations 0081+ are not part of the suite yet: add them to
`MIGRATION_FILES` in `run.sh` (plus any stub objects they need) and a test file.

## What `schema_stub.sql` stands in for

Everything else the migrations above depend on. None of it is tested itself.

| Stubbed | Real source | Notes |
|---|---|---|
| roles `anon`, `authenticated`, `service_role` (BYPASSRLS) | Supabase | created only if missing |
| `auth.uid()` | Supabase | reads `request.jwt.claim.sub`; tests set it via `wira_test.login(uuid)` |
| default grants of all tables/functions in `public` to the three roles | Supabase | so the migrations' REVOKEs are what closes access, as in production |
| `cron.job` table + `cron.schedule(name, schedule, command)` | pg_cron | records the job; nothing runs on a schedule |
| `is_admin()` | 0026 | same body |
| tables `users`, `merchants`, `drivers`, `reviews`, `vehicles`, `pricing_rules`, `promos`, `orders`, `transactions`, `topup_requests` | 0001, 0011, 0013b/0014, 0015, 0036, 0039, 0057, 0058 and others | only the columns the tested migrations and tests use; no postgis `location` column |
| policies on those tables | 0001, 0014, 0015, 0024, 0026, 0028, 0032, 0039, 0057 | as they were **before** 0074/0079/0080, including the leaky guest/anon branches, so those migrations are what removes them |
| `enforce_orders_state_machine` placeholder + `trg_enforce_orders_state_machine` | 0051 | 0070 replaces the body; the trigger itself is only created in 0051 |
| `driver_locations` view, `get_nearest_drivers` / `find_nearest_drivers` | 0014 (postgis) | same names/signatures, trivial bodies; 0080 only REVOKEs them |

Not present at all (so not covered): other `orders` triggers such as the
payout trigger (0028/0075), PIN (0063–0069), claim guardrail (0054), and
dispatch (0072/0073).

## Tests

| File | Covers |
|---|---|
| `01_wallet_checkout.sql` | `create_order_and_pay` charges the server price (client price ignored), debits wallet + ledger; insufficient balance rolls back; clients cannot INSERT wallet/paid/non-pending orders or later flip payment/price; `charge_wallet_for_order` ownership; 0074 login required; anon denied |
| `02_promo_usage.sql` | usage counted by the trigger for cash and wallet orders; exhausted promo raises (cash + wallet, nothing charged); `per_user_limit` (cancelled orders don't count); expired code = no discount; `increment_promo_usage` / `consume_promo_for_order` closed to clients; RLS on promo edits |
| `03_qris_orders.sql` | `create_order_awaiting_qris` → `awaiting_payment` + linked top-up with unique code; nobody can claim/accept/confirm/move an unpaid order (RLS, and the 0078 guard under a wide-open test policy); webhook approval → `pending`/`paid` with correct ledger; replay = `already_processed` no-op; amount mismatch raises; cancel + late payment stays in wallet; expiry (15 min / 2 h); cron job registered |
| `04_anon_leaks.sql` | anon gets permission denied on `users`, `orders`, `topup_requests`; no guest branch left in policies; logged-in job feed and own top-ups unchanged |
| `05_counterparty_profiles.sql` | `users_select` own-only (admin all); `get_counterparty_profiles` rules for customer / driver / reviewer / merchant owner / admin, only `name, phone, vehicle_type`; drivers row visible only for an active order; `driver_locations` and nearest-driver RPCs closed to anon |

Test files share one database and run in order; each uses its own fixture
UUIDs (prefix `0N000000-...`) so they don't interfere.
