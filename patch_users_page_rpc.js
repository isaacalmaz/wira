const fs = require('fs');

let code = fs.readFileSync('frontend-admin/src/pages/UsersPage.jsx', 'utf8');

code = code.replace(
  "const { error: creditErr } = await supabase.rpc('credit_wallet_balance_atomic', {",
  "const { error: creditErr } = await supabase.rpc('admin_correction_wallet_balance', {"
);

fs.writeFileSync('frontend-admin/src/pages/UsersPage.jsx', code);
