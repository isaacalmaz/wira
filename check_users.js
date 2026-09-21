import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
async function run() {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, phone, wallet_balance')
    .ilike('name', '%Baiq%');
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}
run();
