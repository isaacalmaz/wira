import { useState, useEffect } from 'react';
import {
  CheckCircle, XCircle, MessageSquare, Car, Store, Wrench, Package,
  FileText, ZoomIn, ShieldCheck
} from 'lucide-react';
import { Badge, Button, EmptyState, Notice, Sheet, Textarea } from '../ui';
import { formatDateTime } from '../../utils/datetime';

// One labelled value in the review panels.
const Item = ({ label, children }) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <p className="text-xs text-ink-muted">{label}</p>
    <div className="min-w-0 break-words text-sm font-semibold text-ink">{children}</div>
  </div>
);

const MitraReviewModal = ({ isOpen, mitra, onClose, onVerify }) => {
  const [adminNotes, setAdminNotes] = useState(mitra?.admin_notes || '');
  const [isZoomed, setIsZoomed] = useState(false);
  // Rejecting is irreversible for the applicant, so it asks first:
  // null | 'plain' | 'wa' (also open the WhatsApp message after confirming).
  const [rejectMode, setRejectMode] = useState(null);

  useEffect(() => {
    setAdminNotes(mitra?.admin_notes || '');
    setRejectMode(null);
  }, [mitra?.id]);

  if (!isOpen || !mitra) return null;

  const role = mitra.role || 'driver';
  const isVillaMerchant = mitra.service_type === 'villa' || mitra.service_type === 'WiraVilla';
  const roleTitle = role === 'driver' ? 'Driver (Ojek / Mobil)'
    : role === 'courier' ? 'Kurir (Antar Barang)'
    : role === 'merchant' ? (isVillaMerchant ? 'Merchant (Villa)' : 'Merchant (Restoran)')
    : 'Teknisi & Jasa';
  const roleIcon = role === 'driver' ? Car : role === 'courier' ? Package : role === 'merchant' ? Store : Wrench;
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
    if (rejectMode === 'wa') window.open(waRejectUrl, '_blank', 'noopener,noreferrer');
    onVerify(mitra.id, false, adminNotes);
    setRejectMode(null);
    onClose();
  };

  const statusLabel = mitra.status === 'Active' ? 'Sudah Aktif' : mitra.status === 'Inactive' ? 'Ditolak' : 'Menunggu Review';
  const statusTone = mitra.status === 'Active' ? 'success' : mitra.status === 'Inactive' ? 'danger' : 'warning';
  const eyebrow = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted';
  const panel = 'rounded-card border border-line bg-card p-4';
  const btnBase = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 py-2.5 text-center text-sm font-semibold leading-tight transition-[background-color,filter,color] duration-150';

  return (
    <Sheet
      open={isOpen && !!mitra}
      onClose={onClose}
      size="xl"
      icon={<RoleIconComponent size={21} />}
      title={`Review Berkas Mitra: ${mitra.name}`}
      description={(
        <>
          ID Pendaftar: <span className="font-mono text-ink">{mitra.id}</span> · Terdaftar:{' '}
          <span className="font-mono">{mitra.created_at ? formatDateTime(mitra.created_at) : 'Baru saja'}</span>
        </>
      )}
      footer={rejectMode ? (
        <>
          <p className="text-sm leading-relaxed text-danger-ink sm:mr-auto sm:self-center">
            Yakin menolak pendaftaran <span className="font-semibold">{mitra.name}</span>?
            {adminNotes.trim().length < 5 ? ' Isi alasan di kolom Catatan Admin (dikirim ke pendaftar).' : ''}
            {rejectMode === 'wa' ? ' Pesan penolakan WhatsApp akan dibuka setelahnya.' : ''}
          </p>
          <Button variant="secondary" onClick={() => setRejectMode(null)}>Batal</Button>
          <Button variant="danger" onClick={handleReject} leftIcon={<XCircle size={16} />} disabled={adminNotes.trim().length < 5}>Ya, tolak</Button>
        </>
      ) : (
        <>
          <div className="flex flex-col-reverse gap-2.5 sm:mr-auto sm:flex-row">
            <Button
              variant="danger-soft"
              onClick={() => setRejectMode('wa')}
              leftIcon={<MessageSquare size={16} />}
              title="Tolak Pendaftaran dan beri tahu mitra via WA"
            >
              Tolak &amp; WA
            </Button>
            <Button variant="ghost" onClick={() => setRejectMode('plain')} leftIcon={<XCircle size={16} />} className="!text-danger-ink hover:!bg-danger-soft">
              Tolak Saja
            </Button>
          </div>
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
            <Button variant="secondary" onClick={handleApprove} leftIcon={<CheckCircle size={16} />}>
              Setuju Saja
            </Button>
            <a
              href={waApproveUrl}
              target="_blank"
              rel="noreferrer"
              onClick={handleApprove}
              className={`${btnBase} bg-brand text-white hover:bg-brand-hover`}
              title="Setujui pendaftaran dan kirim ucapan selamat via WA"
            >
              <MessageSquare size={16} /> Setuju &amp; WA
            </a>
          </div>
        </>
      )}
    >
      <div className="flex flex-col gap-6 text-sm">

        {/* Status Badge & Alert */}
        <div data-autofocus tabIndex={-1} className="outline-none">
          <Notice tone="warning" action={<Badge tone={statusTone} dot>{statusLabel}</Badge>}>
            Status Saat Ini: <strong>{mitra.status || 'Pending'}</strong>
          </Notice>
        </div>

        {/* Grid Informasi Pribadi & Kontak */}
        <section className="flex flex-col gap-2.5">
          <h4 className={eyebrow}>1. Identitas &amp; Kontak</h4>
          <div className={`${panel} grid grid-cols-1 gap-4 sm:grid-cols-2`}>
            <Item label="Nama Lengkap">{mitra.name}</Item>
            <Item label="Nomor Telepon / WA"><span className="font-mono font-medium">{mitra.phone || '-'}</span></Item>
            <Item label="Alamat Email">{mitra.email || '-'}</Item>
            <Item label="Peran Layanan"><Badge tone="brand">{roleTitle}</Badge></Item>
          </div>
        </section>

        {/* Data Detail Spesifik Mitra */}
        <section className="flex flex-col gap-2.5">
          <h4 className={eyebrow}>2. Detail Operasional &amp; Kendaraan</h4>
          {(role === 'driver' || role === 'courier') && (
            <div className={`${panel} grid grid-cols-1 gap-4 sm:grid-cols-2`}>
              <Item label="Jenis & Tipe Kendaraan"><span className="text-[15px] font-bold">{mitra.vehicle || 'Motor'}</span></Item>
              <Item label="Nomor Plat Kendaraan"><span className="font-mono text-[15px] font-medium text-brand-ink">{mitra.plate || '-'}</span></Item>
            </div>
          )}

          {role === 'merchant' && (
            <div className={`${panel} flex flex-col gap-4`}>
              <Item label={isVillaMerchant ? 'Nama Villa / Penginapan' : 'Nama Usaha / Restoran'}>
                <span className="text-[15px] font-bold">{mitra.restaurant_name || mitra.name}</span>
              </Item>
              <Item label="Alamat Lengkap"><span className="font-medium">{mitra.address || 'Mataram, Lombok'}</span></Item>
            </div>
          )}

          {role === 'technician' && (
            <div className={`${panel} grid grid-cols-1 gap-4 sm:grid-cols-2`}>
              <Item label="Bidang Keahlian"><span className="text-[15px] font-bold text-brand-ink">{mitra.specialization || 'Umum'}</span></Item>
              <Item label="Pengalaman Kerja"><span><span className="font-mono">{mitra.experience || 1}</span> Tahun</span></Item>
            </div>
          )}
        </section>

        {/* Technicians: identity check (KTP + selfie, migrations/0092) */}
        {role === 'technician' && (
          <section className="flex flex-col gap-2.5">
            <h4 className={eyebrow}>3. Verifikasi Identitas (KTP & Selfie)</h4>
            {mitra.ktp_photo || mitra.selfie_photo ? (
              <div className={`${panel} grid grid-cols-1 gap-3 sm:grid-cols-2`}>
                {[['KTP', mitra.ktp_photo], ['Selfie', mitra.selfie_photo]].map(([label, src]) => (
                  <figure key={label} className="flex flex-col gap-1.5">
                    {src ? (
                      <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-control border border-line bg-sunken">
                        <img src={src} alt={`Foto ${label}`} className="max-h-60 w-full object-contain" />
                      </a>
                    ) : (
                      <div className="flex h-32 items-center justify-center rounded-control border border-dashed border-line-strong text-[12.5px] text-ink-muted">Tidak dilampirkan</div>
                    )}
                    <figcaption className="text-[12px] font-semibold text-ink-muted">{label}</figcaption>
                  </figure>
                ))}
                <p className="text-[12.5px] leading-relaxed text-ink-muted sm:col-span-2">
                  Pastikan wajah di selfie sama dengan foto KTP dan nama KTP sama dengan nama pendaftar. Menyetujui pendaftaran ini sekaligus memberi badge Terverifikasi.
                </p>
              </div>
            ) : (
              <EmptyState icon={<FileText size={22} />} title="Pendaftar ini belum melampirkan KTP dan selfie." description="Minta lewat WhatsApp, atau setujui tanpa badge Terverifikasi." className="py-7" />
            )}
          </section>
        )}

        {/* Dokumen Lampiran (SIM / STNK / Foto Tempat) */}
        {role !== 'technician' && <section className="flex flex-col gap-2.5">
          <h4 className={eyebrow}>3. Berkas Dokumen (Foto SIM / STNK / Legalitas)</h4>
          {mitra.sim_photo ? (
            <div className={`${panel} flex flex-col items-center gap-3`}>
              <button
                type="button"
                className="group relative mx-auto block w-full max-w-sm cursor-zoom-in overflow-hidden rounded-control bg-laut-900"
                onClick={() => setIsZoomed(!isZoomed)}
              >
                <img
                  src={mitra.sim_photo}
                  alt="Dokumen Mitra"
                  className={`w-full rounded-control object-contain transition duration-300 ${isZoomed ? 'scale-125' : 'max-h-60 group-hover:opacity-90'}`}
                />
                <span className="absolute inset-0 flex items-center justify-center gap-2 bg-laut-900/50 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  <ZoomIn size={16} /> Klik untuk {isZoomed ? 'Memperkecil' : 'Memperbesar'}
                </span>
              </button>
              <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-success-ink">
                <ShieldCheck size={14} /> Dokumen terlampir dan siap diverifikasi
              </p>
            </div>
          ) : (
            <EmptyState
              icon={<FileText size={22} />}
              title="Calon mitra belum melampirkan foto dokumen atau menggunakan pendaftaran cepat."
              description="Anda dapat menghubungi calon mitra via WhatsApp untuk meminta foto SIM/dokumen pendukung."
              className="py-7"
            />
          )}
        </section>}

        {/* Catatan Verifikator */}
        <section className="flex flex-col gap-2.5">
          <label htmlFor="mitra-admin-notes" className={eyebrow}>4. Catatan Admin / Alasan Verifikasi</label>
          <Textarea
            id="mitra-admin-notes"
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            placeholder="Tulis catatan (cth: SIM & STNK telah diverifikasi valid, motor sesuai spesifikasi...)"
            className="!text-sm"
            rows={2}
          />
        </section>

      </div>
    </Sheet>
  );
};

export default MitraReviewModal;
