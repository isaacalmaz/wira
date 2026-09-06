import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../config/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [mitraAccess, setMitraAccess] = useState([]); // ex: ['driver', 'merchant']
  const [activeRole, setActiveRole] = useState(null); // The role they selected for this session
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
        const access = profile.mitra_access || [];
        setMitraAccess(access);
        
        // Auto-select if they only have 1 access
        if (access.length === 1 && !activeRole) {
          setActiveRole(access[0]);
        }
      } else {
        // Fallback for new users
        const roleFromMeta = session.user.user_metadata?.role || 'driver';
        const { data: newProfile } = await supabase.from('users').insert([{
          id: session.user.id,
          name: session.user.user_metadata?.name || 'Mitra Baru',
          email: session.user.email,
          phone: session.user.user_metadata?.phone || '',
          role: 'user', // Default to user
          mitra_access: [roleFromMeta],
          status: 'Aktif'
        }]).select().single();
        
        setUser({ ...session.user, ...newProfile });
        setMitraAccess([roleFromMeta]);
        if (!activeRole) setActiveRole(roleFromMeta);
      }
    } else {
      setUser(null);
      setMitraAccess([]);
      setActiveRole(null);
    }
    setLoading(false);
  };

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };
  
  const logout = async () => {
    setActiveRole(null);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, mitraAccess, activeRole, setActiveRole, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
