import { createContext, useState, useContext, useEffect } from 'react';
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

  // Returns the resolved profile (or null) so callers like login() can act
  // on it immediately - React state (user/mitraAccess) updates are async
  // and reading them right after calling handleSession can still see the
  // pre-login value in the same tick (the exact stale-data class of bug
  // that caused the false "Berhasil masuk!" toast - see login() below).
  const handleSession = async (session) => {
    if (!session?.user) {
      setUser(null);
      setMitraAccess([]);
      setLoading(false);
      return null;
    }

    try {
      const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).maybeSingle();
      if (profile) {
        setUser({ ...session.user, ...profile });
        setMitraAccess(profile.mitra_access || []);
        setLoading(false);
        return profile;
      }
    } catch (err) {
      console.warn('Supabase mitra profile check error:', err);
    }

    // Authenticated but no mitra profile row yet (e.g. mid-registration) -
    // treat as logged in with no role access, not as an error.
    setUser(session.user);
    setMitraAccess([]);
    setLoading(false);
    return null;
  };

  const login = async (email, password) => {
    // Deliberately does NOT touch the `loading` state here. `loading` gates
    // whether AuthProvider renders its children at all ({!loading &&
    // children} below, and App.jsx's own `if (loading) return null`) - it
    // exists to avoid flashing a logged-out UI before the initial session
    // check resolves. Toggling it again on every login call used to unmount
    // the entire app (including the <BrowserRouter>) mid-submit, destroying
    // the LoginPage instance and its `navigate()` call before it could ever
    // fire - the user would land back on a blank login form despite having
    // actually signed in, and had to submit a second time for it to "stick".
    // LoginPage already has its own local loading state for the button spinner.
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
    const profile = await handleSession(data.session);
    return { ...data, profile };
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch { /* sign-out failure is ignored; local state is cleared below */ }
    setUser(null);
    setMitraAccess([]);
  };

  // Re-fetches the current session's profile and updates `user`/`mitraAccess`
  // in place, without the full `window.location.reload()` several screens
  // use today after writing something that affects the profile (e.g. a
  // preference toggle) - useful on pages like DriverHomePage.jsx where a
  // full reload would be disruptive (drops GPS watch/map state) for what's
  // meant to be a quick, frequent action.
  const refreshProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return handleSession(session);
  };


  useEffect(() => {
    const updateFCM = async () => {
      if (user) {
        try {
          // Loaded on demand: firebase/messaging is ~150 kB+ and only needed
          // once someone is signed in, so the login screen doesn't pay for it.
          const { requestForToken } = await import('../config/firebase');
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
    <AuthContext.Provider value={{ user, mitraAccess, login, logout, loading, refreshProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
