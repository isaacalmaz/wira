import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';

const VILLA_TYPES = ['villa', 'WiraVilla'];
export const isVillaMerchant = (m) => !!m && VILLA_TYPES.includes(m.service_type);

/**
 * Every `merchants` row the signed-in partner owns for the portal they are
 * on: the villa portal (/villa/*) gets their villas, the restaurant portal
 * gets everything else. One account can own several villas (migration
 * 0097) and a restaurant besides, so pages work on the list (orders,
 * earnings, incoming bookings across all properties) instead of assuming
 * a single row.
 */
export default function useMyMerchants() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const kind = pathname.startsWith('/villa') ? 'villa' : 'food';
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true });
    if (!error) {
      setMerchants((data || []).filter((m) => (kind === 'villa' ? isVillaMerchant(m) : !isVillaMerchant(m))));
    }
    setLoading(false);
  }, [user, kind]);

  useEffect(() => { reload(); }, [reload]);

  return { merchants, ids: merchants.map((m) => m.id), kind, loading, reload };
}
