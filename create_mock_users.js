const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/ishakalmaazi/.gemini/antigravity/scratch/wira/frontend-mitra/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const users = [
    { email: 'driver@wira.com', password: 'password123', name: 'Ahmad Supardi', role: 'driver', phone: '081234567890' },
    { email: 'merchant@wira.com', password: 'password123', name: 'Warung Taliwang', role: 'merchant', phone: '081234567891' }
  ];

  for (const u of users) {
    const { data, error } = await supabase.auth.signUp({
      email: u.email,
      password: u.password,
      options: { data: { name: u.name, phone: u.phone, role: u.role } }
    });
    if (error) console.log(error.message);
    else console.log(`Created ${u.email} with ID ${data.user.id}`);
  }
}
main();
