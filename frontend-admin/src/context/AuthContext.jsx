import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabase';

const AuthContext = createContext();

// Fallback role whenever we can't positively confirm a real role from the
// database (query failed, row missing, role column empty). This matches
// public.users.role's own schema default ('user' - migrations/0001) and is
// NOT included in any admin allowedRoles set in App.jsx, so it always
// resolves to "not an admin" rather than granting access. Never default to
// an elevated role here.
const FALLBACK_ROLE = 'user';

// Builds the app's user object for a Supabase session. `role` is sourced
// from public.users (a plain `SELECT role FROM users WHERE id = auth.uid()`,
// protected by RLS - see migrations/0025_users_rls_reenable.sql) rather
// than session.user.user_metadata.role. user_metadata is set by whoever
// calls supabase.auth.signUp(..., { options: { data: { role } } }) at
// signup time - the CLIENT controls it, so it is not a real authorization
// signal (confirmed: frontend-mitra/src/pages/RegisterPage.jsx sends
// `role` verbatim into options.data at signup). Since registration is
// public, trusting it (or worse, defaulting to 'Superadmin' when absent)
// would let anyone self-grant admin access.
const buildUserFromSession = async (session) => {
  let role = FALLBACK_ROLE;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) {
      console.warn('Failed to load user role from database:', error.message);
    } else if (data?.role) {
      role = data.role;
    }
  } catch (err) {
    console.warn('Failed to load user role from database:', err);
  }

  return {
    id: session.user.id,
    name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
    email: session.user.email,
    role,
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Cek session saat ini saat memuat aplikasi
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const nextUser = await buildUserFromSession(session);
          if (isMounted) setUser(nextUser);
        } else if (isMounted) {
          setUser(null);
        }
      } catch (err) {
        console.warn('Supabase auth session check failed:', err);
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkSession();

    // Dengarkan perubahan status auth (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        buildUserFromSession(session).then((nextUser) => {
          if (isMounted) setUser(nextUser);
        });
      } else {
        setUser(null);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
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
    } catch { /* sign-out failure is ignored; local state is cleared below */ }
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
