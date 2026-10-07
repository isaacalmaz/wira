import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Scale } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { Badge, Button, Card, EmptyState, Field, Money, PageHeader, Segmented, Sheet, Spinner, Stat, Table, Textarea } from '../components/ui';

const STATUS = { open: ['warning', 'Menunggu penawaran'], awarded: ['brand', 'Dikerjakan'], completed: ['success', 'Selesai'], cancelled: ['danger', 'Dibatalkan'], expired: ['neutral', 'Ditutup'] };
const STAGE = { pending: ['neutral', 'Belum dibayar'], funded: ['brand', 'Ditahan'], submitted: ['warning', 'Menunggu persetujuan'], released: ['success', 'Cair'], refunded: ['neutral', 'Dikembalikan'], disputed: ['danger', 'Keberatan'] };

/**
 * Projects and the money Wira holds for them (migrations/0093). Disputed
 * stages are decided here: pay the technician or refund the customer.
 */
export default function ProjectsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null); // project row
  const [stages, setStages] = useState([]);
  const [decide, setDecide] = useState(null); // { stage, action }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_projects');
    if (error) toast.error('Gagal memuat proyek');
    setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openProject = async (p) => {
    setOpen(p);
    const { data } = await supabase.from('project_milestones').select('*').eq('project_id', p.id).order('seq');
    setStages(data || []);
  };

  const resolve = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_resolve_project_milestone', { p_milestone_id: decide.stage.id, p_action: decide.action, p_note: note });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(decide.action === 'release' ? 'Dana dicairkan ke teknisi' : 'Dana dikembalikan ke pelanggan');
    setDecide(null);
    setNote('');
    await openProject(open);
    load();
  };

  const shown = useMemo(() => rows.filter((r) => (
    filter === 'disputed' ? r.disputed_count > 0 : filter === 'active' ? ['open', 'awarded'].includes(r.status) : true
  )), [rows, filter]);
  const held = rows.reduce((s, r) => s + Number(r.held || 0), 0);
  const disputed = rows.filter((r) => r.disputed_count > 0).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader className="!mb-0" title="Proyek" subtitle="Pekerjaan besar dengan penawaran dan termin. Dana termin ditahan Wira sampai pelanggan menyetujui." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Proyek berjalan" value={loading ? '–' : rows.filter((r) => ['open', 'awarded'].includes(r.status)).length} icon={<ClipboardList size={18} />} />
        <Stat label="Dana ditahan" value={loading ? '–' : <Money value={held} />} tone="pay" />
        <Stat label="Perlu keputusan" value={loading ? '–' : disputed} icon={<Scale size={18} />} tone="danger" />
      </div>
      <Segmented ariaLabel="Saring proyek" value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'Semua' }, { value: 'active', label: 'Berjalan' }, { value: 'disputed', label: `Keberatan${disputed ? ` (${disputed})` : ''}` },
      ]} />

      {loading ? (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted"><Spinner size={16} /> Memuat...</Card>
      ) : shown.length === 0 ? (
        <EmptyState icon={<ClipboardList size={24} />} title="Belum ada proyek" />
      ) : (
        <Table>
          <thead>
            <tr><th>Proyek</th><th>Pelanggan</th><th>Teknisi</th><th>Status</th><th className="text-right">Nilai</th><th className="text-right">Ditahan</th><th className="text-right">Aksi</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td><div className="flex flex-col"><span className="font-semibold">{r.title}</span><span className="text-[12px] text-ink-muted">{r.skill} · {r.area} · {r.quote_count} penawaran</span></div></td>
                <td>{r.customer_name || '–'}</td>
                <td>{r.technician_name || '–'}</td>
                <td className="whitespace-nowrap">
                  <Badge tone={(STATUS[r.status] || ['neutral'])[0]} dot>{(STATUS[r.status] || [null, r.status])[1]}</Badge>
                  {r.disputed_count > 0 && <Badge tone="danger" className="ml-1">Keberatan</Badge>}
                </td>
                <td className="text-right">{r.total ? <Money value={Number(r.total)} /> : '–'}</td>
                <td className="text-right"><Money value={Number(r.held || 0)} /></td>
                <td className="text-right"><Button size="sm" variant="secondary" onClick={() => openProject(r)}>Lihat</Button></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} size="lg" title={open?.title || ''} description={open ? `${open.customer_name || 'Pelanggan'} → ${open.technician_name || 'belum ada teknisi'}` : ''}>
        {open && (
          stages.length === 0 ? <p className="text-[13px] text-ink-muted">Belum ada termin (penawaran belum dipilih).</p> : (
            <ul className="flex flex-col divide-y divide-line">
              {stages.map((s) => (
                <li key={s.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex flex-col items-start gap-1">
                      <span className="text-[14px] font-semibold">{s.seq}. {s.label}</span>
                      <Badge tone={STAGE[s.status][0]} dot>{STAGE[s.status][1]}</Badge>
                    </span>
                    <Money value={Number(s.amount)} className="font-medium" />
                  </div>
                  {s.note && <p className="text-[13px]">Laporan teknisi: {s.note}</p>}
                  {s.proof_photos?.length > 0 && (
                    <div className="flex gap-2">{s.proof_photos.map((src) => <a key={src} href={src} target="_blank" rel="noreferrer" className="h-14 w-14 overflow-hidden rounded-control border border-line"><img src={src} alt="" className="h-full w-full object-cover" /></a>)}</div>
                  )}
                  {s.dispute_reason && <p className="text-[13px] text-danger-ink">Keberatan pelanggan: {s.dispute_reason}</p>}
                  {s.resolution_note && <p className="text-[12.5px] text-ink-muted">{s.resolution_note}</p>}
                  {['disputed', 'submitted', 'funded'].includes(s.status) && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => { setDecide({ stage: s, action: 'release' }); setNote(''); }}>Cairkan ke teknisi</Button>
                      <Button size="sm" variant="danger-soft" onClick={() => { setDecide({ stage: s, action: 'refund' }); setNote(''); }}>Kembalikan ke pelanggan</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )
        )}
      </Sheet>

      <Sheet
        open={!!decide}
        onClose={() => { if (!busy) setDecide(null); }}
        dismissible={!busy}
        size="sm"
        tone={decide?.action === 'refund' ? 'danger' : 'default'}
        title={decide?.action === 'release' ? 'Cairkan ke teknisi?' : 'Kembalikan ke pelanggan?'}
        description={decide ? `${decide.stage.label}: ${decide.action === 'release' ? 'dana cair ke teknisi setelah dipotong komisi proyek yang berlaku saat proyek diterima.' : 'seluruh nominal kembali ke saldo WiraPay pelanggan.'} Keputusan dicatat dan dikirim ke kedua pihak.` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDecide(null)} disabled={busy}>Batal</Button>
            <Button variant={decide?.action === 'refund' ? 'danger' : 'primary'} isLoading={busy} disabled={note.trim().length < 5} onClick={resolve}>
              {decide?.action === 'release'
                ? `Cairkan Rp ${Number(decide?.stage?.amount || 0).toLocaleString('id-ID')} ke teknisi`
                : `Kembalikan Rp ${Number(decide?.stage?.amount || 0).toLocaleString('id-ID')}`}
            </Button>
          </>
        )}
      >
        <Field label="Catatan keputusan" htmlFor="decide-note" required>
          <Textarea id="decide-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Sheet>
    </div>
  );
}
