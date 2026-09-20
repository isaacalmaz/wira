import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'frontend-user/.env' });
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://yhxhcxgcjadchrjskozt.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeGhjeGdjamFkY2hyanNrb3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MTUxMDIsImV4cCI6MjEwNDE5MTEwMn0.LzWaxGR79AmGzrRTOc4b64Wblu-klniFGxcXiuelmW8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, driver:driver_id(name, phone, vehicle_type, plate_number), merchant:merchant_id(name, address)')
    .eq('id', 'b9769dde-fe79-4f0b-941c-716c119555e4')
    .single();
  console.log("Error:", error);
}
run();
