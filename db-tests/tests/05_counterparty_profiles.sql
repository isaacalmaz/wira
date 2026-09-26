-- 0080: users/drivers rows are own-or-admin; counterparties get only
-- name/phone/vehicle_type via get_counterparty_profiles().
\echo '--- 05 counterparty profiles (0080): users_select own-only, get_counterparty_profiles rules, drivers visibility'

INSERT INTO users (id, name, phone, email, role, fcm_token, vehicle_type) VALUES
  ('05000000-0000-0000-0000-0000000000c1', 'K Cust1',  '0811', 'kc1@x', 'user',  'tokC1', NULL),
  ('05000000-0000-0000-0000-0000000000c2', 'K Cust2',  '0812', 'kc2@x', 'user',  'tokC2', NULL),
  ('05000000-0000-0000-0000-0000000000d1', 'K Driver', '0813', 'kd@x',  'mitra', 'tokD',  'motor'),
  ('05000000-0000-0000-0000-0000000000d2', 'K Driver2','0816', 'kd2@x', 'mitra', 'tokD2', 'mobil'),
  ('05000000-0000-0000-0000-0000000000e1', 'K Owner',  '0814', 'ko@x',  'mitra', 'tokO',  NULL),
  ('05000000-0000-0000-0000-0000000000a1', 'K Admin',  '0815', 'ka@x',  'admin', NULL,    NULL);
INSERT INTO drivers (id, lat, lng, vehicle_plate, is_online) VALUES
  ('05000000-0000-0000-0000-0000000000d1', -8.6, 116.1, 'DR 1234 AB', true),
  ('05000000-0000-0000-0000-0000000000d2', -8.7, 116.2, 'DR 5678 CD', true);
INSERT INTO merchants (id, owner_id, name, service_type) VALUES
  ('05000000-0000-0000-0000-0000000000f1', '05000000-0000-0000-0000-0000000000e1', 'K Villa', 'villa');
-- C1 has an active ride with D. C2 booked O's villa, had a (finished) ride
-- with D2, and reviewed D (no order between them).
INSERT INTO orders (user_id, driver_id, merchant_id, service_type, status, title) VALUES
  ('05000000-0000-0000-0000-0000000000c1', '05000000-0000-0000-0000-0000000000d1', NULL, 'ride', 'accepted', 'K c1 ride'),
  ('05000000-0000-0000-0000-0000000000c2', NULL, '05000000-0000-0000-0000-0000000000f1', 'villa', 'completed', 'K c2 villa'),
  ('05000000-0000-0000-0000-0000000000c2', '05000000-0000-0000-0000-0000000000d2', NULL, 'ride', 'completed', 'K c2 old ride');
INSERT INTO reviews (user_id, driver_id, rating) VALUES
  ('05000000-0000-0000-0000-0000000000c2', '05000000-0000-0000-0000-0000000000d1', 5);

\set ALL '{05000000-0000-0000-0000-0000000000c1,05000000-0000-0000-0000-0000000000c2,05000000-0000-0000-0000-0000000000d1,05000000-0000-0000-0000-0000000000d2,05000000-0000-0000-0000-0000000000e1,05000000-0000-0000-0000-0000000000a1}'

-- Profiles visible to the caller, as "name,name,..." (ordered).
CREATE FUNCTION pg_temp.profiles(p_ids uuid[]) RETURNS text LANGUAGE sql AS $$
    SELECT COALESCE(string_agg(name, ',' ORDER BY name), '') FROM public.get_counterparty_profiles(p_ids)
$$;
GRANT EXECUTE ON FUNCTION pg_temp.profiles(uuid[]) TO authenticated;

SET ROLE authenticated;

-- C1: sees own users row only; profile of own driver; the driver's drivers row.
SELECT wira_test.login('05000000-0000-0000-0000-0000000000c1');
SELECT wira_test.eq((SELECT string_agg(name, ',') FROM users), 'K Cust1', 'C1: users_select returns only own row');
SELECT wira_test.eq(pg_temp.profiles(:'ALL'), 'K Cust1,K Driver', 'C1: profiles = self + driver of own order');
SELECT wira_test.eq((SELECT phone || '/' || vehicle_type FROM get_counterparty_profiles(:'ALL') WHERE name = 'K Driver'),
    '0813/motor', 'C1: driver profile carries phone and vehicle_type');
