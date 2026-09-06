const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/ishakalmaazi/.gemini/antigravity/scratch/wira/frontend-user/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('feature_flags').select('*');
  console.log('Error:', error);
  console.log('Data:', JSON.stringify(data, null, 2));
}
main();
