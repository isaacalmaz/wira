import { useState, useEffect } from 'react';
import { MessageSquare, Send, Search, Phone, History, CheckCheck, ExternalLink, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Card, EmptyState, Field, IconTile, Input, Notice, PageHeader, Table, Textarea, cx } from '../components/ui';

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

const WhatsAppPage = ({ embedded = false }) => {
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
    <div className="flex flex-col gap-6">
      {!embedded && (
        <PageHeader
          title="Pusat Notifikasi & WhatsApp"
          subtitle="Kirim pesan WhatsApp langsung ke calon mitra, driver, atau pelanggan tanpa dummy data"
          className="!mb-0"
        />
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Form Sender */}
        <Card padding="none" className="min-w-0 xl:col-span-2">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <IconTile tone="success" size="sm"><MessageSquare size={18} /></IconTile>
            <h2 className="text-[15px] font-bold tracking-tight text-ink">Kirim Pesan WhatsApp Langsung</h2>
          </div>

          <form onSubmit={handleSendWA} className="flex flex-col gap-5 p-5">
            <Field label="Nomor WhatsApp Tujuan" htmlFor="wa-recipient">
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={17} />
                <Input
                  id="wa-recipient"
                  type="text"
                  inputMode="tel"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Contoh: 08123456789 atau 628123456789"
                  className="pl-10 font-mono !text-sm"
                  required
                />
              </div>
            </Field>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="wa-message" className="text-[13px] font-semibold text-ink">
                  Isi Pesan
                </label>
                <span className="text-xs text-ink-muted"><span className="font-mono">{message.length}</span> karakter</span>
              </div>
              <Textarea
                id="wa-message"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tuliskan pesan Anda..."
                className="!text-sm"
                required
              />
            </div>

            {/* Template options */}
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                <Sparkles size={13} /> Pilih Template Cepat:
              </p>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map(tpl => {
                  const active = message === tpl.text;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      aria-pressed={active}
                      className={cx(
                        'min-h-9 rounded-full border px-3.5 text-[12.5px] font-semibold transition-colors',
                        active
                          ? 'border-brand-line bg-brand-soft text-brand-ink'
                          : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
                      )}
                    >
                      {tpl.title}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <Button
                type="submit"
                size="lg"
                block
                leftIcon={<Send size={18} />}
                rightIcon={<ExternalLink size={16} />}
              >
                Kirim via WhatsApp Web / App
              </Button>
            </div>
          </form>
        </Card>

        {/* Quick Help Card */}
        <Card padding="lg" className="flex min-w-0 flex-col gap-3 self-start">
          <div className="flex items-center gap-3">
            <IconTile tone="success" size="sm"><CheckCheck size={18} /></IconTile>
            <h3 className="text-[15px] font-bold tracking-tight text-ink">Integrasi WhatsApp Riil</h3>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Semua link WhatsApp di admin terhubung langsung ke API resmi <code className="font-mono text-ink">wa.me</code>. Anda dapat menghubungi calon mitra secara instan dari modal review berkas maupun form di samping.
          </p>
          <Notice tone="info">
            <strong>Tips:</strong> Pada menu &quot;Calon Mitra Baru&quot; di Dashboard atau halaman Driver/Merchant/Teknisi, klik <strong>&quot;Review Berkas&quot;</strong> untuk langsung menyapa calon mitra di nomor mereka.
          </Notice>
        </Card>
      </div>

      {/* Real WhatsApp Logs Table */}
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-ink">
            <History size={18} className="text-ink-muted" /> Riwayat Kontak WhatsApp
          </h2>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={17} />
            <Input
              type="text"
              aria-label="Cari riwayat nomor"
              placeholder="Cari riwayat nomor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 !text-sm"
            />
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={22} />}
            title="Belum ada riwayat pesan terkirim"
            description="Pesan yang Anda kirim ke mitra akan dicatat otomatis di sini"
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Nomor Tujuan</th>
                <th>Pratinjau Pesan</th>
                <th>Waktu</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(l => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap font-mono text-[12.5px] font-medium">+{l.phone}</td>
                  <td className="max-w-md truncate text-ink-muted">{l.text}</td>
                  <td className="whitespace-nowrap font-mono text-[12px] text-ink-muted">{l.timestamp}</td>
                  <td><Badge tone="success" dot>{l.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
};

export default WhatsAppPage;