SELECT wira_test.throws(format('SELECT fcm_token FROM get_counterparty_profiles(%L)', :'ALL'),
    '%column "fcm_token" does not exist%', 'profiles expose no fcm_token');
SELECT wira_test.throws(format('SELECT wallet_balance FROM get_counterparty_profiles(%L)', :'ALL'),
    '%column "wallet_balance" does not exist%', 'profiles expose no wallet_balance');
SELECT wira_test.eq((SELECT string_agg(vehicle_plate, ',') FROM drivers), 'DR 1234 AB',
    'C1: can read the drivers row of the driver on an active order');

-- C2: D2's ride is completed -> no drivers row; D2 is still a profile
-- counterparty (driver of an own order); the villa owner and D are not.
SELECT wira_test.login('05000000-0000-0000-0000-0000000000c2');
SELECT wira_test.eq((SELECT string_agg(name, ',') FROM users), 'K Cust2', 'C2: users_select returns only own row');
SELECT wira_test.eq(pg_temp.profiles(:'ALL'), 'K Cust2,K Driver2', 'C2: profiles = self + drivers of own orders (not the merchant owner)');
SELECT wira_test.eq((SELECT count(*) FROM drivers), 0::bigint, 'C2: no drivers rows once the ride is finished');

-- D: customers of orders driven (C1) + customers who reviewed D (C2).
SELECT wira_test.login('05000000-0000-0000-0000-0000000000d1');
SELECT wira_test.eq((SELECT string_agg(name, ',') FROM users), 'K Driver', 'D: users_select returns only own row');
SELECT wira_test.eq(pg_temp.profiles(:'ALL'), 'K Cust1,K Cust2,K Driver', 'D: profiles = self + own customers');
SELECT wira_test.eq((SELECT count(*) FROM drivers), 1::bigint, 'D: reads own drivers row');

-- O: customers of their merchant only.
SELECT wira_test.login('05000000-0000-0000-0000-0000000000e1');
SELECT wira_test.eq(pg_temp.profiles(:'ALL'), 'K Cust2,K Owner', 'O: profiles = self + customers of own merchant');
SELECT wira_test.eq((SELECT count(*) FROM drivers), 0::bigint, 'O: cannot read drivers rows');

-- Admin: everything.
SELECT wira_test.login('05000000-0000-0000-0000-0000000000a1');
SELECT wira_test.eq((SELECT count(*) FROM users WHERE name LIKE 'K %'), 6::bigint, 'admin reads all users rows');
SELECT wira_test.eq((SELECT count(*) FROM get_counterparty_profiles(:'ALL')), 6::bigint, 'admin gets all profiles');
SELECT wira_test.eq((SELECT count(*) FROM drivers WHERE id::text LIKE '05000000-%'), 2::bigint, 'admin reads drivers rows');

-- Locations: view closed to clients; nearest-driver RPC only for logged-in.
SELECT wira_test.throws('SELECT * FROM driver_locations', '%permission denied%', 'authenticated cannot read driver_locations');
SELECT wira_test.ok((SELECT count(*) FROM get_nearest_drivers(0, 0, NULL, true, 5)) >= 1,
    'authenticated can still call get_nearest_drivers');
RESET ROLE;

SET ROLE anon;
SELECT wira_test.login(NULL);
SELECT wira_test.throws(format('SELECT * FROM get_counterparty_profiles(%L)', :'ALL'), '%permission denied%',
    'anon cannot call get_counterparty_profiles');
SELECT wira_test.throws('SELECT * FROM drivers', '%permission denied%', 'anon cannot read drivers');
SELECT wira_test.throws('SELECT * FROM driver_locations', '%permission denied%', 'anon cannot read driver_locations');
SELECT wira_test.throws('SELECT * FROM get_nearest_drivers(0, 0, NULL, true, 5)', '%permission denied%',
    'anon cannot call get_nearest_drivers');
SELECT wira_test.throws('SELECT * FROM find_nearest_drivers(0, 0, NULL, true, 5)', '%permission denied%',
    'anon cannot call find_nearest_drivers');
RESET ROLE;
