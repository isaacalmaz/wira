import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { DollarSign, TrendingUp } from 'lucide-react';

const FinancePage = () => {
  const [revenue, setRevenue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFinance = async () => {
      setLoading(true);
      const { data } = await supabase.from('orders').select('total_price').eq('status', 'completed');
      if (data) {
        setRevenue(data.reduce((sum, o) => sum + (o.total_price || 0), 0));
      }
      setLoading(false);
    };
    fetchFinance();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><DollarSign className="text-primary"/> Keuangan & Komisi</h1>
        <p className="text-sm text-slate-500">Laporan pendapatan asli</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card bg-gradient-to-br from-green-500 to-emerald-700 text-white border-none">
          <p className="text-green-100 font-semibold mb-2">Total Nilai Transaksi (GMV)</p>
          <h2 className="text-4xl font-black mb-4">Rp {revenue.toLocaleString('id-ID')}</h2>
          <p className="text-sm opacity-80 flex items-center gap-2"><TrendingUp size={16}/> Seluruh pesanan selesai</p>
        </div>
        <div className="card">
          <p className="text-slate-500 font-semibold mb-2">Estimasi Komisi Aplikasi (10%)</p>
          <h2 className="text-4xl font-black text-slate-800 mb-4">Rp {(revenue * 0.1).toLocaleString('id-ID')}</h2>
        </div>
      </div>
    </div>
  );
};
export default FinancePage;
