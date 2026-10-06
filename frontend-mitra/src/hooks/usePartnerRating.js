import { useEffect, useState } from 'react';
import { supabase } from '../config/supabase';

/** Visible-review rating of a driver/technician (partner_rating, migrations/0091). */
export default function usePartnerRating(userId) {
  const [rating, setRating] = useState({ avg: null, count: 0 });
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.rpc('partner_rating', { p_user_id: userId }).then(({ data }) => {
      if (cancelled) return;
      const row = data?.[0];
      setRating({ avg: row?.rating_avg != null ? Number(row.rating_avg) : null, count: row?.rating_count || 0 });
    });
    return () => { cancelled = true; };
  }, [userId]);
  return rating;
}
