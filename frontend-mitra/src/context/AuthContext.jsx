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
    // 1. Cek local demo user
    try {
      const savedDemo = localStorage.getItem('wira_mitra_demo_user');
      if (savedDemo) {
        const parsed = JSON.parse(savedDemo);
        setUser(parsed);
        setMitraAccess(parsed.mitra_access || ['driver', 'merchant', 'technician']);
        setLoading(false);
        return;
      }
    } catch (e) {}

    if (session?.user) {
      try {
        const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).maybeSingle();
        if (profile) {
          setUser({ ...session.user, ...profile });
          setMitraAccess(profile.mitra_access || ['driver', 'merchant', 'technician']);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Supabase mitra profile check error:', err);
      }
    }

    // Default demo mitra user agar siap digunakan langsung
    const defaultMitra = {
      id: 'drv-made-01',
      name: 'Made Suardana (Mitra Lombok)',
      email: 'driver@wira.app',
      phone: '081987654321',
      mitra_access: ['driver', 'merchant', 'technician'],
      status: 'Aktif'
    };
    setUser(defaultMitra);
    setMitraAccess(['driver', 'merchant', 'technician']);
    setLoading(false);
  };

  const login = async (email, password) => {
    setLoading(true);
    if (email.includes('wira.app') || password === 'demo1234') {
      const demoRole = email.includes('merchant') ? 'merchant' : email.includes('tech') ? 'technician' : 'driver';
      const demoMitra = {
        id: `mitra-${demoRole}-01`,
        name: demoRole === 'merchant' ? 'Ayam Taliwang Bu Siti' : demoRole === 'technician' ? 'Agus Santoso' : 'Made Suardana',
        email,
        phone: '081987654321',
        mitra_access: ['driver', 'merchant', 'technician'],
        status: 'Aktif'
      };
      setUser(demoMitra);
      setMitraAccess(['driver', 'merchant', 'technician']);
      localStorage.setItem('wira_mitra_demo_user', JSON.stringify(demoMitra));
      setLoading(false);
      return { user: demoMitra };
    }

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
      localStorage.removeItem('wira_mitra_demo_user');
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
