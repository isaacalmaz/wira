-- 0134: WiraPay off on the server. Signed-in non-admin users cannot spend a
-- balance; the QRIS-per-order path (service role / admin), crons and credits
-- keep working.
\echo '--- 08 wallet switch: no customer spending while WiraPay is off; QRIS, admin, service role still work'

INSERT INTO users (id, name, role, wallet_balance) VALUES
  ('08000000-0000-0000-0000-000000000001', 'S1 customer with balance', 'user', 100000),
  ('08000000-0000-0000-0000-000000000002', 'S2 admin', 'admin', 0),
  ('08000000-0000-0000-0000-000000000003', 'S3 qris customer', 'user', 0),
  ('08000000-0000-0000-0000-000000000004', 'S4 finance admin', 'Admin Keuangan', 0);
INSERT INTO vehicles (name, type, service_type, price, per_km_rate)
  VALUES ('Motor', 'motor', 'ride', 12000, 3000) ON CONFLICT DO NOTHING;
INSERT INTO pricing_rules (service_type, code, name, base_price)
  VALUES ('pool', 'bersih', 'Kuras kolam', 150000) ON CONFLICT DO NOTHING;

SELECT wira_test.ok(NOT wallet_enabled(), 'wallet_enabled() is false without an app setting');

-- --- a customer cannot spend ---------------------------------------------------
SET ROLE authenticated;
SELECT wira_test.login('08000000-0000-0000-0000-000000000001');
SELECT wira_test.throws($q$SELECT create_order_and_pay(p_service_type => 'ride', p_title => 'S1 ride',
        p_rate_code => 'motor', p_distance_meters => 5000)$q$,
    '%WiraPay sedang tidak aktif%', 'create_order_and_pay is refused while WiraPay is off');
SELECT wira_test.throws($q$UPDATE users SET wallet_balance = wallet_balance - 1000 WHERE id = auth.uid()$q$,
    '%WiraPay sedang tidak aktif%', 'a direct balance decrease by the customer is refused');
SELECT wira_test.eq((SELECT count(*) FROM orders WHERE title = 'S1 ride'), 0::bigint,
    'the refused checkout left no order behind');
RESET ROLE;
SELECT wira_test.eq((SELECT wallet_balance FROM users WHERE id = '08000000-0000-0000-0000-000000000001'),
    100000::numeric, 'balance unchanged after the refused attempts');

-- --- admin and service role may still lower a balance ---------------------------
SET ROLE authenticated;
SELECT wira_test.login('08000000-0000-0000-0000-000000000002');
SELECT wira_test.eq(wira_test.rows($q$UPDATE users SET wallet_balance = wallet_balance - 1000
        WHERE id = '08000000-0000-0000-0000-000000000001'$q$),
    1::bigint, 'an admin can still correct a balance downwards');
SELECT wira_test.login('08000000-0000-0000-0000-000000000004');
SELECT wira_test.eq(wira_test.rows($q$UPDATE users SET wallet_balance = wallet_balance - 1000
        WHERE id = '08000000-0000-0000-0000-000000000001'$q$),
    1::bigint, 'an Admin Keuangan can too (approving QRIS top-ups in Keuangan)');
RESET ROLE;
SET ROLE service_role;
SELECT wira_test.login(NULL);
UPDATE users SET wallet_balance = wallet_balance - 1000 WHERE id = '08000000-0000-0000-0000-000000000001';
RESET ROLE;
SELECT wira_test.eq((SELECT wallet_balance FROM users WHERE id = '08000000-0000-0000-0000-000000000001'),
    97000::numeric, 'admin, finance and service-role decreases went through (100000 - 3 x 1000)');

-- --- QRIS per order still pays the order (webhook = service role, no user) -------
SET ROLE authenticated;
SELECT wira_test.login('08000000-0000-0000-0000-000000000003');
SELECT (r->'order'->>'id') AS s3_order, (r->>'qris_amount') AS s3_amount
FROM create_order_awaiting_qris(p_service_type => 'pool', p_title => 'S3 pool', p_rate_code => 'bersih') r \gset
RESET ROLE;
SELECT id AS s3_topup FROM topup_requests WHERE order_id = :'s3_order' \gset
SET ROLE service_role;
SELECT wira_test.login(NULL);
SELECT approve_topup_and_credit(:'s3_topup', :'s3_amount', 'manual', 'S3 QRIS') AS s3_outcome \gset
RESET ROLE;
SELECT wira_test.eq((SELECT payment_status FROM orders WHERE id = :'s3_order'), 'paid',
    'QRIS order is paid by the webhook path while WiraPay is off');
SELECT wira_test.eq((SELECT status FROM orders WHERE id = :'s3_order'), 'pending',
    'paid QRIS order moves on to pending');
SELECT wira_test.eq((SELECT wallet_balance FROM users WHERE id = '08000000-0000-0000-0000-000000000003'),
    (:'s3_amount'::numeric - 150000), 'only the unique-code remainder stays in the wallet');

-- --- switching WiraPay on restores spending ---------------------------------------
INSERT INTO app_settings (key, value) VALUES ('wallet_enabled', 'true'::jsonb);
SET ROLE authenticated;
SELECT wira_test.login('08000000-0000-0000-0000-000000000001');
SELECT wira_test.eq((SELECT payment_status FROM create_order_and_pay(p_service_type => 'ride', p_title => 'S1 ride on',
        p_rate_code => 'motor', p_distance_meters => 5000)), 'paid', 'with wallet_enabled = true the customer can pay again');
RESET ROLE;
DELETE FROM app_settings WHERE key = 'wallet_enabled';
