-- 0059 server-side price + 0070 atomic WiraPay checkout + 0074 login required.
\echo '--- 01 wallet checkout: create_order_and_pay charges the server price; clients cannot create paid/wallet orders'

-- Fixtures (as the migration owner, i.e. RLS/trigger-exempt).
INSERT INTO users (id, name, role, wallet_balance) VALUES
  ('01000000-0000-0000-0000-000000000001', 'W1 rich customer', 'user', 100000),
  ('01000000-0000-0000-0000-000000000002', 'W2 broke customer', 'user', 5000);
INSERT INTO vehicles (name, type, service_type, price, per_km_rate)
  VALUES ('Motor', 'motor', 'ride', 12000, 3000);
INSERT INTO pricing_rules (service_type, code, name, base_price)
  VALUES ('send', 'kecil', 'Paket Kecil', 20000), ('pool', 'bersih', 'Kuras kolam', 150000);

SET ROLE authenticated;
SELECT wira_test.login('01000000-0000-0000-0000-000000000001');

-- 5 km motor ride: 12000 + ceil((5 - 2) * 3000) = 21000, whatever the client says.
DO $$
DECLARE o orders;
BEGIN
    SELECT * INTO o FROM create_order_and_pay(
        p_service_type => 'ride', p_title => 'W1 wallet ride', p_total_price => 1,
        p_rate_code => 'motor', p_distance_meters => 5000);
    PERFORM wira_test.eq(o.total_price, 21000::numeric, 'create_order_and_pay ignores client price 1, charges server price 21000');
    PERFORM wira_test.eq(o.payment_method, 'wallet', 'order is a wallet order');
    PERFORM wira_test.eq(o.payment_status, 'paid', 'order is paid');
    PERFORM wira_test.eq(o.status, 'pending', 'order is pending (dispatchable)');
    PERFORM wira_test.eq(o.user_id, auth.uid(), 'order belongs to caller');
END $$;

RESET ROLE;
DO $$
BEGIN
    PERFORM wira_test.eq((SELECT wallet_balance FROM users WHERE id = '01000000-0000-0000-0000-000000000001'),
        79000::numeric, 'wallet debited exactly the server price (100000 - 21000)');
    PERFORM wira_test.eq((SELECT count(*) FROM transactions t JOIN orders o ON o.id::text = t.reference_id
                          WHERE t.user_id = '01000000-0000-0000-0000-000000000001' AND t.type = 'payment'
                            AND t.amount = 21000 AND o.title = 'W1 wallet ride'),
        1::bigint, 'one payment ledger row referencing the order');
END $$;

