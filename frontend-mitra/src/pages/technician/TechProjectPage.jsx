import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ImagePlus, MapPin, Plus, Send, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { uploadImageToBucket } from '../../utils/imageUpload';
import { Badge, Button, Card, EmptyState, Field, Input, Money, Notice, Sheet, Spinner, Textarea, cx } from '../../components/ui';
import useSkills from '../../hooks/useSkills';

const COMMISSION = 0.1; // migrations/0093 project_commission_rate
const PLANS = {
  '30-40-30': [{ label: 'DP', percent: 30 }, { label: 'Pengerjaan', percent: 40 }, { label: 'Pelunasan', percent: 30 }],
  '50-50': [{ label: 'DP', percent: 50 }, { label: 'Pelunasan', percent: 50 }],
  '100': [{ label: 'Lunas setelah selesai', percent: 100 }],
};
const STAGE = {
  pending: ['neutral', 'Belum dibayar pelanggan'], funded: ['brand', 'Dibayar, silakan kerjakan'],
  submitted: ['warning', 'Menunggu persetujuan pelanggan'], released: ['success', 'Cair ke saldo Anda'],
  refunded: ['neutral', 'Dikembalikan ke pelanggan'], disputed: ['danger', 'Keberatan, ditinjau Wira'],
};
const QUOTE_STATUS = { submitted: ['warning', 'Terkirim'], accepted: ['success', 'Dipilih'], rejected: ['neutral', 'Tidak dipilih'], withdrawn: ['neutral', 'Ditarik'], expired: ['neutral', 'Kedaluwarsa'] };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
const amountsOf = (total, plan) => {
  let used = 0;
  return plan.map((m, i) => {
    const a = i === plan.length - 1 ? total - used : Math.round(total * m.percent / 100);
    used += a;
    return a;
  });
};

