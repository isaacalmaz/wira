import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yhxhcxgcjadchrjskozt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeGhjeGdjamFkY2hyanNrb3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MTUxMDIsImV4cCI6MjEwNDE5MTEwMn0.LzWaxGR79AmGzrRTOc4b64Wblu-klniFGxcXiuelmW8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('Fixing active drivers...');
  
  // 1. Get feature flags
  const { data: flags, error: fErr } = await supabase.from('feature_flags').select('*').eq('region', 'mitra_registrations').single();
  if (fErr) return console.error('Error fetching flags:', fErr);
  
  if (!flags || !flags.features) return console.log('No features found');
  
  const activeMitras = flags.features.filter(f => f.status === 'Active');
  console.log(`Found ${activeMitras.length} active mitras in queue.`);
  
  for (const mitra of activeMitras) {
    if (!mitra.auth_id) continue;
    
    // 2. Get user
    const { data: user, error: uErr } = await supabase.from('users').select('*').eq('id', mitra.auth_id).single();
    if (uErr) {
      console.error('Error fetching user', mitra.auth_id, uErr);
      continue;
    }
    
    let currentAccess = user.mitra_access || [];
    if (typeof currentAccess === 'string') {
      try { currentAccess = JSON.parse(currentAccess); } catch(e) { currentAccess = []; }
    }
    
    if (!Array.isArray(currentAccess)) currentAccess = [];
    
    if (!currentAccess.includes(mitra.role)) {
      currentAccess.push(mitra.role);
      console.log(`Updating user ${user.name} (${mitra.auth_id}) with access:`, currentAccess);
      
      const { error: updErr, data } = await supabase.from('users').update({
        mitra_access: currentAccess,
        status: 'Aktif'
      }).eq('id', mitra.auth_id).select();
      
      if (updErr) console.error('Error updating:', updErr);
      else console.log('Update success:', data);
    }
  }
  
  console.log('Done!');
}
main();
