import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../config/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'driver', 'merchant', 'technician'
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // 1. Cek sesi aktif saat aplikasi pertama kali dimuat
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await handleSession(session);
    });

    // 2. Dengarkan perubahan sesi (misal: user login atau logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSession = async (session) => {
    if (session?.user) {
      setUser(session.user);
      // Ambil detail profil dan role dari tabel public.users
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      if (profile) {
        setUser({ ...session.user, ...profile });
        setRole(profile.role);
      } else {
        // Otomatis masukkan ke public.users jika belum ada
        const { data: newProfile } = await supabase.from('users').insert([{
          id: session.user.id,
          name: session.user.user_metadata?.name || 'Mitra Baru',
          email: session.user.email,
          phone: session.user.user_metadata?.phone || '',
          role: session.user.user_metadata?.role || 'driver',
          status: 'Aktif'
        }]).select().single();
        
        setUser({ ...session.user, ...newProfile });
        setRole(newProfile?.role || 'driver');
      }
    } else {
      setUser(null);
      setRole(null);
    }
    setLoading(false);
  };

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };
  
  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, role, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
