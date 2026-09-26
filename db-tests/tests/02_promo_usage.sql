-- 0046 usage_limit + 0059 discount + 0076 server-side promo usage.
\echo '--- 02 promo usage: counted on the server, exhausted promo raises, client RPCs closed'

INSERT INTO users (id, name, role, wallet_balance) VALUES
  ('02000000-0000-0000-0000-000000000001', 'P1 customer', 'user', 100000),
  ('02000000-0000-0000-0000-000000000002', 'P2 customer', 'user', 100000),
  ('02000000-0000-0000-0000-00000000000a', 'P admin', 'admin', 0);
INSERT INTO vehicles (name, type, service_type, price, per_km_rate)
  VALUES ('Motor', 'motor', 'ride', 12000, 3000) ON CONFLICT DO NOTHING;
INSERT INTO pricing_rules (service_type, code, name, base_price)
  VALUES ('send', 'kecil', 'Paket Kecil', 20000) ON CONFLICT DO NOTHING;
INSERT INTO promos (title, code, service_type, type, discount, status, "validUntil", usage, usage_limit, per_user_limit) VALUES
  ('Ride 5K',   'T_RIDE5K',  'ride', 'Fixed',      5000, 'Active', '2099-12-31', 0, 2,    NULL),
  ('Send half', 'T_SEND50',  'send', 'Percentage', 50,   'Active', '2099-12-31', 0, NULL, 1),
  ('Expired',   'T_EXPIRED', 'ride', 'Fixed',      4000, 'Active', '2020-01-01', 0, NULL, NULL);

SET ROLE authenticated;
SELECT wira_test.login('02000000-0000-0000-0000-000000000001');
DO $$
DECLARE v_price numeric; o orders;
BEGIN
    -- 1st use (cash): 21000 - 5000.
    INSERT INTO orders (user_id, service_type, total_price, payment_method, rate_code, distance_meters, promo_code)
        VALUES (auth.uid(), 'ride', 1, 'cash', 'motor', 5000, 'T_RIDE5K') RETURNING total_price INTO v_price;
    PERFORM wira_test.eq(v_price, 16000::numeric, 'cash ride with T_RIDE5K costs 21000 - 5000');
    PERFORM wira_test.eq((SELECT usage FROM promos WHERE code = 'T_RIDE5K'), 1, 'promo usage counted by the orders trigger (1/2)');

    -- 2nd use (WiraPay).
    SELECT * INTO o FROM create_order_and_pay(p_service_type => 'ride', p_rate_code => 'motor',
        p_distance_meters => 5000, p_promo_code => 'T_RIDE5K');
    PERFORM wira_test.eq(o.total_price, 16000::numeric, 'wallet ride with T_RIDE5K charged 16000');
    PERFORM wira_test.eq((SELECT usage FROM promos WHERE code = 'T_RIDE5K'), 2, 'promo usage counted for wallet order too (2/2)');

    -- Expired promo: no discount, not counted, no error.
    INSERT INTO orders (user_id, service_type, payment_method, rate_code, distance_meters, promo_code)
        VALUES (auth.uid(), 'ride', 'cash', 'motor', 5000, 'T_EXPIRED') RETURNING total_price INTO v_price;
    PERFORM wira_test.eq(v_price, 21000::numeric, 'expired promo gives no discount');
    PERFORM wira_test.eq((SELECT usage FROM promos WHERE code = 'T_EXPIRED'), 0, 'expired promo is not counted');
END $$;

-- Exhausted: both paths raise and nothing is created or charged.
SELECT wira_test.login('02000000-0000-0000-0000-000000000002');
SELECT wira_test.throws($q$INSERT INTO orders (user_id, service_type, payment_method, rate_code, distance_meters, promo_code)
    VALUES (auth.uid(), 'ride', 'cash', 'motor', 5000, 'T_RIDE5K')$q$,
    '%Kuota promo T_RIDE5K sudah habis%', 'exhausted promo raises on a cash order');
