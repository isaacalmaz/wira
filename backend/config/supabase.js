require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Inisialisasi Supabase Client
// Menggunakan SERVICE_KEY agar backend memiliki akses admin ke database
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'placeholder_key'
);

module.exports = supabase;
