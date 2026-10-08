import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Megaphone, Send, Smartphone, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { Badge, Button, Card, EmptyState, Field, Input, Notice, PageHeader, Segmented, Select, Sheet, Textarea } from '../components/ui';
import WhatsAppPage from './WhatsAppPage';
import { formatDateTime } from '../utils/datetime';

const SEGMENTS = [
  { value: 'customers', label: 'Semua pelanggan' },
  { value: 'partners', label: 'Semua mitra' },
  { value: 'driver', label: 'Driver' },
  { value: 'merchant', label: 'Restoran' },
  { value: 'villa', label: 'Pemilik villa' },
  { value: 'technician', label: 'Teknisi' },
  { value: 'everyone', label: 'Semua pelanggan dan mitra' },
];
const segLabel = (v) => SEGMENTS.find((s) => s.value === v)?.label || v;
const when = (ts) => formatDateTime(ts);

/**
 * One message to a whole group (admin_send_announcement, migrations/0103):
 * an in-app notification for every account in the segment, pushed to the
 * phones that allow notifications. WhatsApp to one person stays in its tab.
 */
export default function AnnouncementsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'wa' ? 'wa' : 'push';
  const [audience, setAudience] = useState(null);
  const [history, setHistory] = useState([]);
  const [segment, setSegment] = useState('partners');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, h] = await Promise.all([
      supabase.rpc('admin_announcement_audience'),
      supabase.from('announcements').select('*, sender:users!sent_by(name)').order('created_at', { ascending: false }).limit(30),
    ]);
    if (a.error) toast.error('Gagal memuat jumlah penerima: ' + a.error.message);
    setAudience(a.data || null);
    setHistory(h.data || []);
  }, []);

  useEffect(() => { if (tab === 'push') load(); }, [load, tab]);

  const size = audience?.[segment];
  const valid = title.trim().length >= 3 && body.trim().length >= 5;

  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_send_announcement', { p_segment: segment, p_title: title.trim(), p_body: body.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Terkirim ke ${Number(data.recipients).toLocaleString('id-ID')} akun`);
    setConfirm(false);
    setTitle('');
    setBody('');
    load();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader className="!mb-0" title="Pengumuman" subtitle="Kabari pelanggan atau mitra sekaligus lewat notifikasi aplikasi, atau satu orang lewat WhatsApp." />

      <Segmented
        className="self-start"
        value={tab}
        onChange={(v) => setParams(v === 'wa' ? { tab: 'wa' } : {}, { replace: true })}
        options={[{ value: 'push', label: 'Pengumuman ke grup' }, { value: 'wa', label: 'WhatsApp perorangan' }]}
      />

      {tab === 'wa' ? <WhatsAppPage embedded /> : (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="flex flex-col gap-4">
              <Field label="Kirim ke" htmlFor="ann-segment" required>
                <Select id="ann-segment" value={segment} onChange={(e) => setSegment(e.target.value)}>
                  {SEGMENTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}{audience?.[s.value] ? ` · ${Number(audience[s.value].count).toLocaleString('id-ID')} akun` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              {size && (
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-muted">
                  <span className="inline-flex items-center gap-1.5"><Users size={14} />{Number(size.count).toLocaleString('id-ID')} akun menerima di kotak notifikasi</span>
                  <span className="inline-flex items-center gap-1.5"><Smartphone size={14} />{Number(size.push).toLocaleString('id-ID')} juga mendapat push di HP</span>
                </p>
              )}
              <Field label="Judul" htmlFor="ann-title" required hint={`${title.length}/80`}>
                <Input id="ann-title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Bonus akhir pekan untuk driver" />
              </Field>
              <Field label="Isi" htmlFor="ann-body" required hint={`${body.length}/300 · tampil di notifikasi HP, buat singkat dan jelas`}>
                <Textarea id="ann-body" rows={4} maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Selesaikan 10 pesanan Sabtu–Minggu, dapat bonus Rp 50.000 ke saldo pendapatan." />
              </Field>
              <Notice tone="info">Maksimal 5 pengumuman per jam untuk semua admin, supaya pengguna tidak merasa di-spam. Akun yang ditangguhkan dan akun staf tidak menerima.</Notice>
              <Button className="self-start" leftIcon={<Send size={16} />} disabled={!valid || !size?.count} onClick={() => setConfirm(true)}>
                Kirim pengumuman
              </Button>
            </Card>

            <div className="flex flex-col gap-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Pratinjau di HP</p>
              <div className="rounded-[28px] border border-line bg-sunken p-3">
                <div className="flex gap-3 rounded-2xl bg-card p-3 shadow-sm">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-[15px] font-black text-white">w</span>
                  <div className="min-w-0">
                    <p className="flex items-baseline justify-between gap-2 text-[12px] text-ink-muted">
                      <span>{['customers', 'everyone'].includes(segment) ? 'Wira' : 'Wira Mitra'}</span><span>sekarang</span>
                    </p>
                    <p className="break-words text-[14px] font-semibold text-ink">{title || 'Judul pengumuman'}</p>
                    <p className="line-clamp-3 break-words text-[13px] text-ink-muted">{body || 'Isi pengumuman tampil di sini.'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-bold text-ink">Riwayat pengumuman</h2>
            {history.length === 0 ? (
              <EmptyState icon={<Megaphone size={22} />} title="Belum ada pengumuman" />
            ) : (
              <Card padding="none" className="divide-y divide-line">
                {history.map((h) => (
                  <div key={h.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold text-ink">{h.title}</p>
                      <Badge tone="neutral">{segLabel(h.segment)}</Badge>
                      <span className="font-mono text-[12px] text-ink-muted">{Number(h.recipients).toLocaleString('id-ID')} akun</span>
                    </div>
                    <p className="text-[13px] text-ink-muted">{h.body}</p>
                    <p className="font-mono text-[11.5px] text-ink-muted">{when(h.created_at)}{h.sender?.name ? ` · ${h.sender.name}` : ''}</p>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </>
      )}

      <Sheet
        open={confirm}
        onClose={() => { if (!busy) setConfirm(false); }}
        dismissible={!busy}
        size="sm"
        icon={<Megaphone size={22} />}
        title={`Kirim ke ${segLabel(segment).toLowerCase()}?`}
        description={size ? `${Number(size.count).toLocaleString('id-ID')} akun menerima "${title.trim()}". Pengumuman tidak bisa ditarik kembali.` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)} disabled={busy}>Batal</Button>
            <Button onClick={send} isLoading={busy} leftIcon={<Send size={16} />}>Kirim</Button>
          </>
        )}
      />
    </div>
  );
}
