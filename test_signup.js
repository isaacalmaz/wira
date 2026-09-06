const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/ishakalmaazi/.gemini/antigravity/scratch/wira/frontend-user/.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.auth.signUp({
    email: 'test_auth_id@wira.com',
    password: 'password123'
  });
  console.log(JSON.stringify(data, null, 2));
}
test();
