#!/usr/bin/env bash
# Runs the database test suite: fresh database -> schema_stub.sql -> the real
# migrations listed below -> helpers.sql -> tests/*.sql (in name order).
# Any failed assertion (or SQL error) aborts with a non-zero exit code.
#
# Connection comes from the usual libpq env vars (PGHOST, PGPORT, PGUSER,
# PGPASSWORD). The user must be able to CREATE DATABASE and SET ROLE to
# anon/authenticated/service_role (a superuser, e.g. postgres).
#   Local:  PGHOST=/var/run/postgresql PGPORT=5499 PGUSER=postgres \
#           WIRA_TEST_DB=my_db db-tests/run.sh
# WIRA_TEST_DB (default wira_db_tests) is DROPPED and recreated each run.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$DIR/../migrations"
DB="${WIRA_TEST_DB:-wira_db_tests}"

# Real migration files applied, in order. See db-tests/README.md for why
# these and what schema_stub.sql stands in for.
MIGRATION_FILES=(
  0045_topup_midtrans_method_and_amount_fix.sql
  0046_promos_usage_limit_and_admin_rls.sql
  0059_orders_server_side_price_computation.sql
  0070_atomic_wallet_checkout.sql
  0071_atomic_webhook_topup_approval.sql
  0074_orders_require_login.sql
  0076_server_side_promo_usage.sql
  0077_qris_order_checkout.sql
  0078_qris_order_payment.sql
  0079_close_anon_data_leaks.sql
  0080_counterparty_profiles.sql
  0072_server_side_dispatch.sql
  0081_expire_stale_manual_topups.sql
  0082_release_promo_usage_on_cancel.sql
  0083_dispatch_window_from_payment.sql
)

PSQL=(psql -X -q -v ON_ERROR_STOP=1 --set=SHOW_CONTEXT=never)

# Files are fed on stdin (not -f) so the psql process never needs read
# access to the checkout (e.g. when run via `su postgres`).
apply() { # $1 = label, $2 = file, rest = extra psql args
  local label="$1" file="$2"; shift 2
  echo "==> $label"
  "${PSQL[@]}" "$@" -d "$DB" < "$file"
}

echo "==> fresh database $DB"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE \"$DB\""

# Setup: quiet (only warnings/errors), each file atomically.
setup() { # $1 = label, $2 = file
  echo "==> $1"
  PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning" \
    "${PSQL[@]}" --single-transaction -d "$DB" < "$2" >/dev/null
}
setup "schema_stub.sql" "$DIR/schema_stub.sql"
for f in "${MIGRATION_FILES[@]}"; do
  setup "migrations/$f" "$MIGRATIONS/$f"
done
setup "helpers.sql" "$DIR/helpers.sql"

shopt -s nullglob
tests=("$DIR"/tests/*.sql)
if [ ${#tests[@]} -eq 0 ]; then
  echo "no tests found in $DIR/tests" >&2
  exit 1
fi
for t in "${tests[@]}"; do
  # Not --single-transaction: 0078's payment trigger is DEFERRABLE INITIALLY
  # DEFERRED and only fires when each statement's transaction commits.
  apply "tests/$(basename "$t")" "$t" -o /dev/null
done

echo "==> all db tests passed (${#tests[@]} files)"
