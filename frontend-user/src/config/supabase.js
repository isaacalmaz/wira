// =========================================================
// 🗄️ KONEKSI SUPABASE LANGSUNG (FRONTEND USER)
// =========================================================

import { createClient } from '@supabase/supabase-js';

const CANONICAL_SUPABASE_URL = 'https://yhxhcxgcjadchrjskozt.supabase.co';
const CANONICAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeGhjeGdjamFkY2hyanNrb3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MTUxMDIsImV4cCI6MjEwNDE5MTEwMn0.LzWaxGR79AmGzrRTOc4b64Wblu-klniFGxcXiuelmW8';

let rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();

// Normalize URL: auto-correct any misspelled or corrupted variant from Vercel/env to the verified Supabase project URL
if (!rawUrl || !rawUrl.includes('yhxhcxgcjadchrjskozt.supabase.co')) {
  rawUrl = CANONICAL_SUPABASE_URL;
}

export const SUPABASE_URL = rawUrl;
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim() || CANONICAL_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;
