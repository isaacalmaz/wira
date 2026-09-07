import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Cek session saat ini saat memuat aplikasi
    const checkSession = async () => {
      // 1. Cek local demo user terlebih dahulu
      try {
        const savedDemo = localStorage.getItem('wira_admin_demo_user');
        if (savedDemo) {
          setUser(JSON.parse(savedDemo));
          setLoading(false);
          return;
        }
      } catch (e) {}

      // 2. Cek sesi Supabase
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser({
            id: session.user.id,
            name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
            email: session.user.email,
            role: session.user.user_metadata?.role || 'Superadmin'
          });
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Supabase auth session check fallback:', err);
      }

      // 3. Default demo admin agar siap digunakan
      const defaultAdmin = {
        id: 'adm-budi-01',
        name: 'Budi Wira (Superadmin)',
        email: 'admin@wira.app',
        role: 'Superadmin'
      };
      setUser(defaultAdmin);
      localStorage.setItem('wira_admin_demo_user', JSON.stringify(defaultAdmin));
      setLoading(false);
    };

    checkSession();

    // Dengarkan perubahan status auth (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
          email: session.user.email,
          role: session.user.user_metadata?.role || 'Superadmin'
        });
      } else {
        setUser(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    // Demo quick login bypass
    if (email === 'admin@wira.app' || email === 'ops@wira.app' || password === 'demo1234') {
      const demoUser = {
        id: 'adm-budi-01',
        name: email === 'ops@wira.app' ? 'Admin Ops Wira' : 'Budi Wira (Superadmin)',
        email: email || 'admin@wira.app',
        role: email === 'ops@wira.app' ? 'Admin Ops' : 'Superadmin'
      };
      setUser(demoUser);
      localStorage.setItem('wira_admin_demo_user', JSON.stringify(demoUser));
      return { success: true };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('Unexpected login error:', err);
      return { success: false, error: 'Terjadi kesalahan sistem' };
    }
  };

  const logout = async () => {
    try {
      localStorage.removeItem('wira_admin_demo_user');
      await supabase.auth.signOut();
    } catch (e) {}
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout,
      isAuthenticated: !!user,
      loading
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