function Chat({ projectId, userId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from('project_messages').select('id, sender_id, body, created_at')
      .eq('project_id', projectId).eq('technician_id', userId).order('created_at');
    setMessages(data || []);
    setTimeout(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, 50);
  }, [projectId, userId]);
  useEffect(() => {
    load();
    const ch = supabase.channel(`tech-project-chat-${projectId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_messages', filter: `project_id=eq.${projectId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, load]);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const { error } = await supabase.from('project_messages').insert({ project_id: projectId, technician_id: userId, sender_id: userId, body: text.trim() });
    if (error) { toast.error('Pesan belum terkirim'); return; }
    setText('');
    load();
  };
  return (
    <div className="flex flex-col gap-2.5">
      <div ref={listRef} className="flex max-h-72 min-h-[140px] flex-col gap-2 overflow-y-auto rounded-control border border-line bg-ground p-3">
        {messages.length === 0 && <p className="m-auto text-center text-[13px] text-ink-muted">Belum ada pesan. Tanyakan detail atau tawarkan survei lokasi.</p>}
        {messages.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={cx('flex flex-col gap-0.5', mine ? 'items-end' : 'items-start')}>
              <span className={cx('max-w-[85%] whitespace-pre-wrap break-words rounded-card px-3.5 py-2 text-sm', mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-line bg-card text-ink')}>{m.body}</span>
              <span className="px-1 font-mono text-[10.5px] text-ink-muted">{new Date(m.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Tulis pesan..." aria-label="Tulis pesan"
          className="min-h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-ground px-4 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/20" />
        <button type="submit" disabled={!text.trim()} aria-label="Kirim" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white disabled:opacity-50"><Send size={17} /></button>
      </form>
    </div>
  );
}

/**
 * A project for a technician (migrations/0093): details, their quote,
 * chat with the customer, and (once awarded) reporting each paid stage.
 */
export default function TechProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { nameOf } = useSkills();
  const [project, setProject] = useState(null);
  const [quote, setQuote] = useState(null);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState(null); // stage being reported
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: list } = await supabase.rpc('get_technician_projects');
    const p = (list || []).find((x) => x.id === id) || null;
    setProject(p);
    const { data: q } = await supabase.from('project_quotes').select('*').eq('project_id', id).eq('technician_id', user.id).maybeSingle();
    setQuote(q || null);
    if (p?.awarded_to_me) {
      const { data: m } = await supabase.from('project_milestones').select('*').eq('project_id', id).order('seq');
      setStages(m || []);
    }
    setLoading(false);
  }, [id, user]);

  useEffect(() => { load(); }, [load]);

  const openForm = () => {
    setForm(quote && quote.status === 'submitted' ? {
      total: String(quote.total), timeline: String(quote.timeline_days), start: quote.start_date || '', warranty: String(quote.warranty_days),
      materials: quote.materials_included, message: quote.message || '', plan: quote.milestones,
      items: (quote.line_items || []).map((li) => ({ label: li.label, amount: String(li.amount) })),
    } : { total: '', timeline: '', start: '', warranty: '30', materials: true, message: '', plan: PLANS['30-40-30'], items: [] });
  };

  const itemsSum = (form?.items || []).reduce((s, li) => s + (Number(li.amount) || 0), 0);

  const submitQuote = async (e) => {
    e.preventDefault();
    const total = Math.round(Number(form.items.length ? itemsSum : form.total));
    setSaving(true);
    try {
      const { error } = await supabase.rpc('submit_project_quote', {
        p_project_id: id,
        p_total: total,
        p_timeline_days: Number(form.timeline),
        p_milestones: form.plan,
        p_line_items: form.items.filter((li) => li.label.trim()).map((li) => ({ label: li.label.trim(), amount: Math.round(Number(li.amount) || 0) })),
        p_start_date: form.start || null,
        p_warranty_days: Number(form.warranty) || 0,
        p_materials_included: form.materials,
        p_message: form.message,
      });
      if (error) throw error;
      toast.success('Penawaran terkirim ke pelanggan');
      setForm(null);
      load();
    } catch (err) {
      toast.error(err.message || 'Penawaran belum terkirim');
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    const { error } = await supabase.rpc('withdraw_project_quote', { p_quote_id: quote.id });
    if (error) { toast.error(error.message); return; }
    toast.success('Penawaran ditarik');
    load();
  };

  const submitStage = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const urls = await Promise.all(photos.map((f) => uploadImageToBucket(supabase, 'project-photos', user.id, f)));
      const { error } = await supabase.rpc('submit_project_milestone', { p_milestone_id: report.id, p_note: note, p_photos: urls });
      if (error) throw error;
      toast.success('Laporan terkirim. Pelanggan diminta menyetujui.');
      setReport(null);
      setNote('');
      setPhotos([]);
      load();
    } catch (err) {
      toast.error(err.message || 'Laporan belum terkirim');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex h-[60vh] items-center justify-center text-brand-ink"><Spinner size={28} /></div>;
  if (!project) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState title="Proyek tidak tersedia" description="Proyek ini sudah ditutup atau tidak sesuai keahlian Anda." />
        <Button variant="secondary" onClick={() => navigate('/technician/orders')}>Kembali</Button>
      </div>
    );
  }

  const canQuote = project.status === 'open' && (!quote || ['submitted', 'withdrawn', 'expired'].includes(quote.status));
  const formTotal = form ? Math.round(Number(form.items.length ? itemsSum : form.total) || 0) : 0;
  const planOk = form && form.plan.reduce((s, m) => s + Number(m.percent || 0), 0) === 100 && form.plan.every((m) => m.percent >= 10 && m.label.trim());

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => navigate('/technician/orders')} aria-label="Kembali" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-card text-ink hover:bg-sunken">
          <ChevronLeft size={20} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Proyek · {nameOf(project.skill)}</span>
          <h1 className="text-balance text-[21px] font-extrabold leading-tight tracking-tight text-ink">{project.title}</h1>
          {project.awarded_to_me ? <Badge tone="success" dot>Proyek Anda</Badge> : quote && <Badge tone={QUOTE_STATUS[quote.status][0]} dot>Penawaran: {QUOTE_STATUS[quote.status][1]}</Badge>}
        </div>
      </div>

      <Card className="flex flex-col gap-3">
        <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">{project.description}</p>
        {project.photos?.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {project.photos.map((src) => (
              <a key={src} href={src} target="_blank" rel="noreferrer" className="h-20 w-20 shrink-0 overflow-hidden rounded-control border border-line"><img src={src} alt="" className="h-full w-full object-cover" /></a>
            ))}
          </div>
        )}
        <dl className="flex flex-col gap-1.5 border-t border-line pt-3 text-[13px]">
          <div className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" /><dd>{project.address || `${project.area} (alamat lengkap terlihat setelah penawaran Anda dipilih)`}</dd></div>
          <div className="flex items-start gap-2"><CalendarDays size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" /><dd>Ingin mulai: {fmtDate(project.preferred_start)}</dd></div>
          {(project.budget_min || project.budget_max) && (
            <div className="flex items-center gap-1.5"><dt className="text-ink-muted">Anggaran pelanggan:</dt><dd><Money value={Number(project.budget_min || 0)} /> – <Money value={Number(project.budget_max || project.budget_min)} /></dd></div>
          )}
          <div className="text-ink-muted">Pelanggan: {project.customer_name} · {project.quote_count} penawaran masuk{project.status === 'open' ? ` · ditutup ${fmtDate(project.expires_at)}` : ''}</div>
        </dl>
        {project.address && project.lat && project.lng && (
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${project.lat},${project.lng}`} target="_blank" rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-strong text-[13.5px] font-semibold text-ink hover:bg-sunken">Buka Rute di Google Maps</a>
        )}
      </Card>

      {quote && !project.awarded_to_me && (
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-bold text-ink">Penawaran Anda</span>
            <Money value={Number(quote.total)} className="text-[16px] font-medium text-ink" />
          </div>
          <p className="text-[12.5px] text-ink-muted">{quote.timeline_days} hari · garansi {quote.warranty_days} hari · berlaku sampai {fmtDate(quote.valid_until)}</p>
          {quote.status === 'submitted' && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={withdraw}>Tarik</Button>
              <Button onClick={openForm}>Ubah</Button>
            </div>
          )}
        </Card>
      )}

      {canQuote && (!quote || quote.status !== 'submitted') && (
        <Button size="lg" onClick={openForm}>Ajukan Penawaran</Button>
      )}

      {project.awarded_to_me && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-bold text-ink">Termin pembayaran</h2>
          <Card padding="none">
            <ul className="divide-y divide-line">
              {stages.map((s) => (
                <li key={s.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <span className="text-[14px] font-semibold text-ink">{s.seq}. {s.label}</span>
                      <Badge tone={STAGE[s.status][0]} dot>{STAGE[s.status][1]}</Badge>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <Money value={Number(s.amount)} className="text-[15px] font-medium text-ink" />
                      <span className="text-[11.5px] text-ink-muted">Anda terima <Money value={Math.round(Number(s.amount) * (1 - COMMISSION))} /></span>
                    </span>
                  </div>
                  {s.status === 'funded' && <Button onClick={() => { setReport(s); setNote(''); setPhotos([]); }} leftIcon={<Upload size={16} />}>Laporkan Tahap Selesai</Button>}
                  {s.status === 'disputed' && s.dispute_reason && <Notice tone="warning">Keberatan pelanggan: {s.dispute_reason}</Notice>}
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-[12px] leading-relaxed text-ink-muted">Dana tiap termin dibayar pelanggan ke Wira dulu. Kerjakan tahap yang sudah dibayar, lalu laporkan dengan foto; dana cair setelah pelanggan setuju atau otomatis dalam 72 jam.</p>
        </section>
      )}

      {(project.awarded_to_me || project.status === 'open') && user && (
        <Card className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-bold text-ink">Chat dengan {project.customer_name}</h2>
          {!project.awarded_to_me && <p className="text-[12px] text-ink-muted">Nomor HP dan tautan disembunyikan otomatis sampai proyek diberikan ke Anda.</p>}
          <Chat projectId={project.id} userId={user.id} />
        </Card>
      )}

      {/* Quote form */}
      <Sheet
        open={!!form}
        onClose={() => { if (!saving) setForm(null); }}
        dismissible={!saving}
        size="lg"
        title="Penawaran harga"
        description="Pelanggan membandingkan sampai 5 penawaran. Harga sudah termasuk komisi Wira 10%."
        footer={form && (
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>Batal</Button>
            <Button type="submit" form="quote-form" isLoading={saving} disabled={!planOk || formTotal < 50000 || !Number(form.timeline)}>Kirim Penawaran</Button>
          </>
        )}
      >
        {form && (
          <form id="quote-form" onSubmit={submitQuote} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-ink">Rincian biaya (opsional)</span>
              {form.items.map((li, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input aria-label="Uraian" placeholder="Contoh: Bahan terazzo 40 m²" value={li.label} onChange={(e) => setForm((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} className="min-w-0 flex-1" />
                  <Input aria-label="Biaya" type="number" inputMode="numeric" value={li.amount} onChange={(e) => setForm((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) }))} className="w-32 font-mono" />
                  <button type="button" aria-label="Hapus baris" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-sunken"><Trash2 size={16} /></button>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="self-start" leftIcon={<Plus size={15} />} onClick={() => setForm((f) => ({ ...f, items: [...f.items, { label: '', amount: '' }] }))}>Tambah baris</Button>
            </div>
            {form.items.length > 0 ? (
              <div className="flex justify-between rounded-control bg-sunken px-3 py-2 text-[14px] font-semibold"><span>Total</span><Money value={itemsSum} /></div>
            ) : (
              <Field label="Total harga (Rp)" htmlFor="q-total" required>
                <Input id="q-total" type="number" inputMode="numeric" min={50000} step={10000} value={form.total} onChange={(e) => setForm((f) => ({ ...f, total: e.target.value }))} className="font-mono" required />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Lama kerja (hari)" htmlFor="q-days" required>
                <Input id="q-days" type="number" inputMode="numeric" min={1} max={365} value={form.timeline} onChange={(e) => setForm((f) => ({ ...f, timeline: e.target.value }))} className="font-mono" required />
              </Field>
              <Field label="Garansi (hari)" htmlFor="q-warranty">
                <Input id="q-warranty" type="number" inputMode="numeric" min={0} max={730} value={form.warranty} onChange={(e) => setForm((f) => ({ ...f, warranty: e.target.value }))} className="font-mono" />
              </Field>
            </div>
            <Field label="Bisa mulai tanggal" htmlFor="q-start">
              <Input id="q-start" type="date" min={new Date().toISOString().slice(0, 10)} value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} className="font-mono" />
            </Field>
            <label className="flex min-h-11 items-center gap-3 text-[14px] text-ink">
              <input type="checkbox" checked={form.materials} onChange={(e) => setForm((f) => ({ ...f, materials: e.target.checked }))} className="h-5 w-5 rounded border-line-strong text-brand focus:ring-brand/30" />
              Harga sudah termasuk bahan
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-semibold text-ink">Termin pembayaran</legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PLANS).map(([key, plan]) => (
                  <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, plan }))}
                    className={cx('min-h-10 rounded-full border px-3.5 text-[13px] font-semibold', JSON.stringify(form.plan) === JSON.stringify(plan) ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink')}>
                    {plan.map((m) => m.percent).join(' / ')}
                  </button>
                ))}
              </div>
              <ul className="flex flex-col gap-1.5">
                {form.plan.map((m, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Input aria-label={`Nama termin ${i + 1}`} value={m.label} onChange={(e) => setForm((f) => ({ ...f, plan: f.plan.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} className="min-w-0 flex-1" />
                    <span className="w-12 text-right font-mono text-[13px] text-ink-muted">{m.percent}%</span>
                    <Money value={amountsOf(formTotal, form.plan)[i]} className="w-28 text-right text-[13px] text-ink" />
                  </li>
                ))}
              </ul>
              <p className="text-[12px] text-ink-muted">Termin pertama dibayar pelanggan saat memilih penawaran Anda (ditahan Wira).</p>
            </fieldset>
            <Field label="Pesan untuk pelanggan" htmlFor="q-msg" hint="Jelaskan pengalaman, cara kerja, dan apa yang termasuk.">
              <Textarea id="q-msg" rows={3} maxLength={1000} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
            </Field>
            {formTotal > 0 && (
              <p className="text-[12.5px] text-ink-muted">Bila dipilih, Anda menerima <Money value={Math.round(formTotal * (1 - COMMISSION))} className="text-ink" /> setelah komisi 10%.</p>
            )}
          </form>
        )}
      </Sheet>

      {/* Report a stage */}
      <Sheet
        open={!!report}
        onClose={() => { if (!saving) setReport(null); }}
        dismissible={!saving}
        title={report ? `Laporkan: ${report.label}` : ''}
        description="Pelanggan melihat catatan dan foto ini sebelum menyetujui pencairan."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setReport(null)} disabled={saving}>Batal</Button>
            <Button type="submit" form="stage-form" isLoading={saving}>Kirim Laporan</Button>
          </>
        )}
      >
        <form id="stage-form" onSubmit={submitStage} className="flex flex-col gap-4">
          <Field label="Catatan" htmlFor="stage-note">
            <Textarea id="stage-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: lantai terpasang, tinggal poles" />
          </Field>
          <div className="flex flex-wrap gap-2">
            {photos.map((f, i) => (
              <span key={i} className="relative h-16 w-16 overflow-hidden rounded-control border border-line">
                <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                <button type="button" aria-label="Hapus foto" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-white"><X size={12} /></button>
              </span>
            ))}
            {photos.length < 6 && (
              <>
                <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; setPhotos((p) => [...p, ...fs].slice(0, 6)); }} />
                <button type="button" onClick={() => fileRef.current?.click()} className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-control border border-dashed border-line-strong text-ink-muted hover:border-brand"><ImagePlus size={18} /><span className="text-[10px] font-semibold">Foto</span></button>
              </>
            )}
          </div>
        </form>
      </Sheet>
    </div>
  );
}
