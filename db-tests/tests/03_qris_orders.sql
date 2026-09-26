-- 0045 top-up unique amount + 0071 approve_topup_and_credit + 0077/0078
-- direct static-QRIS payment of Pool/Villa orders.
\echo '--- 03 QRIS orders: awaiting_payment -> approve -> pending/paid; replay no-op; unpaid orders locked'

INSERT INTO users (id, name, role, wallet_balance) VALUES
  ('03000000-0000-0000-0000-000000000003', 'Q3 customer', 'user', 0),
  ('03000000-0000-0000-0000-000000000004', 'Q4 driver', 'mitra', 0),
  ('03000000-0000-0000-0000-000000000005', 'Q5 villa owner', 'mitra', 0),
  ('03000000-0000-0000-0000-000000000006', 'Q6 other customer', 'user', 0);
INSERT INTO drivers (id, vehicle_type) VALUES ('03000000-0000-0000-0000-000000000004', 'motor');
INSERT INTO merchants (id, owner_id, name, service_type, price_per_night) VALUES
  ('03000000-0000-0000-0000-0000000000f5', '03000000-0000-0000-0000-000000000005', 'Q villa', 'villa', 500000);
INSERT INTO pricing_rules (service_type, code, name, base_price)
  VALUES ('pool', 'bersih', 'Kuras kolam', 150000) ON CONFLICT DO NOTHING;
INSERT INTO vehicles (name, type, service_type, price, per_km_rate)
  VALUES ('Motor', 'motor', 'ride', 12000, 3000) ON CONFLICT DO NOTHING;

SELECT wira_test.eq((SELECT schedule FROM cron.job WHERE jobname = 'wira-expire-qris-orders'),
    '* * * * *', '0078 schedules wira-expire-qris-orders every minute');

-- --- create ------------------------------------------------------------------
SET ROLE authenticated;
SELECT wira_test.login('03000000-0000-0000-0000-000000000003');
DO $$
DECLARE r jsonb; t topup_requests;
BEGIN
    r := create_order_awaiting_qris(p_service_type => 'pool', p_title => 'Q3 pool',
                                    p_total_price => 1, p_rate_code => 'bersih');
    PERFORM wira_test.eq(r->'order'->>'status', 'awaiting_payment', 'QRIS order is parked in awaiting_payment');
    PERFORM wira_test.eq((r->'order'->>'total_price')::numeric, 150000::numeric, 'QRIS order has the server price 150000');
    PERFORM wira_test.eq(r->'order'->>'payment_method', 'wallet', 'QRIS order is a wallet order');
    PERFORM wira_test.eq(r->'order'->>'payment_status', 'unpaid', 'QRIS order starts unpaid');
    SELECT * INTO t FROM topup_requests WHERE order_id = (r->'order'->>'id')::uuid;
    PERFORM wira_test.ok(FOUND AND t.status = 'pending' AND t.method = 'manual' AND t.user_id = auth.uid(),
        'a pending manual top-up is linked to the order');
    PERFORM wira_test.eq(t.amount, (r->>'qris_amount')::numeric, 'RPC returns the top-up amount to transfer');
    PERFORM wira_test.ok(t.amount BETWEEN 150101 AND 150999,
        format('QRIS amount %s = 150000 + unique code (0045 trigger)', t.amount));

    PERFORM wira_test.throws($q$SELECT create_order_awaiting_qris(p_service_type => 'ride', p_rate_code => 'motor', p_distance_meters => 5000)$q$,
        '%belum tersedia untuk pesanan ride%', 'direct QRIS is only for pool/send/service/villa');
    PERFORM wira_test.throws($q$INSERT INTO orders (user_id, service_type, status, payment_method, rate_code)
        VALUES (auth.uid(), 'pool', 'awaiting_payment', 'cash', 'bersih')$q$,
        '%status = pending%', 'client cannot INSERT an awaiting_payment order directly');
    PERFORM wira_test.eq(wira_test.rows($q$UPDATE orders SET status = 'pending' WHERE title = 'Q3 pool'$q$),
        0::bigint, 'customer cannot move own unpaid order (RLS: 0 rows)');
END $$;

SELECT r->'order'->>'id' AS villa_order
FROM create_order_awaiting_qris(p_service_type => 'villa', p_title => 'Q3 villa',
     p_merchant_id => '03000000-0000-0000-0000-0000000000f5', p_nights => 2) r \gset
SELECT wira_test.eq((SELECT total_price FROM orders WHERE id = :'villa_order'), 1000000::numeric,
    'villa QRIS order priced 2 nights x 500000');

