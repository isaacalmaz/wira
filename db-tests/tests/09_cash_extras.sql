-- 0135: extra costs on a QRIS-paid order are paid in cash to the partner;
-- the commission on cash jasa/quote extras comes off payable_balance at
-- completion.
\echo '--- 09 cash extras: QRIS-paid order extras are cash, commission once at completion'

INSERT INTO users (id, name, role, wallet_balance, payable_balance) VALUES
  ('09000000-0000-0000-0000-000000000001', 'X1 customer', 'user', 0, 0),
  ('09000000-0000-0000-0000-000000000002', 'X2 technician', 'mitra', 0, 0);

-- Orders as the migration owner (as after the QRIS webhook / dispatch).
INSERT INTO orders (id, user_id, driver_id, service_type, title, status, total_price, payment_method, payment_status) VALUES
  ('09000000-0000-0000-0000-0000000000a1', '09000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000002',
   'pool', 'X qris pool', 'working', 125000, 'wallet', 'paid');
INSERT INTO order_adjustments (id, order_id, requested_by, kind, amount, description) VALUES
  ('09000000-0000-0000-0000-0000000000b1', '09000000-0000-0000-0000-0000000000a1', '09000000-0000-0000-0000-000000000002', 'jasa', 50000, 'Ganti pompa'),
  ('09000000-0000-0000-0000-0000000000b2', '09000000-0000-0000-0000-0000000000a1', '09000000-0000-0000-0000-000000000002', 'material', 30000, 'Kaporit');

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
SELECT wira_test.throws($q$UPDATE orders SET status = 'completed', details = 'again' WHERE id = '09000000-0000-0000-0000-0000000000a1'$q$,
    '%already finalized%', 'a completed order cannot be touched again, so the commission is taken once');

-- Not covered here: cash orders and the WiraPay-on path add the extra to
-- total_price, which the stub's 0070 state machine refuses (the live one
-- allows it through 0090's wira.price_adjustment flag). Both paths are
-- unchanged by 0135 and were checked live in a rolled-back DO block
-- (2026-10-14: cash extra 40000 -> total 165000, not flagged, commission once).
