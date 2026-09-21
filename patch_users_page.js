const fs = require('fs');

let code = fs.readFileSync('frontend-admin/src/pages/UsersPage.jsx', 'utf8');

if (!code.includes('Wallet')) {
    code = code.replace(
      "import { Users, Search, Ban, CheckCircle, Car, Store, Wrench } from 'lucide-react';",
      "import { Users, Search, Ban, CheckCircle, Car, Store, Wrench, Wallet } from 'lucide-react';"
    );
}

// Add state for modal
code = code.replace(
  "const [search, setSearch] = useState('');",
  "const [search, setSearch] = useState('');\n  const [correctionModal, setCorrectionModal] = useState(null);\n  const [correctionAmount, setCorrectionAmount] = useState('');\n  const [correctionDesc, setCorrectionDesc] = useState('');\n  const [isSubmitting, setIsSubmitting] = useState(false);"
);

// Add fetchUsers dependency to correction function
const correctionFn = `
  const handleBalanceCorrection = async (e) => {
    e.preventDefault();
    if (!correctionModal) return;
    const amt = Number(correctionAmount);
    if (!amt || isNaN(amt)) {
      toast.error('Nominal tidak valid');
      return;
    }
    if (!correctionDesc.trim()) {
      toast.error('Catatan wajib diisi');
      return;
    }
    
    setIsSubmitting(true);
    try {
      // 1. Update wallet balance using atomic RPC
      const { error: creditErr } = await supabase.rpc('credit_wallet_balance_atomic', {
        p_user_id: correctionModal.id,
        p_amount: amt
      });
      if (creditErr) throw creditErr;

      // 2. Insert transaction log
      const { error: txErr } = await supabase.from('transactions').insert({
        user_id: correctionModal.id,
        type: amt > 0 ? 'topup' : 'payment', // using standard types so UI handles it gracefully
        amount: Math.abs(amt),
        description: 'KOREKSI ADMIN: ' + correctionDesc,
        reference_id: 'admin_correction_' + Date.now()
      });
      if (txErr) throw txErr;

      toast.success('Koreksi saldo berhasil diterapkan');
      setCorrectionModal(null);
      setCorrectionAmount('');
      setCorrectionDesc('');
      fetchUsers(); // refresh data to show new balance (if we displayed it)
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal melakukan koreksi saldo');
    } finally {
      setIsSubmitting(false);
    }
  };
`;

code = code.replace(
  "useEffect(() => { fetchUsers(); }, []);",
  "useEffect(() => { fetchUsers(); }, []);\n" + correctionFn
);

// Add button to table (but wait, we also need to SHOW the wallet balance in the table!)
code = code.replace(
  "<th className=\"px-6 py-4\">Telepon</th>",
  "<th className=\"px-6 py-4\">Telepon</th>\n                <th className=\"px-6 py-4\">Saldo</th>"
);

code = code.replace(
  "<td className=\"px-6 py-4\">{u.phone}</td>",
  "<td className=\"px-6 py-4\">{u.phone}</td>\n                  <td className=\"px-6 py-4 font-bold text-slate-700\">Rp {(u.wallet_balance || 0).toLocaleString('id-ID')}</td>"
);

code = code.replace(
  "{u.status === 'Aktif' ? <Ban size={18} /> : <CheckCircle size={18} />}",
  "{u.status === 'Aktif' ? <Ban size={18} /> : <CheckCircle size={18} />}"
);

// Actually add the wallet button next to Ban
code = code.replace(
  "<td className=\"px-6 py-4 text-right\">\n                    <button onClick={() => toggleStatus(u.id, u.status || 'Aktif')} className=\"text-slate-400 hover:text-primary\">\n                      {u.status === 'Aktif' ? <Ban size={18} /> : <CheckCircle size={18} />}\n                    </button>\n                  </td>",
  "<td className=\"px-6 py-4 text-right flex items-center justify-end gap-3\">\n                    <button \n                      onClick={() => setCorrectionModal(u)}\n                      className=\"text-slate-400 hover:text-green-600 transition\"\n                      title=\"Koreksi Saldo\"\n                    >\n                      <Wallet size={18} />\n                    </button>\n                    <button onClick={() => toggleStatus(u.id, u.status || 'Aktif')} className=\"text-slate-400 hover:text-red-500 transition\">\n                      {u.status === 'Aktif' ? <Ban size={18} /> : <CheckCircle size={18} />}\n                    </button>\n                  </td>"
);

const modalHTML = `
      {/* Modal Koreksi Saldo */}
      {correctionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b bg-slate-50">
              <h3 className="font-bold text-slate-800">Koreksi Saldo Manual</h3>
              <p className="text-xs text-slate-500 mt-1">
                Atas nama: <span className="font-bold text-slate-700">{correctionModal.name}</span>
              </p>
            </div>
            
            <form onSubmit={handleBalanceCorrection} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Nominal Koreksi (Rp)</label>
                <input 
                  type="number"
                  placeholder="Misal: 10584 (tambah) atau -10584 (kurangi)"
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none"
                  value={correctionAmount}
                  onChange={e => setCorrectionAmount(e.target.value)}
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">Gunakan tanda minus (-) untuk menarik saldo.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Catatan / Alasan</label>
                <input 
                  type="text"
                  placeholder="Misal: Salah transfer QRIS, Refund manual"
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none"
                  value={correctionDesc}
                  onChange={e => setCorrectionDesc(e.target.value)}
                  required
                />
              </div>
              
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCorrectionModal(null)}
                  className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-200 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Memproses...' : 'Terapkan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
`;

code = code.replace(
  "    </div>\n  );\n};",
  modalHTML + "    </div>\n  );\n};"
);

fs.writeFileSync('frontend-admin/src/pages/UsersPage.jsx', code);
