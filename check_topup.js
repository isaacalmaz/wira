import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: 'backend/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
supabase.from('topup_requests').select('*').then(({ data, error }) => {
  if (error) console.error(error);
  fs.writeFileSync('topups.json', JSON.stringify(data, null, 2));
});
