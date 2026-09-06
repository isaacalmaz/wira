const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/ishakalmaazi/.gemini/antigravity/scratch/wira/frontend-user/.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data: d1 } = await supabase.from('users').select('*').contains('mitra_access', '["driver"]');
  const { data: d2 } = await supabase.from('users').select('*').contains('mitra_access', ['driver']);
  console.log("String array:", d1?.length);
  console.log("JS array:", d2?.length);
}
test();
