import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('frontend-user', '.env');
let envFile;
try {
  envFile = fs.readFileSync(envPath, 'utf8');
} catch (err) {
  console.error("Could not read .env file. Run this script from the 'wira' directory.");
  process.exit(1);
}

const supabaseUrl = envFile.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseKey = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error("Could not parse VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY from .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Deleting 'Selamat Datang!'...");
  const { error: err1 } = await supabase
    .from('notifications')
    .delete()
    .eq('title', 'Selamat Datang!');
  if (err1) console.error("Error:", err1);
  else console.log("Success.");

  console.log("Deleting 'Promo WiraRide'...");
  const { error: err2 } = await supabase
    .from('notifications')
    .delete()
    .eq('title', 'Promo WiraRide');
  if (err2) console.error("Error:", err2);
  else console.log("Success.");
}

run();
