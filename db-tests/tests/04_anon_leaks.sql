-- 0079: the public anon key can no longer read users/orders/topup_requests;
-- logged-in branches unchanged.
\echo '--- 04 anon leaks (0079): anon denied on users/orders/topup_requests'

INSERT INTO users (id, name, email, role, wallet_balance, fcm_token) VALUES
  ('04000000-0000-0000-0000-0000000000c1', 'L C1', 'lc1@x', 'user', 10, 'tokC1'),
  ('04000000-0000-0000-0000-0000000000c2', 'L C2', 'lc2@x', 'user', 20, 'tokC2'),
  ('04000000-0000-0000-0000-0000000000d1', 'L Driver', 'ld@x', 'mitra', 30, 'tokD');
INSERT INTO orders (user_id, driver_id, service_type, status, title) VALUES
  (NULL, '04000000-0000-0000-0000-0000000000d1', 'ride', 'completed', 'L guest old'),
  ('04000000-0000-0000-0000-0000000000c1', NULL, 'ride', 'pending', 'L c1 pending'),
  ('04000000-0000-0000-0000-0000000000c2', NULL, 'ride', 'pending', 'L c2 pending');
INSERT INTO topup_requests (user_id, amount) VALUES
  ('04000000-0000-0000-0000-0000000000c1', 50123),
  ('04000000-0000-0000-0000-0000000000c2', 50456);

SET ROLE anon;
SELECT wira_test.login(NULL);
DO $$
BEGIN
    PERFORM wira_test.throws('SELECT id FROM users', '%permission denied for table users%', 'anon cannot SELECT users');
    PERFORM wira_test.throws('SELECT id FROM orders', '%permission denied for table orders%', 'anon cannot SELECT orders');
    PERFORM wira_test.throws('SELECT id FROM topup_requests', '%permission denied for table topup_requests%', 'anon cannot SELECT topup_requests');
    PERFORM wira_test.throws($q$UPDATE orders SET title = 'pwned' WHERE title = 'L c1 pending'$q$,
        '%permission denied for table orders%', 'anon cannot UPDATE orders');
    PERFORM wira_test.throws($q$INSERT INTO topup_requests (user_id, amount) VALUES (NULL, 1000)$q$,
        '%permission denied for table topup_requests%', 'anon cannot INSERT topup_requests');
END $$;
RESET ROLE;

-- Policies are closed too, should the default grants ever come back.
DO $$
BEGIN
    PERFORM wira_test.eq((SELECT count(*) FROM pg_policies WHERE tablename = 'topup_requests'
                          AND policyname = 'Anyone can check pending amounts'), 0::bigint,
        '"Anyone can check pending amounts" policy dropped');
    PERFORM wira_test.ok((SELECT bool_and(COALESCE(qual, '') || COALESCE(with_check, '') NOT LIKE '%auth.uid() IS NULL%') FROM pg_policies
                          WHERE tablename IN ('users', 'orders')),
        'no users/orders policy has an auth.uid() IS NULL (guest) branch left');
END $$;

SET ROLE authenticated;
SELECT wira_test.login('04000000-0000-0000-0000-0000000000c1');
DO $$
BEGIN
    PERFORM wira_test.eq((SELECT string_agg(amount::text, ',') FROM topup_requests), '50123',
        'customer sees only own top-ups, not other users'' pending ones');
    PERFORM wira_test.eq((SELECT string_agg(title, ',' ORDER BY title) FROM orders WHERE title LIKE 'L %'),
        'L c1 pending,L c2 pending', 'logged-in job feed still sees unassigned pending orders, not the guest order');
END $$;
SELECT wira_test.login('04000000-0000-0000-0000-0000000000d1');
SELECT wira_test.eq((SELECT count(*) FROM orders WHERE title = 'L guest old'), 1::bigint,
    'driver still sees the orders they drove');
RESET ROLE;
