-- 0081 top-up expiry + 0082 promo release on cancel + 0083 dispatch window
-- measured from payment.
\echo '--- 06 top-up expiry (0081), promo release on cancel (0082), dispatch from paid_at (0083)'

INSERT INTO users (id, name, role, wallet_balance) VALUES
  ('06000000-0000-0000-0000-000000000001', 'E1 customer', 'user', 100000),
  ('06000000-0000-0000-0000-000000000002', 'E2 customer', 'user', 0);
INSERT INTO pricing_rules (service_type, code, name, base_price)
  VALUES ('pool', 'bersih', 'Kuras kolam', 150000) ON CONFLICT DO NOTHING;
INSERT INTO pricing_rules (service_type, code, name, base_price)
  VALUES ('send', 'kecil', 'Paket Kecil', 20000) ON CONFLICT DO NOTHING;
INSERT INTO promos (title, code, service_type, type, discount, status, "validUntil", usage, usage_limit, per_user_limit) VALUES
  ('Send 5K once', 'T_SEND5K', 'send', 'Fixed', 5000, 'Active', '2099-12-31', 0, 1, 1);

-- --- 0081: expiry of pending top-ups ------------------------------------------
-- Trigger off so the nominals stay exactly as inserted (0045 re-rolls some).
ALTER TABLE topup_requests DISABLE TRIGGER USER;
INSERT INTO topup_requests (user_id, amount, status, method, created_at, proof_url) VALUES
  ('06000000-0000-0000-0000-000000000001', 60101, 'pending', 'manual',   NOW() - INTERVAL '3 hours',  'E manual 3h'),
  ('06000000-0000-0000-0000-000000000001', 60102, 'pending', 'manual',   NOW() - INTERVAL '25 hours', 'E manual 25h'),
  ('06000000-0000-0000-0000-000000000001', 60103, 'pending', 'midtrans', NOW() - INTERVAL '30 hours', 'E midtrans 30h');
ALTER TABLE topup_requests ENABLE TRIGGER USER;
SELECT expire_awaiting_qris_orders();
SELECT wira_test.eq((SELECT status FROM topup_requests WHERE proof_url = 'E manual 3h'), 'pending',
    'plain wallet top-up is kept for 24h (admin can still approve after the 2h webhook window)');
SELECT wira_test.eq((SELECT status FROM topup_requests WHERE proof_url = 'E manual 25h'), 'cancelled',
    'plain wallet top-up older than 24h is cancelled');
SELECT wira_test.eq((SELECT status FROM topup_requests WHERE proof_url = 'E midtrans 30h'), 'pending',
    'Midtrans top-ups are never expired');

-- --- 0082: promo use released on cancel ---------------------------------------
SET ROLE authenticated;
SELECT wira_test.login('06000000-0000-0000-0000-000000000001');
INSERT INTO orders (user_id, service_type, title, payment_method, rate_code, promo_code)
    VALUES (auth.uid(), 'send', 'E1 send promo', 'cash', 'kecil', 'T_SEND5K');
SELECT wira_test.throws($q$INSERT INTO orders (user_id, service_type, payment_method, rate_code, promo_code)
    VALUES (auth.uid(), 'send', 'cash', 'kecil', 'T_SEND5K')$q$,
    '%Kuota promo T_SEND5K sudah habis%', 'single-use promo is exhausted after one order');
RESET ROLE;
SELECT wira_test.ok((SELECT promo_usage_id IS NOT NULL FROM orders WHERE title = 'E1 send promo'),
    'order that consumed a promo use carries the promo_usage_id marker');
UPDATE orders SET status = 'cancelled' WHERE title = 'E1 send promo';
SELECT wira_test.eq((SELECT usage FROM promos WHERE code = 'T_SEND5K'), 0, 'cancelling the order gives the use back');
SET ROLE service_role;
UPDATE orders SET details = 'backend edit' WHERE title = 'E1 send promo';
RESET ROLE;
SELECT wira_test.eq((SELECT usage FROM promos WHERE code = 'T_SEND5K'), 0, 'no second release on later edits');
SET ROLE authenticated;
SELECT wira_test.login('06000000-0000-0000-0000-000000000001');
WITH x AS (INSERT INTO orders (user_id, service_type, payment_method, rate_code, promo_code)
    VALUES (auth.uid(), 'send', 'cash', 'kecil', 'T_SEND5K') RETURNING total_price)
SELECT wira_test.eq((SELECT total_price FROM x), 15000::numeric, 'same user can use the released promo again (per_user_limit)');
RESET ROLE;
SELECT promo_usage_id AS marker FROM orders
  WHERE user_id = '06000000-0000-0000-0000-000000000001' AND status <> 'cancelled' AND promo_code = 'T_SEND5K' \gset
SET ROLE authenticated;
DO $$ BEGIN
    UPDATE orders SET promo_usage_id = gen_random_uuid() WHERE user_id = auth.uid() AND status <> 'cancelled';
EXCEPTION WHEN OTHERS THEN NULL;  -- refusing is fine too
END $$;
RESET ROLE;
SELECT wira_test.eq((SELECT promo_usage_id FROM orders WHERE user_id = '06000000-0000-0000-0000-000000000001'
    AND status <> 'cancelled' AND promo_code = 'T_SEND5K'), :'marker'::uuid, 'client cannot change promo_usage_id');

-- --- 0083: dispatch window counts from payment --------------------------------
SET ROLE authenticated;
SELECT wira_test.login('06000000-0000-0000-0000-000000000002');
SELECT (create_order_awaiting_qris(p_service_type => 'pool', p_title => 'E2 late pool', p_rate_code => 'bersih'))->'order'->>'id' AS late_order \gset
RESET ROLE;
INSERT INTO orders (user_id, service_type, title, status, payment_method, rate_code, created_at)
    VALUES ('06000000-0000-0000-0000-000000000001', 'send', 'E1 stale send', 'pending', 'cash', 'kecil', NOW() - INTERVAL '40 minutes');
SET ROLE authenticated;
-- Any logged-in user may update an unassigned pending order (job feed), so
-- this row really reaches the 0083 guard rather than being hidden by RLS.
SELECT wira_test.throws($q$UPDATE orders SET paid_at = NOW() WHERE title = 'E1 stale send'$q$,
    '%paid_at cannot be set by clients%', 'client cannot set paid_at to extend dispatch');
RESET ROLE;
UPDATE orders SET created_at = NOW() - INTERVAL '40 minutes' WHERE id = :'late_order';
SELECT id AS late_topup, amount AS late_amount FROM topup_requests WHERE order_id = :'late_order' \gset
SET ROLE service_role;
SELECT wira_test.eq(approve_topup_and_credit(:'late_topup', :'late_amount', 'manual', 'late pool'), 'approved', 'late QRIS payment approved');
RESET ROLE;
SELECT wira_test.ok((SELECT status = 'pending' AND payment_status = 'paid' AND paid_at > NOW() - INTERVAL '1 minute'
    FROM orders WHERE id = :'late_order'), 'payment sets paid_at');
SET ROLE service_role;
SELECT wira_test.ok(:'late_order'::uuid IN (SELECT dispatch_due_orders(100)),
    'order created 40 min ago but paid now is still dispatched');
SELECT wira_test.ok((SELECT id FROM orders WHERE title = 'E1 stale send') NOT IN (SELECT dispatch_due_orders(100)),
    'unpaid-window order created 40 min ago is not dispatched');
RESET ROLE;
