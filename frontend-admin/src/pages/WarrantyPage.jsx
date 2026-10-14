import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../config/supabase';
import { Badge, Button, Card, EmptyState, Field, PageHeader, Segmented, Select, Sheet, Spinner, Textarea } from '../components/ui';
import OrderPhotoLinks from '../components/common/OrderPhotoLinks';

const STATUS = {
  pending: ['Menunggu teknisi', 'warning'],
  disputed: ['Keberatan teknisi', 'danger'],
  accepted: ['Diterima teknisi', 'success'],
  assigned: ['Ditugaskan admin', 'success'],
  rejected: ['Ditolak', 'neutral'],
};
const fmt = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' });

/**
 * "Garansi" (migrations/0132): warranty claims on Service and Pool orders.
 * The admin decides every claim the technician objected to or did not answer
 * in time (assign a technician for a free visit, or reject with a reason),
 * and may decide any open claim earlier.
 */
export default function WarrantyPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('open');
  const [claims, setClaims] = useState([]);
  const [names, setNames] = useState({});
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState(null); // { claim, decision }
  const [tech, setTech] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('warranty_claims').select('*, order:order_id(title, service_type, rate_code)').order('created_at', { ascending: false }).limit(100);
    if (tab === 'open') q = q.in('status', ['pending', 'disputed']);
    const { data, error } = await q;
    if (error) { toast.error(error.message); setLoading(false); return; }
    const rows = data || [];
    setClaims(rows);
    const { data: profiles } = await supabase.from('technician_profiles').select('user_id, skills');
    const ids = [...new Set([...rows.flatMap((c) => [c.user_id, c.technician_id]), ...(profiles || []).map((p) => p.user_id)].filter(Boolean))];
    const { data: users } = ids.length ? await supabase.from('users').select('id, name').in('id', ids) : { data: [] };
    const map = Object.fromEntries((users || []).map((u) => [u.id, u.name]));
    setNames(map);
    setTechs((profiles || []).map((p) => ({ id: p.user_id, name: map[p.user_id] || p.user_id.slice(0, 8), skills: p.skills || [] })));
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const open = (claim, decision) => {
    setTarget({ claim, decision });
    setTech(decision === 'assign' ? (claim.status === 'pending' ? claim.technician_id || '' : '') : '');
    setNote('');
  };

  const decide = async () => {
    if (target.decision === 'assign' && !tech) { toast.error('Pilih teknisi'); return; }
    if (target.decision === 'reject' && note.trim().length < 5) { toast.error('Tuliskan alasan untuk pelanggan'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_resolve_warranty_claim', {
      p_claim_id: target.claim.id, p_decision: target.decision, p_technician: target.decision === 'assign' ? tech : null, p_note: note.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(target.decision === 'assign' ? 'Kunjungan garansi dibuat' : 'Klaim ditolak');
    setTarget(null);
    load();
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="Garansi"
        subtitle="Klaim garansi WiraService (sesuai hari garansi di menu Harga) dan WiraPool (air jernih selama paket). Teknisi menjawab dulu; keberatan dan klaim yang lewat batas jawab diputuskan di sini. Kunjungan garansi gratis untuk pelanggan dan tanpa komisi."
        className="mb-0"
      />
      <Segmented value={tab} onChange={setTab} options={[{ value: 'open', label: 'Perlu keputusan' }, { value: 'all', label: 'Semua' }]} />
      {loading ? (
        <div className="flex justify-center py-10 text-brand-ink"><Spinner size={24} /></div>
      ) : claims.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={22} />} title="Tidak ada klaim" description="Klaim garansi pelanggan muncul di sini." />
      ) : claims.map((c) => {
        const overdue = c.status === 'pending' && new Date(c.response_due) < new Date();
        const [label, tone] = STATUS[c.status] || [c.status, 'neutral'];
        return (
          <Card key={c.id} className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] font-bold text-ink">{c.order?.title || 'Pesanan'}</p>
              <div className="flex gap-1.5">
                {overdue && <Badge tone="danger">Lewat batas jawab</Badge>}
                <Badge tone={tone}>{label}</Badge>
              </div>
            </div>
            <p className="text-[12.5px] text-ink-muted">
              Pelanggan {names[c.user_id] || '–'} · teknisi {names[c.technician_id] || '–'} · diajukan {fmt(c.created_at)} · batas jawab {fmt(c.response_due)}
            </p>
            <p className="break-words text-[13.5px] text-ink">{c.description}</p>
            <OrderPhotoLinks paths={c.photos} label="Foto pelanggan" />
            {c.preferred && <p className="text-[12.5px] text-ink-muted">Waktu diminta: {c.preferred}</p>}
            {c.technician_reason && (
              <div className="flex flex-col gap-1.5 rounded-control border border-line bg-sunken p-3">
                <p className="text-[12.5px] font-semibold text-ink">Keberatan teknisi</p>
                <p className="break-words text-[13px] text-ink">{c.technician_reason}</p>
                <OrderPhotoLinks paths={c.technician_photos} label="Foto teknisi" />
              </div>
            )}
            {c.admin_note && <p className="text-[12.5px] text-ink-muted">Catatan admin: {c.admin_note}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => navigate(`/orders?id=${c.order_id}`)}>Lihat pesanan</Button>
              {c.visit_order_id && <Button size="sm" variant="secondary" onClick={() => navigate(`/orders?id=${c.visit_order_id}`)}>Lihat kunjungan garansi</Button>}
              {['pending', 'disputed'].includes(c.status) && (
                <>
                  <Button size="sm" onClick={() => open(c, 'assign')}>Setujui &amp; tugaskan</Button>
                  <Button size="sm" variant="danger-soft" onClick={() => open(c, 'reject')}>Tolak</Button>
                </>
              )}
            </div>
          </Card>
        );
      })}

      <Sheet
        open={!!target}
        onClose={() => !saving && setTarget(null)}
        title={target?.decision === 'assign' ? 'Setujui klaim' : 'Tolak klaim'}
        description={target?.decision === 'assign'
          ? 'Pilih teknisi untuk kunjungan garansi gratis. Teknisi asal boleh dipilih lagi.'
          : 'Alasan ini dikirim ke pelanggan.'}
        footer={(
          <>
            <Button variant="secondary" size="lg" onClick={() => setTarget(null)} disabled={saving}>Batal</Button>
            <Button size="lg" variant={target?.decision === 'reject' ? 'danger' : 'primary'} onClick={decide} isLoading={saving}>
              {target?.decision === 'assign' ? 'Buat kunjungan garansi' : 'Tolak klaim'}
            </Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          {target?.decision === 'assign' && (
            <Field label="Teknisi" htmlFor="warranty-tech">
              <Select id="warranty-tech" value={tech} onChange={(e) => setTech(e.target.value)}>
                <option value="">Pilih teknisi</option>
                {techs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.id === target.claim.technician_id ? ' (teknisi asal)' : ''}{t.skills.length ? ` · ${t.skills.join(', ')}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={target?.decision === 'assign' ? 'Catatan untuk teknisi (opsional)' : 'Alasan penolakan'} htmlFor="warranty-note">
            <Textarea id="warranty-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
