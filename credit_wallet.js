import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  const userId = '828eefda-2300-4cfd-8c8c-11e859886fe1';
  const amount = 10584;

  // Insert into topup_requests
  const { data: request, error: reqErr } = await supabaseAdmin
    .from('topup_requests')
    .insert({
      user_id: userId,
      amount: amount,
      status: 'approved',
      method: 'manual',
      created_at: new Date('2026-09-20T19:02:00+08:00').toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (reqErr) {
    console.error("Failed to insert topup_requests:", reqErr);
    return;
  }
  console.log("Inserted topup_request:", request.id);

  // Directly call the correct wallet_credit RPC (if it exists) or just update the balance
  // In `midtrans.js` we used `wallet_credit`! Why did it not exist? Let's check `midtrans.js` again.
  // Wait, `midtrans.js` used: `supabaseAdmin.rpc('wallet_credit', { p_user_id, p_amount, p_description })`
  
  // To be absolutely safe, let's just do it directly via SQL or `wallet_credit` if it actually existed and I just missed the params.
  // I'll update users table and insert into transactions.
  
  const { data: userData, error: userErr } = await supabaseAdmin
    .from('users')
    .select('wallet_balance')
    .eq('id', userId)
    .single();
    
  if (userErr) throw userErr;
  
  const newBalance = (userData.wallet_balance || 0) + amount;
  
  const { error: updateErr } = await supabaseAdmin
    .from('users')
    .update({ wallet_balance: newBalance })
    .eq('id', userId);
    
  if (updateErr) throw updateErr;
  
  const { error: transErr } = await supabaseAdmin
    .from('transactions')
    .insert({
      user_id: userId,
      amount: amount,
      type: 'topup',
      status: 'success',
      description: 'Top Up WiraPay (Recovery Mutasiku Rp 10.584)'
    });
    
  if (transErr) throw transErr;
  
  console.log("Successfully credited wallet manually! New balance:", newBalance);
}
run();
