const fs = require('fs');
const file = 'frontend-user/src/pages/WalletPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// Add imports
if (!content.includes("import { supabase }")) {
  content = content.replace("import { useWallet }", "import { supabase } from '../config/supabase';\nimport { useAuth } from '../context/AuthContext';\nimport { useWallet }");
}

// Modify handleTopUpConfirm
const oldFunc = `  const handleTopUpConfirm = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    await topUp(topUpAmount, topUpMethod);
    setLoading(false);
    toast.success(\`Top Up \${formatRupiah(topUpAmount)} Berhasil!\`);
    setModalType(null);
    setTopUpStep(1);
  };`;

const newFunc = `  const { user } = useAuth();
  
  const handleTopUpConfirm = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from('topup_requests').insert([{
        user_id: user.id,
        amount: topUpAmount,
        method: topUpMethod,
        status: 'pending'
      }]);
      if (error) throw error;
      toast.success(\`Permintaan Top Up \${formatRupiah(topUpAmount)} berhasil. Menunggu admin.\`);
      setModalType(null);
      setTopUpStep(1);
    } catch (err) {
      toast.error(err.message || 'Gagal membuat permintaan top up');
    } finally {
      setLoading(false);
    }
  };`;

if (content.includes(oldFunc)) {
  content = content.replace(oldFunc, newFunc);
  fs.writeFileSync(file, content);
  console.log("Patched WalletPage.jsx");
} else {
  console.log("Could not find handleTopUpConfirm");
}
