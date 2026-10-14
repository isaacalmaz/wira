-- 0135: extra costs on a QRIS-paid order are paid in cash to the partner;
-- the commission on cash jasa/quote extras comes off payable_balance at
-- completion. Cash orders and (WiraPay on) wallet charges are unchanged.
\echo '--- 09 cash extras: QRIS-paid order extras are cash, commission at completion; cash orders unchanged'

INSERT INTO users (id, name, role, wallet_balance, payable_balance) VALUES
  ('09000000-0000-0000-0000-000000000001', 'X1 customer', 'user', 0, 0),
  ('09000000-0000-0000-0000-000000000002', 'X2 technician', 'mitra', 0, 0),
  ('09000000-0000-0000-0000-000000000003', 'X3 cash customer', 'user', 0, 0),
  ('09000000-0000-0000-0000-000000000004', 'X4 wallet customer', 'user', 100000, 0);

-- Orders as the migration owner (as after the QRIS webhook / dispatch).
INSERT INTO orders (id, user_id, driver_id, service_type, title, status, total_price, payment_method, payment_status) VALUES
  ('09000000-0000-0000-0000-0000000000a1', '09000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000002',
   'pool', 'X qris pool', 'working', 125000, 'wallet', 'paid'),
  ('09000000-0000-0000-0000-0000000000a2', '09000000-0000-0000-0000-000000000003', '09000000-0000-0000-0000-000000000002',
   'pool', 'X cash pool', 'working', 125000, 'cash', 'unpaid'),
  ('09000000-0000-0000-0000-0000000000a3', '09000000-0000-0000-0000-000000000004', '09000000-0000-0000-0000-000000000002',
   'pool', 'X wallet pool', 'working', 125000, 'wallet', 'paid');
INSERT INTO order_adjustments (id, order_id, requested_by, kind, amount, description) VALUES
  ('09000000-0000-0000-0000-0000000000b1', '09000000-0000-0000-0000-0000000000a1', '09000000-0000-0000-0000-000000000002', 'jasa', 50000, 'Ganti pompa'),
  ('09000000-0000-0000-0000-0000000000b2', '09000000-0000-0000-0000-0000000000a1', '09000000-0000-0000-0000-000000000002', 'material', 30000, 'Kaporit'),
  ('09000000-0000-0000-0000-0000000000b3', '09000000-0000-0000-0000-0000000000a2', '09000000-0000-0000-0000-000000000002', 'jasa', 40000, 'Sikat dinding');

-- --- QRIS-paid order, WiraPay off -------------------------------------------------
SET ROLE authenticated;
SELECT wira_test.login('09000000-0000-0000-0000-000000000001');
SELECT wira_test.eq(respond_order_adjustment('09000000-0000-0000-0000-0000000000b1', true), 'approved',
    'customer approves a jasa extra on a QRIS-paid order (no WiraPay needed)');
SELECT wira_test.eq(respond_order_adjustment('09000000-0000-0000-0000-0000000000b2', true), 'approved',
    'customer approves a material extra on a QRIS-paid order');
RESET ROLE;
SELECT wira_test.eq((SELECT count(*) FROM order_adjustments WHERE order_id = '09000000-0000-0000-0000-0000000000a1' AND paid_cash),
    2::bigint, 'both extras are marked paid in cash');
SELECT wira_test.eq((SELECT total_price FROM orders WHERE id = '09000000-0000-0000-0000-0000000000a1'), 125000::numeric,
    'total_price stays what was paid by QRIS');
SELECT wira_test.eq((SELECT wallet_balance FROM users WHERE id = '09000000-0000-0000-0000-000000000001'), 0::numeric,
    'customer wallet untouched');
SELECT wira_test.ok((SELECT description LIKE '%Terima pembayarannya tunai%' FROM notifications
                     WHERE user_id = '09000000-0000-0000-0000-000000000002' ORDER BY created_at DESC LIMIT 1),
    'technician is told to collect the extra in cash');

SELECT wira_test.login('09000000-0000-0000-0000-000000000002'); -- the technician finishes the job
UPDATE orders SET status = 'completed' WHERE id = '09000000-0000-0000-0000-0000000000a1';
SELECT wira_test.eq((SELECT payable_balance FROM users WHERE id = '09000000-0000-0000-0000-000000000002'), -10000::numeric,
    'at completion 20% commission on the cash jasa (50000) comes off payable; material is not cut');
UPDATE orders SET details = 'later edit' WHERE id = '09000000-0000-0000-0000-0000000000a1';
SELECT wira_test.login('09000000-0000-0000-0000-000000000002'); -- the technician finishes the job
UPDATE orders SET status = 'completed' WHERE id = '09000000-0000-0000-0000-0000000000a1';
SELECT wira_test.eq((SELECT payable_balance FROM users WHERE id = '09000000-0000-0000-0000-000000000002'), -10000::numeric,
    'commission is taken once (no second charge on later updates)');

-- --- cash order: unchanged ---------------------------------------------------------
SET ROLE authenticated;
SELECT wira_test.login('09000000-0000-0000-0000-000000000003');
SELECT wira_test.eq(respond_order_adjustment('09000000-0000-0000-0000-0000000000b3', true), 'approved',
    'cash order extra is approved as before');
RESET ROLE;
SELECT wira_test.eq((SELECT total_price FROM orders WHERE id = '09000000-0000-0000-0000-0000000000a2'), 165000::numeric,
    'cash order extra is added to total_price as before');
SELECT wira_test.ok(NOT (SELECT paid_cash FROM order_adjustments WHERE id = '09000000-0000-0000-0000-0000000000b3'),
    'cash order extra is not flagged (its commission is in total_price)');
SELECT wira_test.login('09000000-0000-0000-0000-000000000002'); -- the technician finishes the job
UPDATE orders SET status = 'completed' WHERE id = '09000000-0000-0000-0000-0000000000a2';
SELECT wira_test.eq((SELECT payable_balance FROM users WHERE id = '09000000-0000-0000-0000-000000000002'), -10000::numeric,
    'no extra commission from 0135 on a cash order');

-- --- WiraPay on again: the wallet charge is used unchanged ----------------------------
INSERT INTO app_settings (key, value) VALUES ('wallet_enabled', 'true'::jsonb);
INSERT INTO order_adjustments (id, order_id, requested_by, kind, amount, description) VALUES
  ('09000000-0000-0000-0000-0000000000b4', '09000000-0000-0000-0000-0000000000a3', '09000000-0000-0000-0000-000000000002', 'jasa', 20000, 'Cek filter');
SET ROLE authenticated;
SELECT wira_test.login('09000000-0000-0000-0000-000000000004');
SELECT wira_test.eq(respond_order_adjustment('09000000-0000-0000-0000-0000000000b4', true), 'approved',
    'with WiraPay on, the extra is charged to the wallet');
RESET ROLE;
SELECT wira_test.eq((SELECT wallet_balance FROM users WHERE id = '09000000-0000-0000-0000-000000000004'), 80000::numeric,
    'wallet debited 20000');
SELECT wira_test.eq((SELECT total_price FROM orders WHERE id = '09000000-0000-0000-0000-0000000000a3'), 145000::numeric,
    'wallet-paid extra is added to total_price');
DELETE FROM app_settings WHERE key = 'wallet_enabled';
