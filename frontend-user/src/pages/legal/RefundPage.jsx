import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function RefundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
      <div className="bg-white dark:bg-slate-800 px-4 py-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
          <ChevronLeft size={24} className="dark:text-white" />
        </button>
        <h1 className="text-lg font-bold dark:text-white">Kebijakan Refund</h1>
      </div>
      
      <div className="p-4 space-y-4 text-sm text-slate-700 dark:text-slate-300">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
          <p className="text-xs text-slate-500">Pembaruan Terakhir: 17 September 2026</p>
          
          <h2 className="font-bold text-lg dark:text-white">1. Ketentuan Pengembalian Dana (Refund)</h2>
          <p>
            Wira berkomitmen untuk menjaga keamanan saldo Anda. Pengembalian dana (Refund) saldo WiraPay dapat dilakukan dalam kondisi tertentu, sesuai dengan kebijakan berikut.
          </p>
          
          <h2 className="font-bold text-lg dark:text-white">2. Pembatalan Pesanan</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Jika pesanan (Ride/Food/Send) <b>dibatalkan sebelum Mitra menerima pesanan</b>, saldo WiraPay Anda akan dikembalikan secara penuh 100% pada saat itu juga.</li>
            <li>Jika pesanan <b>dibatalkan oleh Mitra</b> karena alasan tertentu, saldo akan dikembalikan 100%.</li>
            <li>Jika Anda membatalkan pesanan <b>setelah Mitra sedang menuju lokasi Anda</b>, sistem mungkin membebankan biaya pembatalan sebagai kompensasi kepada Mitra.</li>
          </ul>

          <h2 className="font-bold text-lg dark:text-white">3. Kesalahan Sistem atau Penipuan</h2>
          <p>
            Jika saldo WiraPay Anda terpotong akibat kegagalan sistem (bug) atau aktivitas mencurigakan yang tidak Anda lakukan, Anda berhak mengajukan permohonan pengembalian dana melalui menu "Hubungi Kami" maksimal 7x24 jam setelah kejadian. Wira akan melakukan investigasi dalam 1-3 hari kerja.
          </p>

          <h2 className="font-bold text-lg dark:text-white">4. Penarikan Saldo (Withdrawal)</h2>
          <p>
            Saat ini, saldo WiraPay pelanggan tidak dapat diuangkan (di-withdraw) ke rekening bank pribadi. Saldo hanya dapat digunakan untuk transaksi di dalam aplikasi Wira.
          </p>
        </div>
      </div>
    </div>
  );
}
