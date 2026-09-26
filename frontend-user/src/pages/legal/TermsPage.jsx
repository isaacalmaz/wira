import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
      <div className="bg-white dark:bg-slate-800 px-4 py-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
          <ChevronLeft size={24} className="dark:text-white" />
        </button>
        <h1 className="text-lg font-bold dark:text-white">Syarat & Ketentuan</h1>
      </div>
      
      <div className="p-4 space-y-4 text-sm text-slate-700 dark:text-slate-300">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
          <p className="text-xs text-slate-500">Pembaruan Terakhir: 17 September 2026</p>
          
          <h2 className="font-bold text-lg dark:text-white">1. Ketentuan Umum</h2>
          <p>
            Dengan mengunduh, memasang, dan menggunakan aplikasi Wira ("Aplikasi"), Anda setuju bahwa Anda telah membaca, memahami, dan menyetujui Syarat dan Ketentuan ini. Syarat dan Ketentuan ini merupakan perjanjian sah antara Anda dan Wira.
          </p>
          
          <h2 className="font-bold text-lg dark:text-white">2. Layanan Kami</h2>
          <p>
            Wira menyediakan platform yang menghubungkan Anda dengan penyedia layanan independen (Mitra Pengemudi, Mitra Merchant, Mitra Jasa) untuk mendapatkan layanan transportasi, pengiriman makanan, barang, dan jasa lainnya.
          </p>

          <h2 className="font-bold text-lg dark:text-white">3. Akun Pengguna</h2>
          <p>
            Anda harus mendaftarkan akun untuk menggunakan Aplikasi. Anda bertanggung jawab untuk menjaga kerahasiaan informasi akun Anda, termasuk kata sandi. Segala aktivitas yang terjadi di bawah akun Anda adalah tanggung jawab Anda sepenuhnya.
          </p>

          <h2 className="font-bold text-lg dark:text-white">4. Pembayaran (WiraPay)</h2>
          <p>
            Pembayaran dapat dilakukan secara tunai atau melalui saldo WiraPay. Top-up saldo WiraPay dilakukan melalui payment gateway pihak ketiga yang terintegrasi (seperti Midtrans). Semua transaksi menggunakan mata uang Rupiah (IDR).
          </p>

          <h2 className="font-bold text-lg dark:text-white">5. Pembatasan Tanggung Jawab</h2>
          <p>
            Wira tidak bertanggung jawab atas kerugian langsung atau tidak langsung yang timbul dari penggunaan atau ketidakmampuan menggunakan layanan kami, termasuk namun tidak terbatas pada keterlambatan pengiriman atau tindakan Mitra.
          </p>
        </div>
      </div>
    </div>
  );
}