SELECT wira_test.throws($q$SELECT create_order_and_pay(p_service_type => 'ride', p_rate_code => 'motor',
    p_distance_meters => 5000, p_promo_code => 'T_RIDE5K')$q$,
    '%Kuota promo T_RIDE5K sudah habis%', 'exhausted promo raises on a wallet order');

-- per_user_limit = 1: second use by the same user raises, another user is fine.
SELECT wira_test.login('02000000-0000-0000-0000-000000000001');
INSERT INTO orders (user_id, service_type, title, payment_method, rate_code, promo_code)
    VALUES (auth.uid(), 'send', 'P1 send half', 'cash', 'kecil', 'T_SEND50');
SELECT wira_test.throws($q$INSERT INTO orders (user_id, service_type, payment_method, rate_code, promo_code)
    VALUES (auth.uid(), 'send', 'cash', 'kecil', 'T_SEND50')$q$,
    '%sudah Anda gunakan sebanyak batas maksimal%', 'per_user_limit=1: second use by same user raises');
SELECT wira_test.login('02000000-0000-0000-0000-000000000002');
WITH x AS (INSERT INTO orders (user_id, service_type, payment_method, rate_code, promo_code)
    VALUES (auth.uid(), 'send', 'cash', 'kecil', 'T_SEND50') RETURNING total_price)
SELECT wira_test.eq((SELECT total_price FROM x), 10000::numeric, 'per_user_limit is per user: P2 still gets 50% off');

-- A cancelled order does not count against per_user_limit.
RESET ROLE;
UPDATE orders SET status = 'cancelled' WHERE title = 'P1 send half';
SET ROLE authenticated;
SELECT wira_test.login('02000000-0000-0000-0000-000000000001');
WITH x AS (INSERT INTO orders (user_id, service_type, payment_method, rate_code, promo_code)
    VALUES (auth.uid(), 'send', 'cash', 'kecil', 'T_SEND50') RETURNING total_price)
SELECT wira_test.eq((SELECT total_price FROM x), 10000::numeric, 'cancelled order frees the per-user slot');

-- Clients can no longer bump or reset usage themselves.
DO $$
BEGIN
    PERFORM wira_test.throws($q$SELECT increment_promo_usage((SELECT id FROM promos WHERE code = 'T_SEND50'))$q$,
        '%permission denied%', 'authenticated cannot call increment_promo_usage (0076 REVOKE)');
    PERFORM wira_test.throws($q$SELECT consume_promo_for_order('T_SEND50', 'send', auth.uid())$q$,
        '%Only callable from the orders trigger%', 'consume_promo_for_order cannot be called directly');
    PERFORM wira_test.eq(wira_test.rows($q$UPDATE promos SET usage = 0, usage_limit = NULL WHERE code = 'T_RIDE5K'$q$),
        0::bigint, 'non-admin UPDATE on promos affects 0 rows (RLS)');
    PERFORM wira_test.eq((SELECT usage FROM promos WHERE code = 'T_RIDE5K'), 2, 'T_RIDE5K usage still 2/2');
END $$;

SELECT wira_test.login('02000000-0000-0000-0000-00000000000a');
SELECT wira_test.eq(wira_test.rows($q$UPDATE promos SET usage_limit = 3 WHERE code = 'T_RIDE5K'$q$),
    1::bigint, 'admin can edit promos (0046 policy)');
RESET ROLE;

SELECT wira_test.eq((SELECT wallet_balance FROM users WHERE id = '02000000-0000-0000-0000-000000000002'),
    100000::numeric, 'rejected wallet order with exhausted promo charged nothing');
SELECT wira_test.throws($q$UPDATE promos SET per_user_limit = 0 WHERE code = 'T_RIDE5K'$q$,
    '%promos_per_user_limit_positive%', 'per_user_limit must be > 0 (0076 CHECK)');
SET ROLE service_role;
SELECT wira_test.ok(increment_promo_usage((SELECT id FROM promos WHERE code = 'T_RIDE5K')),
    'service_role can still call increment_promo_usage');
RESET ROLE;
