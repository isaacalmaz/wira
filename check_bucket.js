const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'frontend-user/.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.storage.listBuckets();
  console.log("Buckets:", data, "Error:", error);
}
run();
