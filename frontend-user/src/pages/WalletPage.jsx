import { Wallet, ArrowUpRight, ArrowDownLeft, QrCode } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { formatRupiah } from '../utils/formatRupiah';

export default function WalletPage() {
  const transactions = [
    { id: 1, type: 'expense', desc: 'WiraRide - Perjalanan', date: 'Hari ini, 14:30', amount: 25000 },
    { id: 2, type: 'income', desc: 'Top Up BCA', date: 'Kemarin, 09:00', amount: 100000 },
    { id: 3, type: 'expense', desc: 'WiraFood - Ayam Taliwang', date: '2 hari lalu', amount: 65000 },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-green-500 to-green-700 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-20"><Wallet size={100} /></div>
        <p className="text-sm opacity-90 mb-1">Saldo WiraPay</p>
        <p className="text-4xl font-bold mb-6">{formatRupiah(150000)}</p>
        
        <div className="flex justify-between gap-4">
          <Button variant="ghost" className="flex-1 bg-white/20 hover:bg-white/30 text-white">
            <ArrowUpRight size={18} className="mr-2" /> Top Up
          </Button>
          <Button variant="ghost" className="flex-1 bg-white/20 hover:bg-white/30 text-white">
            <ArrowDownLeft size={18} className="mr-2" /> Transfer
          </Button>
          <Button variant="ghost" className="flex-1 bg-white/20 hover:bg-white/30 text-white">
            <QrCode size={18} className="mr-2" /> Bayar
          </Button>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-lg mb-4 dark:text-white">Riwayat Transaksi</h3>
        <Card className="divide-y divide-slate-100 dark:divide-slate-700">
          {transactions.map(trx => (
            <div key={trx.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${trx.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                  {trx.type === 'income' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                </div>
                <div>
                  <p className="font-medium dark:text-white">{trx.desc}</p>
                  <p className="text-xs text-slate-500">{trx.date}</p>
                </div>
              </div>
              <span className={`font-bold ${trx.type === 'income' ? 'text-green-600' : 'text-slate-700 dark:text-slate-300'}`}>
                {trx.type === 'income' ? '+' : '-'}{formatRupiah(trx.amount)}
              </span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
