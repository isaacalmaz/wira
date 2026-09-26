-- =============================================================================
-- db-tests/helpers.sql - tiny assertion library used by db-tests/tests/*.sql.
-- Every helper RAISEs on failure; run.sh runs psql with ON_ERROR_STOP=1, so
-- the first failed assertion aborts the run with a non-zero exit code.
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS wira_test;
GRANT USAGE ON SCHEMA wira_test TO anon, authenticated, service_role;

-- Act as a Supabase user (NULL = no JWT, i.e. anon). Session-level, like a
-- PostgREST request's claims; pair with SET ROLE authenticated/anon.
CREATE OR REPLACE FUNCTION wira_test.login(p_user UUID) RETURNS void
LANGUAGE sql AS $$
    SELECT set_config('request.jwt.claim.sub', COALESCE(p_user::text, ''), false)
$$;

CREATE OR REPLACE FUNCTION wira_test.ok(p_cond BOOLEAN, p_msg TEXT) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF p_cond IS NOT TRUE THEN
        RAISE EXCEPTION 'FAIL: %', p_msg;
    END IF;
    RAISE NOTICE 'ok - %', p_msg;
END;
$$;

CREATE OR REPLACE FUNCTION wira_test.eq(p_actual ANYELEMENT, p_expected ANYELEMENT, p_msg TEXT) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF p_actual IS DISTINCT FROM p_expected THEN
        RAISE EXCEPTION 'FAIL: % (expected %, got %)', p_msg, p_expected, p_actual;
    END IF;
    RAISE NOTICE 'ok - %', p_msg;
END;
$$;

-- Runs p_sql as the CURRENT role (SECURITY INVOKER) inside a subtransaction
-- and asserts it raises an error whose message matches p_pattern (ILIKE).
-- Nothing p_sql did survives either way.
CREATE OR REPLACE FUNCTION wira_test.throws(p_sql TEXT, p_pattern TEXT, p_msg TEXT) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_err TEXT;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;
    IF v_err IS NULL THEN
        RAISE EXCEPTION 'FAIL: % (statement succeeded, expected error like "%"): %', p_msg, p_pattern, p_sql;
    END IF;
    IF v_err NOT ILIKE p_pattern THEN
        RAISE EXCEPTION 'FAIL: % (expected error like "%", got "%")', p_msg, p_pattern, v_err;
    END IF;
    RAISE NOTICE 'ok - % [%]', p_msg, v_err;
END;
$$;

-- Number of rows p_sql affects/returns, run as the current role.
CREATE OR REPLACE FUNCTION wira_test.rows(p_sql TEXT) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_n BIGINT;
BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA wira_test TO anon, authenticated, service_role;
