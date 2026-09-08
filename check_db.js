import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yhxhcxgcjadchrjskozt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeGhjeGdjamFkY2hyanNrb3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MTUxMDIsImV4cCI6MjEwNDE5MTEwMn0.LzWaxGR79AmGzrRTOc4b64Wblu-klniFGxcXiuelmW8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const { data: users, error: uErr } = await supabase.from('users').select('*');
  console.log("Users:", users?.length);
  if (users) {
     users.forEach(u => console.log(`- ${u.id}: ${u.name}, access:`, u.mitra_access));
  }
  
  const { data: flags, error: fErr } = await supabase.from('feature_flags').select('*').eq('region', 'mitra_registrations');
  console.log("\nFlags:", flags);
  if (flags && flags.length > 0 && flags[0].features) {
     console.log("Features length:", flags[0].features.length);
     flags[0].features.forEach(f => console.log(`- ${f.role} (${f.status}): ${f.name} [auth: ${f.auth_id}]`));
  }
}
main();
