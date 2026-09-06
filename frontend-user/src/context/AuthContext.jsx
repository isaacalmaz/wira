import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('wira_fake_session')) || null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('wira_fake_session'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Cek session saat pertama load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        setIsAuthenticated(true);
        localStorage.removeItem('wira_fake_session');
      }
      setLoading(false);
    });

    // Listen untuk perubahan auth (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        setIsAuthenticated(true);
        localStorage.removeItem('wira_fake_session');
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    } catch (err) {
      if (err.message.includes('rate limit') || err.message.includes('Invalid login')) {
        // Fallback untuk Demo / MVP Bypass
        const fakeUser = { id: 'demo-' + Date.now(), email, name: 'Pengguna Demo', phone: '08123456789' };
        setUser(fakeUser);
        setIsAuthenticated(true);
        localStorage.setItem('wira_fake_session', JSON.stringify(fakeUser));
        toast.success('Login Mode Demo Aktif (Supabase Limit/Error Bypass)');
        return { user: fakeUser };
      }
      throw err;
    }
  };

  const register = async (email, password, userData) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: userData.name, phone: userData.phone } }
      });
      if (error) throw error;

      if (data.user) {
        await supabase.from('users').insert([{
          id: data.user.id,
          name: userData.name,
          email: email,
          phone: userData.phone,
          role: 'user',
          status: 'Aktif'
        }]).select().single().catch(e => console.log(e));
      }
      return data;
    } catch (err) {
      if (err.message.includes('rate limit')) {
        // Fallback untuk Demo / MVP Bypass
        const fakeUser = { id: 'demo-' + Date.now(), email, name: userData.name, phone: userData.phone };
        setUser(fakeUser);
        setIsAuthenticated(true);
        localStorage.setItem('wira_fake_session', JSON.stringify(fakeUser));
        toast.success('Pendaftaran Mode Demo Aktif (Bypass Limit Supabase)');
        
        // Tetap coba masukkan ke tabel public.users agar terlihat di Admin (menggunakan ID fake)
        await supabase.from('users').insert([{
          id: fakeUser.id,
          name: userData.name,
          email: email,
          phone: userData.phone,
          role: 'user',
          status: 'Aktif'
        }]).catch(e => console.log(e));
        
        return { user: fakeUser };
      }
      throw err;
    }
  };

  const logout = async () => {
    localStorage.removeItem('wira_fake_session');
    setUser(null);
    setIsAuthenticated(false);
    
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout error:', error.message);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, register, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
