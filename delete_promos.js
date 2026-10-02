const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  const { error } = await supabase.from('promos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('Error deleting promos:', error);
}
run();
