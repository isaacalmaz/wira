import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  const { data, error } = await supabaseAdmin.rpc('approve_topup_request', {
    request_id: 'aae77731-79d5-4c90-a95b-1139234be801'
  });
  console.log("Approve RPC:", data, error);
}
run();
