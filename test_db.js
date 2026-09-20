import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'frontend-user/.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL || 'https://yhxhcxgcjadchrjskozt.supabase.co', process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeGhjeGdjamFkY2hyanNrb3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MTUxMDIsImV4cCI6MjEwNDE5MTEwMn0.LzWaxGR79AmGzrRTOc4b64Wblu-klniFGxcXiuelmW8');

async function run() {
  const { data, error } = await supabase.from('feature_flags').select('*').eq('region', 'features_config').maybeSingle();
  console.log('Result:', data?.features);
  console.log('Type:', Array.isArray(data?.features) ? 'Array' : typeof data?.features);
}
run();
