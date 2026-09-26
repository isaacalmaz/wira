-- 0084/0085: mitra applications leave the public feature_flags row.
\echo '--- 07 mitra applications (0084/0085): legacy copy, privacy, submit RPC, feature_flags locked'

INSERT INTO users (id, name, role) VALUES
  ('07000000-0000-0000-0000-0000000000a1', 'M Admin', 'admin'),
  ('07000000-0000-0000-0000-0000000000c1', 'M Applicant', 'user'),
  ('07000000-0000-0000-0000-0000000000c2', 'M Other', 'user');
INSERT INTO auth.users (id, email, created_at) VALUES
  ('07000000-0000-0000-0000-0000000000c1', 'applicant@x', NOW() - INTERVAL '3 days'),
  ('07000000-0000-0000-0000-0000000000c2', 'other@x', NOW() - INTERVAL '3 days'),
  ('07000000-0000-0000-0000-0000000000f1', 'fresh@x', NOW() - INTERVAL '5 minutes'),
  ('07000000-0000-0000-0000-0000000000f2', 'stale@x', NOW() - INTERVAL '2 hours');

-- --- 0085: legacy list copied, then removed -----------------------------------
SELECT wira_test.eq((SELECT count(*) FROM mitra_applications), 2::bigint,
    'legacy entries copied, older duplicate pending entry for the same account/role skipped');
SELECT wira_test.ok((SELECT name = 'Legacy Driver' AND plate = 'DR 1 LG' AND sim_photo LIKE 'data:image%'
    AND created_at = '2026-09-20T10:00:00Z' FROM mitra_applications WHERE legacy_id = 'MTR-000003'),
    'newest legacy entry kept with its fields and timestamp');
SELECT wira_test.ok((SELECT auth_id IS NULL AND status = 'Active' AND reviewed_at IS NOT NULL
    FROM mitra_applications WHERE legacy_id = 'MTR-000001'), 'entry without a valid auth_id is kept, auth_id NULL');
SELECT wira_test.eq((SELECT count(*) FROM feature_flags WHERE region = 'mitra_registrations'), 0::bigint,
    'legacy feature_flags row deleted');
SELECT wira_test.eq((SELECT count(*) FROM feature_flags WHERE region = 'features_config'), 1::bigint,
    'other feature flags untouched');

-- --- nobody but the applicant/admin reads applications ------------------------
SET ROLE anon;
SELECT wira_test.login(NULL);
SELECT wira_test.throws('SELECT 1 FROM mitra_applications', '%permission denied%', 'anon cannot read applications');
SELECT wira_test.throws($q$UPDATE feature_flags SET features = '[]' WHERE region = 'features_config'$q$,
    '%permission denied%', 'anon cannot write feature_flags');
RESET ROLE;
SET ROLE authenticated;
SELECT wira_test.login('07000000-0000-0000-0000-0000000000c2');
SELECT wira_test.eq(wira_test.rows('SELECT 1 FROM mitra_applications'), 0::bigint, 'another user sees no applications');
SELECT wira_test.throws($q$INSERT INTO feature_flags (region, features) VALUES ('mitra_registrations', '[]')$q$,
    '%row-level security%', 'non-admin cannot recreate the mitra_registrations row');
SELECT wira_test.eq(wira_test.rows($q$UPDATE feature_flags SET features = '{}' WHERE region = 'features_config'$q$),
    0::bigint, 'non-admin cannot edit feature flags');

-- --- submit_mitra_application -------------------------------------------------
SELECT wira_test.login('07000000-0000-0000-0000-0000000000c1');
SELECT submit_mitra_application('{"role": "driver", "name": "M Applicant", "phone": "0811", "email": "spoof@x",
    "plate": "DR 7 AP", "sim_photo": "data:image/jpeg;base64,BBB", "job_type_preferences": ["ride", "send"]}');
SELECT submit_mitra_application('{"role": "driver", "name": "M Applicant", "phone": "0811", "plate": "DR 8 AP"}');
SELECT wira_test.eq(wira_test.rows('SELECT 1 FROM mitra_applications'), 1::bigint,
    'resubmitting replaces the own pending application; applicant sees only their own');
SELECT wira_test.ok((SELECT plate = 'DR 8 AP' AND email = 'applicant@x' AND status = 'Pending' FROM mitra_applications),
    'stored with latest data and the account email (not the one sent)');
SELECT wira_test.throws($q$SELECT submit_mitra_application('{"role": "admin"}')$q$, '%Jenis mitra tidak valid%',
    'unknown role refused');
SELECT wira_test.throws($q$INSERT INTO mitra_applications (auth_id, role) VALUES (auth.uid(), 'driver')$q$,
    '%permission denied%', 'no direct INSERT; only the RPC');
SELECT wira_test.eq(wira_test.rows($q$UPDATE mitra_applications SET status = 'Active'$q$), 0::bigint,
    'applicant cannot approve themselves');
SELECT submit_mitra_application('{"role": "technician", "name": "M Applicant", "specialization": "ac", "experience": "2"}');
RESET ROLE;

-- Without a session (sign-up with email confirmation): fresh account only, once.
SET ROLE anon;
SELECT wira_test.login(NULL);
SELECT submit_mitra_application('{"role": "merchant", "name": "Fresh", "restaurant_name": "Warung F"}',
    '07000000-0000-0000-0000-0000000000f1');
SELECT wira_test.throws($q$SELECT submit_mitra_application('{"role": "villa"}', '07000000-0000-0000-0000-0000000000f1')$q$,
    '%login%', 'no-session submit only works once per account');
SELECT wira_test.throws($q$SELECT submit_mitra_application('{"role": "driver"}', '07000000-0000-0000-0000-0000000000f2')$q$,
    '%login%', 'no-session submit refused for an account older than 1 hour');
SELECT wira_test.throws($q$SELECT submit_mitra_application('{"role": "driver"}', '07000000-0000-0000-0000-0000000000c2')$q$,
    '%login%', 'no-session submit refused for an existing account');
RESET ROLE;
SELECT wira_test.ok((SELECT email = 'fresh@x' AND role = 'merchant' FROM mitra_applications
    WHERE auth_id = '07000000-0000-0000-0000-0000000000f1'), 'no-session submit stored for the fresh account');

-- --- admin review + technician profiles ---------------------------------------
SET ROLE authenticated;
SELECT wira_test.login('07000000-0000-0000-0000-0000000000a1');
SELECT wira_test.eq(wira_test.rows('SELECT 1 FROM mitra_applications'), 5::bigint, 'admin sees every application');
SELECT wira_test.eq(wira_test.rows($q$UPDATE mitra_applications SET status = 'Active', reviewed_at = NOW()
    WHERE auth_id = '07000000-0000-0000-0000-0000000000c1' AND role = 'driver'$q$), 1::bigint, 'admin can approve');
SELECT wira_test.login('07000000-0000-0000-0000-0000000000c2');
SELECT wira_test.eq((SELECT specialization || '/' || experience FROM get_technician_profiles()
    WHERE id = '07000000-0000-0000-0000-0000000000c1'), 'ac/2', 'technician specialization is public via the RPC');
SELECT wira_test.eq((SELECT count(*) FROM get_technician_profiles()), 1::bigint, 'only technicians with an account');
RESET ROLE;
