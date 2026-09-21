import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
async function run() {
  const { data, error } = await supabase
    .from('topup_requests')
    .select('id, amount, status, created_at, user_id, users(name, phone)')
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}
run();
