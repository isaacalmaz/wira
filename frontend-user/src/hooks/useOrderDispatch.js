import { useState, useEffect } from 'react';
import API_BASE_URL from '../config/api';

const TICK_INTERVAL_MS = 15000; // 15 seconds

// Driver dispatch now runs on the server (backend/routes/dispatch.routes.js,
// migrations/0072): pg_cron keeps pinging drivers one by one even after this
// app is closed. While the order page is open we also nudge the server for
// this order and read back the progress for the "x dari y driver" line. The
// server rate-limits pings per order, so these nudges never double-ping.
export function useOrderDispatch(order, session) {
  const [pingedCount, setPingedCount] = useState(0);
  const [totalCandidates, setTotalCandidates] = useState(0);

  useEffect(() => {
    if (!order || order.status !== 'pending' || order.driver_id || !session?.access_token) {
      return;
    }
    if (!['ride', 'send', 'pool', 'service'].includes(order.service_type)) {
      return;
    }

    let isSubscribed = true;
    let timerId = null;

    const tick = async () => {
      if (!isSubscribed) return;
      try {
        const res = await fetch(`${API_BASE_URL}/dispatch/orders/${order.id}/tick`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        const body = await res.json().catch(() => null);
        if (res.ok && body?.data && isSubscribed) {
          setPingedCount(body.data.pingedCount || 0);
          setTotalCandidates(body.data.totalCandidates || 0);
        } else if (!res.ok) {
          console.error('Dispatch tick failed:', res.status, body?.message);
        }
      } catch (err) {
        console.error('Dispatch tick error:', err);
      }
      if (isSubscribed) {
        timerId = setTimeout(tick, TICK_INTERVAL_MS);
      }
    };

    timerId = setTimeout(tick, 1000); // initial delay 1s

    return () => {
      isSubscribed = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [order?.id, order?.status, order?.driver_id, order?.service_type, session?.access_token]);

  return { pingedCount, totalCandidates };
}
