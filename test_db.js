import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  const { data, error } = await supabaseAdmin.rpc('get_function_def', {
     func_name: 'approve_topup_request'
  }); // Note: this probably won't work, so let's just query pg_proc.
  
  const { data: dbData, error: dbErr } = await supabaseAdmin.rpc('run_sql', {
     sql: `SELECT prosrc FROM pg_proc WHERE proname = 'approve_topup_request'`
  });
  console.log("SQL:", dbData || dbErr);
}
run();
