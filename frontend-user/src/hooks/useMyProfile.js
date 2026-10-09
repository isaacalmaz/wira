import { useEffect, useState } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';

// Name and phone from the customer's profile row (public.users). The sign-up
// metadata on the auth user keeps whatever name was typed at registration,
// so screens must not show that as the current name.
export default function useMyProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!user?.id) { setProfile(null); return undefined; }
    let cancelled = false;
    supabase.from('users').select('name, phone, avatar_url').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setProfile(data || null); });
    return () => { cancelled = true; };
  }, [user?.id]);

  return profile;
}
