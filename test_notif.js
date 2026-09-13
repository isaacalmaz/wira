import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Extract keys from .env
const envPath = path.resolve('frontend-user', '.env');
const envFile = fs.readFileSync(envPath, 'utf8');
const supabaseUrl = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('notifications').select('*').limit(1);
  if (error) console.error("Error:", error);
  else console.log("Data:", data);
  
  // Wipe dummy data
  const { error: delError } = await supabase.from('notifications').delete().ilike('title', '%Selamat Datang%');
  if (delError) console.error("Del Error:", delError);
  else console.log("Deleted dummy Selamat Datang");
  
  const { error: delError2 } = await supabase.from('notifications').delete().ilike('title', '%Promo%');
  if (delError2) console.error("Del Error:", delError2);
  else console.log("Deleted dummy Promo");
}
check();
