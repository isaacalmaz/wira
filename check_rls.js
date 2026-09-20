import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
async function run() {
  const { data, error } = await supabase.rpc('list_policies');
  if (error) {
     console.log('Cant list policies. Let us select from pg_policies via pg');
  }
}
run();
