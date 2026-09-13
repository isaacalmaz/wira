# Reviewer Round 3 Progress Log

## Objective
Adversarial review and edge-case hardening for WiraPay Top-Up QRIS Statis DANA with 3-digit Unique Code.

## Discovered Vulnerabilities & Defects
1. **No User Cancellation Mechanism & RLS Permission Denial**:
   - *Input*: User creates a top-up request (e.g., Rp 50.123), but wishes to cancel or made a mistake.
   - *Expected*: User can cancel their own pending top-up request from the UI or via service. Cancellation changes status to `cancelled`, freeing the unique nominal and removing it from the user's active pending list.
   - *Actual*: No cancellation UI existed. In `setup_wallet.sql`, status check constraint only allowed `('pending', 'approved', 'rejected')`, and no RLS UPDATE policy existed for users, causing raw Postgres permission denial.
   - *Root Cause*: Lack of `cancelTopUpRequest` service function, absence of `cancel_topup_request` RPC, absence of `Users can cancel own pending topups` RLS policy, and absence of cancel buttons in `WalletPage.jsx`.

2. **Trigger Unique Code Pool Saturation**:
   - *Input*: In `setup_wallet.sql`, when 50 random attempts encounter collision on heavily requested base denominations.
   - *Expected*: Trigger systematically scans 101..999 to find an open unique code before completing.
   - *Actual*: Trigger gave up after 50 random attempts and assigned an occupied candidate, triggering a unique constraint error.
   - *Root Cause*: Lack of systematic scan fallback (101..999) inside PostgreSQL trigger `trg_topup_requests_unique_amount`.

3. **Privacy Exposure on Pending Queries**:
   - *Input*: Client checks for occupied unique codes using `Anyone can check pending amounts` RLS policy.
   - *Expected*: Clients query only occupied amounts without exposing user records or payment proofs.
   - *Actual*: RLS policy allowed selecting all columns (`*`) of pending rows.
   - *Root Cause*: Absence of dedicated privacy-preserving RPC `get_pending_topup_codes(base_val)` returning only `amount`.

4. **Client-Side Concurrency Race on Insert (Postgres 23505)**:
   - *Input*: Concurrent inserts race for the exact same unique nominal at the exact millisecond.
   - *Expected*: Client automatically handles duplicate key collision by re-allocating a fresh unique code and retrying.
   - *Actual*: Threw an unhandled 23505 error to the user interface.
   - *Root Cause*: Absence of retry loop in `createTopUpRequest`.

5. **Lack of Lifecycle Synchronization on Tab Switch**:
   - *Input*: Customer switches out of WiraPay to DANA / banking app, completes payment, and switches back.
   - *Expected*: Application automatically refreshes pending status upon refocus.
   - *Actual*: Pending list was only loaded once on component mount.
   - *Root Cause*: Missing `visibilitychange` and `focus` event listeners in `WalletPage.jsx`.

## Actions Taken
1. Added `cancel_topup_request(request_id UUID)` RPC and `Users can cancel own pending topups` RLS policy in `setup_wallet.sql`.
2. Added `get_pending_topup_codes(base_val NUMERIC)` RPC and systematic scan fallback 101..999 in DB trigger in `setup_wallet.sql`.
3. Updated `topupService.js` with `cancelTopUpRequest`, privacy-preserving RPC query in `getAvailableUniqueCode`, and 3-attempt concurrency retry in `createTopUpRequest`.
4. Updated `WalletPage.jsx` with "Batal" button in pending list, "Batalkan Permintaan Top Up Ini" in modal Step 2, and `focus`/`visibilitychange` auto-refresh listeners.
5. Updated `FinancePage.jsx` to render `cancelled` status badge with dedicated slate/gray styling.
6. Expanded `test_unique_code.js` to 31 assertions covering cancellation, code freeing, privacy RPCs, and concurrency retry.
