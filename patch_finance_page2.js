const fs = require('fs');

let code = fs.readFileSync('frontend-admin/src/pages/FinancePage.jsx', 'utf8');

if (!code.includes('List,')) {
    code = code.replace(
      "import { DollarSign, Clock, CheckCircle, XCircle, TrendingUp, Landmark } from 'lucide-react';",
      "import { DollarSign, Clock, CheckCircle, XCircle, TrendingUp, Landmark, List, ArrowDownLeft, ArrowUpRight } from 'lucide-react';"
    );
}

code = code.replace(
  "const [actionLoading, setActionLoading] = useState(false);",
  "const [actionLoading, setActionLoading] = useState(false);\n  const [activeTab, setActiveTab] = useState('requests');\n  const [transactions, setTransactions] = useState([]);"
);

const fetchTxHTML = `
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('*, users(name, phone)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (txError) throw txError;
      if (txData) setTransactions(txData);
`;
code = code.replace(
  "if (pData) setPayouts(pData);",
  "if (pData) setPayouts(pData);\n" + fetchTxHTML
);

const tabsHTML = `
      <div className="flex gap-2 mt-6 mb-4">
        <button
          onClick={() => setActiveTab('requests')}
          className={\`px-4 py-2 rounded-lg font-semibold transition \${
            activeTab === 'requests' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }\`}
        >
          Permintaan (Top-Up & Pencairan)
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={\`px-4 py-2 rounded-lg font-semibold transition \${
            activeTab === 'transactions' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }\`}
        >
          Semua Transaksi (Buku Besar)
        </button>
      </div>

      {activeTab === 'requests' && (
        <div className="space-y-6">
`;

code = code.replace(
  "      <div className=\"card shadow-md\">\n        <h3 className=\"font-bold text-lg mb-4 text-slate-800 flex items-center gap-2\">\n          <Clock size={20} className=\"text-slate-500\"/> Permintaan Top-Up WiraPay",
  tabsHTML + "      <div className=\"card shadow-md\">\n        <h3 className=\"font-bold text-lg mb-4 text-slate-800 flex items-center gap-2\">\n          <Clock size={20} className=\"text-slate-500\"/> Permintaan Top-Up WiraPay"
);

const txTabHTML = `
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="card shadow-md">
          <h3 className="font-bold text-lg mb-4 text-slate-800 flex items-center gap-2">
            <List size={20} className="text-slate-500"/> Semua Transaksi (Buku Besar)
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Menampilkan riwayat transaksi uang terakhir (Top-Up, Pembayaran Pesanan, Pencairan, Koreksi).
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold">Waktu</th>
                  <th className="px-4 py-3 font-semibold">Pengguna</th>
                  <th className="px-4 py-3 font-semibold">Tipe</th>
                  <th className="px-4 py-3 font-semibold text-right">Nominal</th>
                  <th className="px-4 py-3 font-semibold">Deskripsi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map(tx => {
                  const isIncoming = tx.type === 'topup' || tx.type === 'correction_in' || tx.type === 'refund' || tx.amount > 0;
                  
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {new Date(tx.created_at).toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{tx.users?.name || 'Unknown'}</div>
                        <div className="text-[10px] text-slate-500">{tx.users?.phone || '-'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase">
                          {tx.type}
                        </span>
                      </td>
                      <td className={\`px-4 py-3 font-bold text-right \${isIncoming ? 'text-green-600' : 'text-slate-800'}\`}>
                        <div className="flex items-center justify-end gap-1">
                          {isIncoming ? <ArrowDownLeft size={14}/> : <ArrowUpRight size={14} className="text-red-500" />}
                          Rp {Number(tx.amount).toLocaleString('id-ID')}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {tx.description || '-'}
                        {tx.reference_id && <div className="text-[9px] text-slate-400 mt-0.5 break-all font-mono">{tx.reference_id}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
`;

code = code.replace(
  "      </div>\n    </div>\n  );\n};\n\nexport default FinancePage;",
  "      </div>\n" + txTabHTML + "\n    </div>\n  );\n};\n\nexport default FinancePage;"
);

fs.writeFileSync('frontend-admin/src/pages/FinancePage.jsx', code);
