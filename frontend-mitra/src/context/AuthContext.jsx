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
    if (session?.user) {
      const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).single();
      
      if (profile) {
        setUser({ ...session.user, ...profile });
        setMitraAccess(profile.mitra_access || []);
      } else {
        const roleFromMeta = session.user.user_metadata?.role || 'driver';
        const { data: newProfile } = await supabase.from('users').insert([{
          id: session.user.id,
          name: session.user.user_metadata?.name || 'Mitra Baru',
          email: session.user.email,
          phone: session.user.user_metadata?.phone || '',
          role: 'user', 
          mitra_access: [], // Jangan beri akses sampai Admin menyetujui
          status: 'Pending'
        }]).select().single();
        
        setUser({ ...session.user, ...newProfile });
        setMitraAccess([]);
      }
    } else {
      setUser(null);
      setMitraAccess([]);
    }
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
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, mitraAccess, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
