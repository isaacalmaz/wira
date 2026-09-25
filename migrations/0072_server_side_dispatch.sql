-- Migration 0072: server-side sequential driver dispatch (see README entry).
-- Dispatch used to run only in the customer's open browser tab
-- (useOrderDispatch.js): closing the app stopped all driver pings. Now the
-- backend (/api/dispatch/*) picks and pings the next driver, triggered by
-- pg_cron (0073) and by the customer's open app. The ping log + row lock
-- keep it to one ping per order per 15s no matter who triggers it.
-- Everything here is service_role only.

CREATE TABLE IF NOT EXISTS public.order_dispatch_pings (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL,
    round INT NOT NULL DEFAULT 1,
    pinged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS order_dispatch_pings_order_idx
    ON public.order_dispatch_pings (order_id, pinged_at DESC);
-- RLS on with no policies: only service_role / definer functions touch it.
ALTER TABLE public.order_dispatch_pings ENABLE ROW LEVEL SECURITY;

-- Pending, unassigned, recent (30 min) orders whose last ping is >15s old.
CREATE OR REPLACE FUNCTION public.dispatch_due_orders(p_limit INT DEFAULT 20)
RETURNS SETOF UUID AS $$
    SELECT o.id FROM public.orders o
    WHERE o.status = 'pending' AND o.driver_id IS NULL
      AND o.service_type IN ('ride', 'send', 'pool', 'service')
      AND o.created_at > NOW() - INTERVAL '30 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.order_dispatch_pings p
                      WHERE p.order_id = o.id AND p.pinged_at > NOW() - INTERVAL '15 seconds')
    ORDER BY o.created_at
    LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Picks (and logs) the next candidate for one order, or returns
-- driver_id NULL when nothing is due. Counts are for the current round.
CREATE OR REPLACE FUNCTION public.dispatch_next_ping(p_order_id UUID)
RETURNS TABLE (driver_id UUID, service_type TEXT, pinged_count INT, total_candidates INT) AS $$
DECLARE
    o RECORD;
    v_cands UUID[];
    v_round INT;
    v_last TIMESTAMPTZ;
    v_next UUID;
BEGIN
    SELECT x.id, x.user_id, x.status, x.driver_id, x.service_type,
           x.pickup_lat, x.pickup_lng, x.rate_code
    INTO o FROM public.orders x WHERE x.id = p_order_id FOR UPDATE;
    IF NOT FOUND OR o.status <> 'pending' OR o.driver_id IS NOT NULL
       OR o.service_type NOT IN ('ride', 'send', 'pool', 'service') THEN
        RETURN;
    END IF;

    IF o.service_type IN ('ride', 'send') THEN
        SELECT COALESCE(array_agg(n.id ORDER BY n.distance_meters), '{}') INTO v_cands
        FROM public.get_nearest_drivers(o.pickup_lat, o.pickup_lng,
             CASE WHEN o.service_type = 'ride' THEN o.rate_code END, true, 10) n
        WHERE o.pickup_lat IS NOT NULL AND n.id <> o.user_id;
    ELSE
        SELECT COALESCE(array_agg(t.id ORDER BY t.id), '{}') INTO v_cands
        FROM public.list_technicians() t WHERE t.id <> o.user_id;
    END IF;

    SELECT COALESCE(MAX(p.round), 1), MAX(p.pinged_at) INTO v_round, v_last
    FROM public.order_dispatch_pings p WHERE p.order_id = p_order_id;

    IF v_last IS NULL OR v_last <= NOW() - INTERVAL '15 seconds' THEN
        SELECT c INTO v_next FROM unnest(v_cands) WITH ORDINALITY AS u(c, i)
        WHERE c NOT IN (SELECT p.driver_id FROM public.order_dispatch_pings p
                        WHERE p.order_id = p_order_id AND p.round = v_round)
        ORDER BY i LIMIT 1;
        IF v_next IS NULL AND cardinality(v_cands) > 0 THEN
            -- Everyone in this round was pinged: start over from the nearest.
            v_round := v_round + 1;
            v_next := v_cands[1];
        END IF;
        IF v_next IS NOT NULL THEN
            INSERT INTO public.order_dispatch_pings (order_id, driver_id, round)
            VALUES (p_order_id, v_next, v_round);
        END IF;
    END IF;

    RETURN QUERY SELECT v_next, o.service_type,
        (SELECT COUNT(*)::INT FROM public.order_dispatch_pings p
         WHERE p.order_id = p_order_id AND p.round = v_round),
        cardinality(v_cands);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.dispatch_due_orders(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_next_ping(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_due_orders(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_next_ping(UUID) TO service_role;