-- --- nobody can work an unpaid order -----------------------------------------
SELECT wira_test.login('03000000-0000-0000-0000-000000000004');
SELECT wira_test.eq(wira_test.rows($q$UPDATE orders SET driver_id = auth.uid() WHERE title = 'Q3 pool'$q$),
    0::bigint, 'driver cannot claim an unpaid order (RLS: 0 rows)');
SELECT wira_test.eq((SELECT count(*) FROM orders WHERE title = 'Q3 pool'), 0::bigint,
    'unpaid order is not in the driver job feed');

-- The merchant owner's UPDATE policy DOES cover the villa order: the 0078
-- guard trigger is what stops it.
SELECT wira_test.login('03000000-0000-0000-0000-000000000005');
SELECT wira_test.throws(format('UPDATE orders SET status = %L WHERE id = %L', 'confirmed', :'villa_order'),
    '%belum dibayar%', 'villa owner cannot confirm an unpaid villa order');
RESET ROLE;

-- Defense in depth: even with a wide-open UPDATE policy the guard refuses.
BEGIN;
CREATE POLICY qa_open_update ON orders FOR UPDATE USING (true);
CREATE POLICY qa_open_select ON orders FOR SELECT USING (true);
SET LOCAL ROLE authenticated;
SELECT wira_test.login('03000000-0000-0000-0000-000000000004');
SELECT wira_test.throws($q$UPDATE orders SET driver_id = auth.uid() WHERE title = 'Q3 pool'$q$,
    '%belum dibayar%', 'guard: driver cannot claim an unpaid order');
SELECT wira_test.throws($q$UPDATE orders SET status = 'accepted' WHERE title = 'Q3 pool'$q$,
    '%belum dibayar%', 'guard: driver cannot accept an unpaid order');
SELECT wira_test.login('03000000-0000-0000-0000-000000000003');
SELECT wira_test.throws($q$UPDATE orders SET status = 'pending' WHERE title = 'Q3 pool'$q$,
    '%belum dibayar%', 'guard: customer cannot move own unpaid order to pending');
ROLLBACK;

-- --- payment ------------------------------------------------------------------
SELECT id AS pool_order FROM orders WHERE title = 'Q3 pool' \gset
SELECT id AS pool_topup, amount AS pool_amount FROM topup_requests WHERE order_id = :'pool_order' \gset

SET ROLE authenticated;
SELECT wira_test.login('03000000-0000-0000-0000-000000000003');
SELECT wira_test.throws(format('SELECT approve_topup_and_credit(%L, %s, %L, %L)', :'pool_topup', :'pool_amount', 'manual', 'x'),
    '%permission denied%', 'customer cannot approve their own top-up');

SET ROLE service_role;
SELECT wira_test.throws(format('SELECT approve_topup_and_credit(%L, %s, %L, %L)', :'pool_topup', 150000, 'manual', 'x'),
    '%amount mismatch%', 'approval with the wrong amount raises');
SELECT wira_test.eq(approve_topup_and_credit(:'pool_topup', :'pool_amount', 'manual', 'QRIS test'),
    'approved', 'webhook approves the QRIS top-up');
RESET ROLE;

