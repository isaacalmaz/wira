// =========================================================
// 🗄️ KONEKSI SUPABASE LANGSUNG (FRONTEND USER)
// =========================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://yhxhcxgcjadchrjskozt.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeGhjeGdjamFkY2hyanNrb3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MTUxMDIsImV4cCI6MjEwNDE5MTEwMn0.LzWaxGR79AmGzrRTOc4b64Wblu-klniFGxcXiuelmW8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;
