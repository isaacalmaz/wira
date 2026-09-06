import React, { useState } from 'react';
import { 
  X, CheckCircle, XCircle, Phone, MessageSquare, Car, Store, Wrench, 
  FileText, Calendar, Clock, AlertCircle, ZoomIn, Download, ShieldCheck, User 
} from 'lucide-react';

const MitraReviewModal = ({ isOpen, mitra, onClose, onVerify }) => {
  const [adminNotes, setAdminNotes] = useState('');
  const [isZoomed, setIsZoomed] = useState(false);

  if (!isOpen || !mitra) return null;

  const role = mitra.role || 'driver';
  const roleTitle = role === 'driver' ? 'Driver (Ojek / Mobil)' : role === 'merchant' ? 'Merchant (Restoran)' : 'Teknisi & Jasa';
  const roleIcon = role === 'driver' ? Car : role === 'merchant' ? Store : Wrench;
  const RoleIconComponent = roleIcon;

  const cleanPhone = (mitra.phone || '').replace(/[^0-9]/g, '').replace(/^0/, '62');
  
  const approveText = encodeURIComponent(
    `Halo ${mitra.name}, selamat! Pendaftaran Anda sebagai mitra ${roleTitle} Wira Lombok telah KAMI SETUJUI. Anda sekarang dapat mulai menerima pesanan. Silakan login ke aplikasi Mitra.`
  );
  const waApproveUrl = `https://wa.me/${cleanPhone}?text=${approveText}`;

  const rejectText = encodeURIComponent(
    `Halo ${mitra.name}, mohon maaf, pendaftaran Anda sebagai mitra ${roleTitle} Wira Lombok belum dapat kami setujui saat ini. Pastikan dokumen (SIM/KTP) jelas dan sesuai.`
  );
  const waRejectUrl = `https://wa.me/${cleanPhone}?text=${rejectText}`;

  const handleApprove = () => {
    onVerify(mitra.id, true, adminNotes);
    onClose();
  };

  const handleReject = () => {
    onVerify(mitra.id, false, adminNotes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <RoleIconComponent size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Review Berkas Mitra: {mitra.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ID Pendaftar: <span className="font-mono font-semibold">{mitra.id}</span> • Terdaftar:{' '}
                {mitra.created_at ? new Date(mitra.created_at).toLocaleString('id-ID') : 'Baru saja'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Isi Konten Review */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          
          {/* Status Badge & Alert */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle size={18} />
              <span>Status Saat Ini: <strong>{mitra.status || 'Pending'}</strong></span>
            </div>
            <span className="text-xs bg-amber-200/80 dark:bg-amber-900/60 px-2.5 py-1 rounded-full font-bold">
              {mitra.status === 'Active' ? 'Sudah Aktif' : mitra.status === 'Inactive' ? 'Ditolak' : 'Menunggu Review'}
            </span>
          </div>

          {/* Grid Informasi Pribadi & Kontak */}
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-3 text-xs uppercase tracking-wider text-slate-500">
              1. Identitas & Kontak
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
              <div>
                <p className="text-xs text-slate-500">Nama Lengkap</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{mitra.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Nomor Telepon / WA</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{mitra.phone || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Alamat Email</p>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{mitra.email || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Peran Layanan</p>
                <span className="inline-block mt-0.5 text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
                  {roleTitle}
                </span>
              </div>
            </div>
          </div>

          {/* Data Detail Spesifik Mitra */}
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-3 text-xs uppercase tracking-wider text-slate-500">
              2. Detail Operasional & Kendaraan
            </h4>
            {role === 'driver' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                <div>
                  <p className="text-xs text-slate-500">Jenis & Tipe Kendaraan</p>
                  <p className="font-bold text-slate-900 dark:text-white mt-0.5 text-base">{mitra.vehicle || 'Motor'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Nomor Plat Kendaraan</p>
                  <p className="font-mono font-bold text-primary mt-0.5 text-base">{mitra.plate || '-'}</p>
                </div>
              </div>
            )}

            {role === 'merchant' && (
              <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                <div>
                  <p className="text-xs text-slate-500">Nama Usaha / Restoran</p>
                  <p className="font-bold text-slate-900 dark:text-white mt-0.5 text-base">{mitra.restaurant_name || mitra.name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Alamat Lengkap</p>
                  <p className="text-slate-800 dark:text-slate-200 mt-0.5">{mitra.address || 'Mataram, Lombok'}</p>
                </div>
              </div>
            )}

            {role === 'technician' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                <div>
                  <p className="text-xs text-slate-500">Bidang Keahlian</p>
                  <p className="font-bold text-primary mt-0.5 text-base">{mitra.specialization || 'Umum'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Pengalaman Kerja</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">{mitra.experience || 1} Tahun</p>
                </div>
              </div>
            )}
          </div>

          {/* Dokumen Lampiran (SIM / STNK / Foto Tempat) */}
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-3 text-xs uppercase tracking-wider text-slate-500">
              3. Berkas Dokumen (Foto SIM / STNK / Legalitas)
            </h4>
            {mitra.sim_photo ? (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="relative group cursor-pointer overflow-hidden rounded-lg max-w-sm mx-auto bg-slate-900" onClick={() => setIsZoomed(!isZoomed)}>
                  <img
                    src={mitra.sim_photo}
                    alt="Dokumen Mitra"
                    className={`w-full object-contain rounded-lg transition duration-300 ${isZoomed ? 'scale-125' : 'group-hover:opacity-90 max-h-60'}`}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white gap-2 font-medium text-xs">
                    <ZoomIn size={16} /> Klik untuk {isZoomed ? 'Memperkecil' : 'Memperbesar'}
                  </div>
                </div>
                <p className="text-center text-xs text-green-600 dark:text-green-400 font-semibold mt-2 flex items-center justify-center gap-1">
                  <ShieldCheck size={14} /> Dokumen terlampir dan siap diverifikasi
                </p>
              </div>
            ) : (
              <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-center border-2 border-dashed border-slate-200 dark:border-slate-700">
                <FileText size={32} className="mx-auto text-slate-400 mb-1" />
                <p className="text-xs text-slate-500">Calon mitra belum melampirkan foto dokumen atau menggunakan pendaftaran cepat.</p>
                <p className="text-[11px] text-slate-400 mt-1">Anda dapat menghubungi calon mitra via WhatsApp untuk meminta foto SIM/dokumen pendukung.</p>
              </div>
            )}
          </div>

          {/* Catatan Verifikator */}
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-2 text-xs uppercase tracking-wider text-slate-500">
              4. Catatan Admin / Alasan Verifikasi
            </h4>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Tulis catatan (cth: SIM & STNK telah diverifikasi valid, motor sesuai spesifikasi...)"
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:ring-2 focus:ring-primary outline-none"
              rows={2}
            ></textarea>
          </div>

        </div>

        {/* Footer Aksi Modal */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <a
              href={waRejectUrl}
              target="_blank"
              rel="noreferrer"
              onClick={handleReject}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white hover:bg-red-50 text-red-600 border border-red-200 dark:bg-slate-800 dark:hover:bg-red-950/30 dark:border-red-800/50 text-xs font-semibold transition shadow-sm"
              title="Tolak Pendaftaran dan beri tahu mitra via WA"
            >
              <MessageSquare size={14} /> Tolak & WA
            </a>
            <button
              onClick={handleReject}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 text-xs font-semibold transition"
            >
              <XCircle size={14} /> Tolak Saja
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
             <button
              onClick={handleApprove}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-slate-500 hover:text-primary hover:bg-primary/10 dark:hover:bg-slate-800 text-xs font-semibold transition"
            >
              <CheckCircle size={14} /> Setuju Saja
            </button>
            <a
              href={waApproveUrl}
              target="_blank"
              rel="noreferrer"
              onClick={handleApprove}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-cyan-700 text-white text-xs font-bold shadow-md shadow-primary/20 transition active:scale-95"
              title="Setujui pendaftaran dan kirim ucapan selamat via WA"
            >
              <MessageSquare size={14} /> Setuju & WA
            </a>
          </div>
        </div>

      </div>
    </div>
  );
};

export default MitraReviewModal;
