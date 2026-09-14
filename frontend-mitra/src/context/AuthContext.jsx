import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../config/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [mitraAccess, setMitraAccess] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await handleSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSession = async (session) => {
    if (!session?.user) {
      setUser(null);
      setMitraAccess([]);
      setLoading(false);
      return;
    }

    try {
      const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).maybeSingle();
      if (profile) {
        setUser({ ...session.user, ...profile });
        setMitraAccess(profile.mitra_access || []);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.warn('Supabase mitra profile check error:', err);
    }

    // Authenticated but no mitra profile row yet (e.g. mid-registration) -
    // treat as logged in with no role access, not as an error.
    setUser(session.user);
    setMitraAccess([]);
    setLoading(false);
  };

  const login = async (email, password) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      throw error;
    }
    await handleSession(data.session);
    return data;
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    setUser(null);
    setMitraAccess([]);
  };

  return (
    <AuthContext.Provider value={{ user, mitraAccess, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
