import { useState, useEffect } from 'react';
import { MessageSquare, Send, Search, Phone, History, CheckCheck, ExternalLink, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

const TEMPLATES = [
  {
    id: 'approve',
    title: 'Pemberitahuan Akun Disetujui',
    text: 'Halo Mitra Wira! Selamat, pendaftaran dan verifikasi berkas Anda di aplikasi Wira telah kami setujui. Silakan buka aplikasi mitra Anda untuk mulai menerima orderan.'
  },
  {
    id: 'reject_docs',
    title: 'Permintaan Perbaikan Berkas',
    text: 'Halo Mitra Wira, berkas foto SIM/KTP yang Anda lampirkan saat pendaftaran masih buram atau terpotong. Mohon kirimkan ulang foto berkas yang jelas ke nomor ini agar akun dapat kami aktifkan segera.'
  },
  {
    id: 'promo',
    title: 'Pengumuman Promo & Bonus',
    text: 'Kabar gembira untuk seluruh mitra & pengguna Wira! Dapatkan voucher diskon hingga 25% dan bonus komisi pekan ini dengan menyelesaikan minimal 10 pesanan.'
  },
  {
    id: 'support',
    title: 'Bantuan Layanan Pengguna',
    text: 'Halo, ada yang bisa Admin Wira bantu terkait pesanan atau penggunaan aplikasi hari ini?'
  }
];

const WhatsAppPage = () => {
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState(TEMPLATES[0].text);
  const [logs, setLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const savedLogs = localStorage.getItem('wira_wa_logs');
    if (savedLogs) {
      try {
        setLogs(JSON.parse(savedLogs));
      } catch {
        setLogs([]);
      }
    }
  }, []);

  const saveLog = (phone, text) => {
    const newLog = {
      id: 'wa_' + Date.now(),
      phone: phone,
      text: text,
      timestamp: new Date().toLocaleString('id-ID'),
      status: 'Terkirim via WhatsApp Web'
    };
    const updated = [newLog, ...logs];
    setLogs(updated);
    localStorage.setItem('wira_wa_logs', JSON.stringify(updated));
  };

  const handleSendWA = (e) => {
    e.preventDefault();
    if (!recipient.trim() || !message.trim()) {
      toast.error('Nomor telepon dan pesan harus diisi');
      return;
    }

    let cleanPhone = recipient.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1);
    } else if (!cleanPhone.startsWith('62')) {
      cleanPhone = '62' + cleanPhone;
    }

    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
    saveLog(cleanPhone, message);
    toast.success('Membuka WhatsApp...');
  };

  const applyTemplate = (tpl) => {
    setMessage(tpl.text);
    toast.success(`Template "${tpl.title}" diterapkan`);
  };

  const filteredLogs = logs.filter(l => 
    l.phone.includes(searchTerm) || 
    l.text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pusat Notifikasi & WhatsApp</h1>
        <p className="text-sm text-slate-500">Kirim pesan WhatsApp langsung ke calon mitra, driver, atau pelanggan tanpa dummy data</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Sender */}
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="text-emerald-500" size={20} />
            Kirim Pesan WhatsApp Langsung
          </h2>

          <form onSubmit={handleSendWA} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nomor WhatsApp Tujuan
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Contoh: 08123456789 atau 628123456789" 
                  className="input-field pl-10 w-full" 
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Isi Pesan
                </label>
                <span className="text-xs text-slate-400">{message.length} karakter</span>
              </div>
              <textarea 
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tuliskan pesan Anda..."
                className="input-field w-full"
                required
              />
            </div>

            {/* Template options */}
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Sparkles size={14} className="text-amber-500" /> Pilih Template Cepat:
              </p>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map(tpl => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button 
                type="submit" 
                className="btn-primary flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3"
              >
                <Send size={18} /> Kirim via WhatsApp Web / App <ExternalLink size={16} />
              </button>
            </div>
          </form>
        </div>

        {/* Quick Help Card */}
        <div className="space-y-6">
          <div className="card bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20">
            <h3 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <CheckCheck className="text-emerald-500" size={20} />
              Integrasi WhatsApp Riil
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
              Semua link WhatsApp di admin terhubung langsung ke API resmi `wa.me`. Anda dapat menghubungi calon mitra secara instan dari modal review berkas maupun form di samping.
            </p>
            <div className="bg-white/60 dark:bg-slate-800/60 p-3 rounded-lg border border-emerald-500/20 text-xs text-slate-700 dark:text-slate-300">
              💡 <strong>Tips:</strong> Pada menu "Calon Mitra Baru" di Dashboard atau halaman Driver/Merchant/Teknisi, klik <strong>"Review Berkas"</strong> untuk langsung menyapa calon mitra di nomor mereka.
            </div>
          </div>
        </div>
      </div>

      {/* Real WhatsApp Logs Table */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <History size={18} className="text-slate-400" /> Riwayat Kontak WhatsApp
          </h2>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari riwayat nomor..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 py-1.5 w-full text-sm" 
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Nomor Tujuan</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Pratinjau Pesan</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Waktu</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-10 text-slate-400">
                    <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="font-medium text-slate-600 dark:text-slate-300">Belum ada riwayat pesan terkirim</p>
                    <p className="text-xs text-slate-400 mt-1">Pesan yang Anda kirim ke mitra akan dicatat otomatis di sini</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4 font-mono font-medium text-slate-900 dark:text-white">+{l.phone}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300 max-w-md truncate">{l.text}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{l.timestamp}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        {l.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppPage;
