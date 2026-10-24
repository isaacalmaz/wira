import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { requestForToken } from '../config/firebase';
import { confirmRedirect } from '../utils/emailConfirm';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Cek session saat pertama load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setSession(session ?? null);
      setIsAuthenticated(!!session);
      setLoading(false);
    });

    // Listen untuk perubahan auth (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // A password-reset link that landed anywhere but the reset form (e.g.
      // an old link sent to the Site URL) still opens the form.
      if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/reset-password') {
        window.location.replace('/reset-password');
        return;
      }
      setUser(session?.user ?? null);
      setSession(session ?? null);
      setIsAuthenticated(!!session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const register = async (email, password, userData) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: userData.name, phone: userData.phone }, emailRedirectTo: confirmRedirect() }
    });
    if (error) throw error;

    if (data.user) {
      // migrations/0111 also creates this row in the database; this just
      // fills in the details when the session allows it.
      const { error: insertError } = await supabase.from('users').upsert([{
        id: data.user.id,
        name: userData.name,
        email: email,
        phone: userData.phone,
        role: 'user',
        status: 'Aktif'
      }], { onConflict: 'id', ignoreDuplicates: true });
      if (insertError) console.error('Insert user error:', insertError);
    }
    return data;
  };

  const logout = async () => {
    if (user?.id) {
      try {
        await supabase.from('users').update({ fcm_token: null }).eq('id', user.id);
      } catch (err) {
        console.error('Failed to clear FCM token on logout:', err);
      }
    }
    setUser(null);
    setSession(null);
    setIsAuthenticated(false);

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout error:', error.message);
    }
  };

  useEffect(() => {
    const updateFCM = async () => {
      if (user) {
        try {
          // Android app: native push token (web push does not work in the WebView).
          const { isNative, registerNativePush } = await import('../native/nativeShell');
          if (isNative()) {
            await registerNativePush((t) => supabase.from('users').update({ fcm_token: t }).eq('id', user.id));
            return;
          }
          const token = await requestForToken();
          if (token) {
            await supabase.from('users').update({ fcm_token: token }).eq('id', user.id);
          }
        } catch (err) {
          console.error("FCM update error:", err);
        }
      }
    };
    updateFCM();
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, session, isAuthenticated, loading, login, register, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
