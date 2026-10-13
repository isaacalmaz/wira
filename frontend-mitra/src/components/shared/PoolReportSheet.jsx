import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ClipboardCheck, ImagePlus, Plus, X } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Button, Field, Input, Segmented, Sheet, Textarea, cx } from '../ui';
import { completePoolVisit } from '../../services/technicianService';
import { uploadPrivateImage } from '../../utils/imageUpload';
import { friendlyError } from '../../utils/friendlyError';

const MAX_PHOTOS = 3;
const PH_RANGE = [7.2, 7.6];
const CHLORINE_RANGE = [1, 3];

// Usual work per pool service (pricing_rules pool codes).
const PRESET_TASKS = {
  S1: ['Sikat dinding & lantai', 'Vakum dasar kolam', 'Bersihkan skimmer', 'Cuci filter'],
  S2: ['Uji pH & klorin', 'Tambah klorin', 'Atur pH', 'Tambah anti lumut'],
  S3: ['Bongkar & bersihkan pompa', 'Cuci filter', 'Cek tekanan', 'Cek kebocoran'],
  MONTHLY_VISIT: ['Sikat dinding & lantai', 'Vakum dasar kolam', 'Bersihkan skimmer', 'Uji pH & klorin', 'Tambah klorin'],
};

function PhotoRow({ label, required, files, onChange, idPrefix }) {
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-ink">{label}{required && <span className="text-danger"> *</span>}</span>
      <div className="flex flex-wrap gap-2">
        {files.map((file, i) => (
          <span key={`${idPrefix}-${file.name}-${i}`} className="relative">
            <img src={previews[i]} alt="" className="h-20 w-20 rounded-control border border-line object-cover" />
            <button
              type="button"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              aria-label={`Hapus foto ${i + 1}`}
              className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-ink shadow-sm"
            >
              <X size={14} />
            </button>
          </span>
        ))}
        {files.length < MAX_PHOTOS && (
          <label className="inline-flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line-strong text-[11px] text-ink-muted hover:bg-sunken">
            <ImagePlus size={20} aria-hidden="true" />
            Foto
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onChange([...files, file].slice(0, MAX_PHOTOS));
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

function MeasureInput({ id, label, ideal, value, onChange, range, step }) {
  const num = Number(String(value).replace(',', '.'));
  const filled = String(value).trim() !== '' && Number.isFinite(num);
  const ok = filled && num >= range[0] && num <= range[1];
  return (
    <Field label={label} htmlFor={id} required hint={filled && !ok ? `Di luar batas ideal (${ideal})` : `Ideal ${ideal}`}>
      <Input
        id={id}
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        className={cx('font-mono', filled && (ok ? 'border-success' : 'border-warning'))}
        placeholder={ideal.split('–')[0]}
      />
    </Field>
  );
}

/**
 * "Kirim laporan & selesai" for a pool care visit (migrations/0125): photos,
 * pH, chlorine, water condition and what was done. The customer sees the
 * report on their order; the visit completes when it is sent.
 */
export default function PoolReportSheet({ open, order, userId, onClose, onDone }) {
  const [before, setBefore] = useState([]);
  const [after, setAfter] = useState([]);
  const [ph, setPh] = useState('');
  const [chlorine, setChlorine] = useState('');
  const [water, setWater] = useState('jernih');
  const presets = PRESET_TASKS[order?.rate_code] || PRESET_TASKS.S1;
  const [tasks, setTasks] = useState(presets);
  const [extraTasks, setExtraTasks] = useState([]);
  const [extra, setExtra] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const toggleTask = (task) => setTasks((list) => (list.includes(task) ? list.filter((x) => x !== task) : [...list, task]));
  const addExtra = () => {
    const v = extra.trim();
    if (!v) return;
    setExtraTasks((list) => (list.includes(v) ? list : [...list, v].slice(0, 6)));
    setTasks((list) => (list.includes(v) ? list : [...list, v]));
    setExtra('');
  };

  const submit = async (e) => {
    e.preventDefault();
    const phNum = Number(ph.replace(',', '.'));
    const clNum = Number(chlorine.replace(',', '.'));
    if (after.length === 0) { toast.error('Tambahkan minimal 1 foto kolam sesudah dikerjakan'); return; }
    if (ph.trim() === '' || !Number.isFinite(phNum) || phNum < 0 || phNum > 14) { toast.error('Isi pH air (0 sampai 14)'); return; }
    if (chlorine.trim() === '' || !Number.isFinite(clNum) || clNum < 0 || clNum > 20) { toast.error('Isi kadar klorin (0 sampai 20 ppm)'); return; }
    setSending(true);
    try {
      const upload = (f) => uploadPrivateImage(supabase, 'order-photos', userId, f);
      const [photosBefore, photosAfter] = await Promise.all([Promise.all(before.map(upload)), Promise.all(after.map(upload))]);
      await completePoolVisit(supabase, order.id, {
        photosBefore, photosAfter, ph: phNum, chlorine: clNum, waterCondition: water,
        tasks: [...presets, ...extraTasks].filter((x) => tasks.includes(x)), note,
      });
      toast.success('Laporan terkirim. Kunjungan selesai.');
      onDone?.();
    } catch (err) {
      console.error('complete_pool_visit failed:', err);
      toast.error(friendlyError(err) || 'Gagal mengirim laporan');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!sending}
      title="Laporan kunjungan kolam"
      description="Dikirim ke pelanggan dan tersimpan di riwayat pesanan."
      icon={<ClipboardCheck size={22} />}
      footer={<Button type="submit" form="pool-report-form" size="lg" block isLoading={sending}>Kirim laporan &amp; selesai</Button>}
    >
      <form id="pool-report-form" onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <PhotoRow label="Foto sebelum" files={before} onChange={setBefore} idPrefix="b" />
          <PhotoRow label="Foto sesudah" required files={after} onChange={setAfter} idPrefix="a" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MeasureInput id="pool-ph" label="pH" ideal="7,2–7,6" value={ph} onChange={setPh} range={PH_RANGE} step="0.1" />
          <MeasureInput id="pool-cl" label="Klorin (ppm)" ideal="1–3" value={chlorine} onChange={setChlorine} range={CHLORINE_RANGE} step="0.1" />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink">Kondisi air <span className="text-danger">*</span></span>
          <Segmented
            ariaLabel="Kondisi air"
            value={water}
            onChange={setWater}
            className="w-full"
            options={[{ value: 'jernih', label: 'Jernih' }, { value: 'keruh', label: 'Keruh' }, { value: 'hijau', label: 'Hijau' }]}
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-ink">Yang dikerjakan</legend>
          {[...presets, ...extraTasks].map((task) => (
            <label key={task} className="flex min-h-10 items-center gap-3 text-[14px] text-ink">
              <input
                type="checkbox"
                checked={tasks.includes(task)}
                onChange={() => toggleTask(task)}
                className="h-5 w-5 shrink-0 rounded border-line-strong text-brand focus:ring-brand/30"
              />
              {task}
            </label>
          ))}
          <div className="flex gap-2">
            <Input
              aria-label="Tambah pekerjaan lain"
              value={extra}
              maxLength={80}
              onChange={(e) => setExtra(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }}
              placeholder="Pekerjaan lain, mis. ganti lampu"
            />
            <Button type="button" variant="secondary" onClick={addExtra} aria-label="Tambah"><Plus size={18} /></Button>
          </div>
        </fieldset>
        <Field label="Catatan untuk pemilik" htmlFor="pool-note" hint="Mis. lampu mati, pompa berisik, bahan kimia hampir habis.">
          <Textarea id="pool-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}