SET ROLE authenticated;
SELECT wira_test.login('01000000-0000-0000-0000-000000000001');
DO $$
DECLARE v_id uuid;
BEGIN
    -- Direct client inserts that would skip the wallet debit.
    PERFORM wira_test.throws($q$INSERT INTO orders (user_id, service_type, payment_method, rate_code)
        VALUES (auth.uid(), 'send', 'wallet', 'kecil')$q$,
        '%must be created via create_order_and_pay%', 'client cannot INSERT a wallet order directly');
    PERFORM wira_test.throws($q$INSERT INTO orders (user_id, service_type, payment_method, payment_status, rate_code)
        VALUES (auth.uid(), 'send', 'cash', 'paid', 'kecil')$q$,
        '%payment_status = unpaid%', 'client cannot INSERT an already-paid order');
    PERFORM wira_test.throws($q$INSERT INTO orders (user_id, service_type, status, rate_code)
        VALUES (auth.uid(), 'send', 'completed', 'kecil')$q$,
        '%status = pending%', 'client cannot INSERT an order in a later status');

    -- Cash order: allowed, but the price is still the server's.
    INSERT INTO orders (user_id, service_type, title, total_price, payment_method, rate_code)
        VALUES (auth.uid(), 'send', 'W1 cash send', 1, 'cash', 'kecil') RETURNING id INTO v_id;
    PERFORM wira_test.eq((SELECT total_price FROM orders WHERE id = v_id), 20000::numeric,
        'cash send order gets server price 20000, not client 1');

    -- ...and can't be flipped to paid or repriced afterwards.
    PERFORM wira_test.throws(format('UPDATE orders SET payment_status = %L WHERE id = %L', 'paid', v_id),
        '%Only status and driver assignment%', 'client cannot mark a cash order paid');
    PERFORM wira_test.throws(format('UPDATE orders SET total_price = 1 WHERE id = %L', v_id),
        '%total_price cannot be changed%', 'client cannot change total_price');

    -- charge_wallet_for_order only pays the caller's own pending unpaid wallet order.
    PERFORM wira_test.throws(format('SELECT charge_wallet_for_order(%L)', v_id),
        '%tidak menunggu pembayaran WiraPay%', 'charge_wallet_for_order refuses a cash order');

    -- Price inputs are mandatory for a wallet charge.
    PERFORM wira_test.throws($q$SELECT create_order_and_pay(p_service_type => 'ride', p_total_price => 1, p_rate_code => 'motor')$q$,
        '%tidak lengkap%', 'create_order_and_pay refuses a ride without distance (no server price)');
    PERFORM wira_test.throws($q$SELECT create_order_and_pay(p_service_type => 'ride', p_rate_code => 'jet', p_distance_meters => 1000)$q$,
        '%Invalid or inactive rate_code%', 'unknown rate_code is rejected');
END $$;

-- Insufficient balance: nothing is created, nothing is debited.
SELECT wira_test.login('01000000-0000-0000-0000-000000000002');
SELECT wira_test.throws($q$SELECT create_order_and_pay(p_service_type => 'send', p_rate_code => 'kecil', p_title => 'W2 wallet send')$q$,
    '%Saldo WiraPay tidak mencukupi%', 'create_order_and_pay raises on insufficient balance');
SELECT wira_test.throws(
    format('SELECT charge_wallet_for_order(%L)', (SELECT id FROM orders WHERE title = 'W1 cash send')),
    '%tidak berhak%', 'charge_wallet_for_order refuses another user''s order');

-- 0074: a logged-in user cannot create a guest/foreign order either.
SELECT wira_test.throws($q$INSERT INTO orders (user_id, service_type, rate_code) VALUES (NULL, 'send', 'kecil')$q$,
    '%row-level security%', 'authenticated cannot INSERT an order with user_id NULL');
SELECT wira_test.throws($q$INSERT INTO orders (user_id, service_type, rate_code) VALUES ('01000000-0000-0000-0000-000000000001', 'send', 'kecil')$q$,
    '%row-level security%', 'authenticated cannot INSERT an order for someone else');

RESET ROLE;
DO $$
BEGIN
    PERFORM wira_test.eq((SELECT wallet_balance FROM users WHERE id = '01000000-0000-0000-0000-000000000002'),
        5000::numeric, 'failed checkout left the balance untouched');
    PERFORM wira_test.eq((SELECT count(*) FROM orders WHERE user_id = '01000000-0000-0000-0000-000000000002'),
        0::bigint, 'failed checkout rolled back the order insert');
END $$;

-- anon: no RPC, no insert (0070 REVOKE, 0074 REVOKE INSERT).
SET ROLE anon;
SELECT wira_test.login(NULL);
SELECT wira_test.throws($q$SELECT create_order_and_pay(p_service_type => 'send', p_rate_code => 'kecil')$q$,
    '%permission denied%', 'anon cannot call create_order_and_pay');
SELECT wira_test.throws($q$INSERT INTO orders (user_id, service_type, rate_code) VALUES (NULL, 'send', 'kecil')$q$,
    '%permission denied%', 'anon cannot INSERT orders (guest checkout gone, 0074)');
RESET ROLE;
