import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const PING_INTERVAL_MS = 15000; // 15 seconds

export function useOrderDispatch(order, session) {
  const [pingedCount, setPingedCount] = useState(0);
  const [totalCandidates, setTotalCandidates] = useState(0);

  useEffect(() => {
    // Only dispatch if order is pending and has no driver
    if (!order || order.status !== 'pending' || order.driver_id || !session?.access_token) {
      return;
    }

    let isSubscribed = true;
    let timerId = null;
    let currentCandidates = null;
    let pingedList = [];

    const runDispatchRound = async () => {
      if (!isSubscribed) return;

      try {
        // 1. Fetch candidates if we don't have them yet
        if (!currentCandidates) {
          if (['ride', 'send'].includes(order.service_type)) {
             const { data, error } = await supabase.rpc('get_nearest_drivers', {
               user_lat: order.pickup_lat,
               user_lng: order.pickup_lng,
               target_vehicle_type: null,
               only_online: true,
               max_results: 10
             });
             if (error) throw error;
             currentCandidates = data || [];
          } else if (['pool', 'service'].includes(order.service_type)) {
             const { data, error } = await supabase.rpc('list_technicians');
             if (error) throw error;
             currentCandidates = data || [];
          } else if (order.service_type === 'food') {
             // WiraFood doesn't use drivers yet in this stage (merchant accepts first)
             return; 
          } else {
             return;
          }
          if (isSubscribed) setTotalCandidates(currentCandidates.length);
        }

        if (!currentCandidates || currentCandidates.length === 0) {
          // Tidak ada driver sama sekali. Refresh candidates untuk putaran selanjutnya.
          currentCandidates = null;
        } else {
          // 2. Find the next candidate who hasn't been pinged
          const nextCandidate = currentCandidates.find(c => !pingedList.includes(c.id));
          
          if (!nextCandidate) {
            console.log("Semua kandidat telah di-ping. Mencari ulang kandidat baru...");
            // Jika semua sudah di-ping, reset kandidat agar fetch ulang di putaran berikutnya
            currentCandidates = null;
          } else {
            // 3. Ping the candidate
            console.log(`Dispatching order to candidate ${nextCandidate.id} (distance: ${nextCandidate.dist_km || '?'} km)`);
            fetch(`${API_BASE_URL}/notifications/order-alert`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                userId: nextCandidate.id,
                title: `Pesanan Baru: Wira ${order.service_type.toUpperCase()}`,
                body: `Ada pesanan menunggu di dekat Anda. Ketuk untuk melihat!`,
                data: { orderId: order.id, type: 'new_order' },
              }),
            }).catch(err => console.error('Dispatch ping failed:', err));

            // 4. Mark as pinged
            pingedList.push(nextCandidate.id);
            if (isSubscribed) setPingedCount(pingedList.length);
          }
        }
      } catch (err) {
        console.error("Dispatch error:", err);
      }

      // 5. Schedule next round
      if (isSubscribed) {
        timerId = setTimeout(runDispatchRound, PING_INTERVAL_MS);
      }
    };

    // Start the loop
    timerId = setTimeout(runDispatchRound, 1000); // initial delay 1s

    return () => {
      isSubscribed = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [order?.id, order?.status, order?.driver_id, session?.access_token]);

  return { pingedCount, totalCandidates };
}
