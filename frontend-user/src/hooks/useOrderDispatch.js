import { useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabase';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const PING_INTERVAL_MS = 15000; // 15 seconds

export function useOrderDispatch(order, session) {
  const [pingedList, setPingedList] = useState([]);
  const [candidates, setCandidates] = useState(null);
  const dispatchTimer = useRef(null);

  useEffect(() => {
    // Only dispatch if order is pending and has no driver
    if (!order || order.status !== 'pending' || order.driver_id || !session?.access_token) {
      if (dispatchTimer.current) clearTimeout(dispatchTimer.current);
      return;
    }

    const runDispatchRound = async () => {
      try {
        let currentCandidates = candidates;
        
        // 1. Fetch candidates if we don't have them yet
        if (!currentCandidates) {
          if (['ride', 'send'].includes(order.service_type)) {
             // Make sure to match the exact arguments used in get_nearest_drivers
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
             // For technicians, find nearby users with technician access
             const { data, error } = await supabase.rpc('list_technicians');
             if (error) throw error;
             currentCandidates = data || [];
          } else if (order.service_type === 'food') {
             // WiraFood doesn't use drivers yet in this stage (merchant accepts first)
             return; 
          } else {
             return;
          }
          setCandidates(currentCandidates);
        }

        if (!currentCandidates || currentCandidates.length === 0) {
          return; // No candidates available at all
        }

        // 2. Find the next candidate who hasn't been pinged
        const nextCandidate = currentCandidates.find(c => !pingedList.includes(c.id));
        
        if (!nextCandidate) {
          console.log("All candidates pinged. Waiting or could expand radius.");
          return; // Wait for one to accept or for user to cancel
        }

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
        setPingedList(prev => [...prev, nextCandidate.id]);

      } catch (err) {
        console.error("Dispatch error:", err);
      }

      // 5. Schedule next round
      dispatchTimer.current = setTimeout(runDispatchRound, PING_INTERVAL_MS);
    };

    // Start the loop
    const id = setTimeout(runDispatchRound, 1000); // initial delay 1s
    dispatchTimer.current = id;

    return () => {
      if (dispatchTimer.current) clearTimeout(dispatchTimer.current);
    };
  }, [order?.status, order?.driver_id, candidates, pingedList, session]);

  return { pingedCount: pingedList.length, totalCandidates: candidates?.length || 0 };
}
