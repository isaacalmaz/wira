import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
async function run() {
  const { data, error } = await supabase
    .from('topup_requests')
    .select('user_id, users(name, phone)');
  if (error) console.error(error);
  
  const uniqueUsers = {};
  data.forEach(t => {
    uniqueUsers[t.user_id] = t.users?.name;
  });
  console.log("Users who have made topups:", uniqueUsers);
}
run();
