import os

def patch_auth_context(filepath):
    if not os.path.exists(filepath):
        return
    with open(filepath, 'r') as f:
        content = f.read()

    if "requestForToken" not in content:
        content = content.replace(
            "import { supabase } from '../config/supabase';",
            "import { supabase } from '../config/supabase';\nimport { requestForToken } from '../config/firebase';"
        )
        
        # Inject the token update logic inside the useEffect where user is set
        injection = """
        if (session?.user) {
          try {
            const token = await requestForToken();
            if (token) {
              await supabase.from('users').update({ fcm_token: token }).eq('id', session.user.id);
            }
          } catch (e) {
            console.error('Failed to update FCM token', e);
          }
        }
        """
        
        # This is a bit tricky, let's just create a new useEffect for FCM
        use_effect_fcm = """
  useEffect(() => {
    const updateFCM = async () => {
      if (user) {
        try {
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
"""
        content = content.replace("  return (", use_effect_fcm + "\n  return (")
        
        with open(filepath, 'w') as f:
            f.write(content)

patch_auth_context('frontend-user/src/context/AuthContext.jsx')
patch_auth_context('frontend-mitra/src/context/AuthContext.jsx')