-- (new statement: 0078's deferred trigger has fired at commit)
DO $$
DECLARE o orders; v_amount numeric;
BEGIN
    SELECT * INTO o FROM orders WHERE title = 'Q3 pool';
    SELECT amount INTO v_amount FROM topup_requests WHERE order_id = o.id;
    PERFORM wira_test.eq(o.status, 'pending', 'approved QRIS order moves to pending (dispatchable)');
    PERFORM wira_test.eq(o.payment_status, 'paid', 'approved QRIS order is paid');
    PERFORM wira_test.eq((SELECT wallet_balance FROM users WHERE id = o.user_id), v_amount - 150000,
        'wallet keeps only the unique code (top-up credited, order debited)');
    PERFORM wira_test.eq((SELECT count(*) FROM transactions WHERE user_id = o.user_id AND type = 'topup' AND amount = v_amount),
        1::bigint, 'one topup ledger row');
    PERFORM wira_test.eq((SELECT count(*) FROM transactions WHERE user_id = o.user_id AND type = 'payment'
                            AND amount = 150000 AND reference_id = o.id::text),
        1::bigint, 'one payment ledger row referencing the order');
END $$;

SET ROLE service_role;
SELECT wira_test.eq(approve_topup_and_credit(:'pool_topup', :'pool_amount', 'manual', 'QRIS replay'),
    'already_processed', 'replayed approval is a no-op');
RESET ROLE;
DO $$
BEGIN
    PERFORM wira_test.eq((SELECT count(*) FROM transactions WHERE user_id = '03000000-0000-0000-0000-000000000003'),
        2::bigint, 'replay adds no ledger rows');
    PERFORM wira_test.eq((SELECT wallet_balance FROM users WHERE id = '03000000-0000-0000-0000-000000000003'),
        (SELECT amount - 150000 FROM topup_requests WHERE order_id = (SELECT id FROM orders WHERE title = 'Q3 pool')),
        'replay leaves the balance unchanged');
END $$;

-- Now a normal paid order: the driver can take it, but cannot re-hide it.
SET ROLE authenticated;
SELECT wira_test.login('03000000-0000-0000-0000-000000000004');
SELECT wira_test.eq(wira_test.rows($q$UPDATE orders SET driver_id = auth.uid(), status = 'accepted' WHERE title = 'Q3 pool'$q$),
    1::bigint, 'driver can claim the order once paid');
SELECT wira_test.throws($q$UPDATE orders SET status = 'awaiting_payment' WHERE title = 'Q3 pool'$q$,
    '%belum dibayar%', 'a live order cannot be moved back to awaiting_payment');

-- --- cancel + late payment ---------------------------------------------------
SELECT wira_test.login('03000000-0000-0000-0000-000000000006');
SELECT wira_test.throws(format('SELECT cancel_awaiting_qris_order(%L)', :'villa_order'),
    '%tidak sedang menunggu pembayaran QRIS%', 'another user cannot cancel the order');
SELECT wira_test.login('03000000-0000-0000-0000-000000000003');
SELECT cancel_awaiting_qris_order(:'villa_order');
SELECT wira_test.eq((SELECT status FROM orders WHERE id = :'villa_order'), 'cancelled', 'customer cancels own unpaid order');
SELECT wira_test.throws(format('SELECT cancel_awaiting_qris_order(%L)', :'villa_order'),
    '%tidak sedang menunggu pembayaran QRIS%', 'second cancel raises');

RESET ROLE;
SELECT id AS villa_topup, amount AS villa_amount FROM topup_requests WHERE order_id = :'villa_order' \gset
SELECT wallet_balance AS bal_before FROM users WHERE id = '03000000-0000-0000-0000-000000000003' \gset
SET ROLE service_role;
SELECT wira_test.eq(approve_topup_and_credit(:'villa_topup', :'villa_amount', 'manual', 'late'),
    'approved', 'late transfer for a cancelled order is still approved');
RESET ROLE;
SELECT wira_test.eq((SELECT status || '/' || payment_status FROM orders WHERE id = :'villa_order'),
    'cancelled/unpaid', 'cancelled order is not revived or charged by a late payment');
SELECT wira_test.eq((SELECT wallet_balance FROM users WHERE id = '03000000-0000-0000-0000-000000000003'),
    (:bal_before + :villa_amount)::numeric, 'late payment stays in the wallet');

-- --- expiry ---------------------------------------------------------------------
SET ROLE authenticated;
SELECT wira_test.login('03000000-0000-0000-0000-000000000003');
SELECT create_order_awaiting_qris(p_service_type => 'pool', p_title => 'Q3 stale', p_rate_code => 'bersih');
SELECT create_order_awaiting_qris(p_service_type => 'pool', p_title => 'Q3 fresh', p_rate_code => 'bersih');
SELECT wira_test.throws('SELECT expire_awaiting_qris_orders()', '%permission denied%',
    'authenticated cannot run the expiry job');
RESET ROLE;
UPDATE orders SET created_at = NOW() - INTERVAL '20 minutes' WHERE title = 'Q3 stale';
UPDATE topup_requests SET created_at = NOW() - INTERVAL '3 hours'
    WHERE order_id = (SELECT id FROM orders WHERE title = 'Q3 stale');
SET ROLE service_role;
SELECT expire_awaiting_qris_orders();
RESET ROLE;
SELECT wira_test.eq((SELECT status FROM orders WHERE title = 'Q3 stale'), 'cancelled', 'order unpaid after 15 min is cancelled');
SELECT wira_test.eq((SELECT status FROM orders WHERE title = 'Q3 fresh'), 'awaiting_payment', 'fresh unpaid order is kept');
SELECT wira_test.eq((SELECT status FROM topup_requests WHERE order_id = (SELECT id FROM orders WHERE title = 'Q3 stale')),
    'cancelled', 'linked top-up older than 2 h is cancelled');
SELECT wira_test.eq((SELECT status FROM topup_requests WHERE order_id = (SELECT id FROM orders WHERE title = 'Q3 fresh')),
    'pending', 'fresh linked top-up is kept');

SET ROLE anon;
SELECT wira_test.login(NULL);
SELECT wira_test.throws($q$SELECT create_order_awaiting_qris(p_service_type => 'pool', p_rate_code => 'bersih')$q$,
    '%permission denied%', 'anon cannot create QRIS orders');
RESET ROLE;
