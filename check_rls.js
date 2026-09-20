import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_policies'); // if we don't have this, we can query pg_policies
  if (error) {
     const { data: polData, error: polErr } = await supabase.rpc('execute_sql', { sql: 'SELECT * FROM pg_policies WHERE tablename = \'orders\'' });
     console.log(polErr || polData);
  } else {
     console.log(data);
  }
}
run();
