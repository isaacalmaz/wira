import { useCallback, useEffect, useRef, useState } from 'react';
import { Smartphone, Upload, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select, Table, Textarea } from '../components/ui';
import { formatDateTime } from '../utils/datetime';
import TesterSignupsSection from '../components/common/TesterSignupsSection';

const APPS = { user: 'Wira (pelanggan)', mitra: 'Wira Mitra', admin: 'Wira Admin' };
const when = (ts) => formatDateTime(ts);

/**
 * Publishing a new Android APK (app_releases + bucket "apk", migrations/0105).
 * Screen changes reach the apps by themselves (live update); an APK is only
 * needed when native parts change. Apps older than the latest release show
 * "Versi baru tersedia" on launch; "wajib" blocks them until updated.
 */
export default function AppReleasesPage() {
  const fileRef = useRef(null);
  const [releases, setReleases] = useState([]);
  const [form, setForm] = useState({ app: 'user', versionName: '', versionCode: '', notes: '', mandatory: false, announce: true });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('app_releases').select('*, author:users!created_by(name)').order('created_at', { ascending: false });
    if (error) toast.error('Gagal memuat rilis: ' + error.message);
    setReleases(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const lastCode = (app) => Math.max(0, ...releases.filter((r) => r.app === app).map((r) => r.version_code));
  useEffect(() => {
    setForm((f) => ({ ...f, versionCode: String(lastCode(f.app) + 1) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.app, releases]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const publish = async () => {
    if (!file) { toast.error('Pilih file APK'); return; }
    if (!form.versionName.trim()) { toast.error('Isi nama versi, mis. 1.2'); return; }
    setBusy(true);
    try {
      const path = `${form.app}/wira-${form.app}-${form.versionName.trim()}-${form.versionCode}.apk`;
      const { error: upErr } = await supabase.storage.from('apk').upload(path, file, {
        contentType: 'application/vnd.android.package-archive', upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('apk').getPublicUrl(path);
      const { error } = await supabase.rpc('admin_publish_release', {
        p_app: form.app, p_version_name: form.versionName.trim(), p_version_code: Number(form.versionCode),
        p_download_url: pub.publicUrl, p_notes: form.notes.trim() || null, p_mandatory: form.mandatory,
        p_file_size: file.size, p_announce: form.announce && form.app !== 'admin',
      });
      if (error) throw error;
      toast.success(`${APPS[form.app]} ${form.versionName} diterbitkan`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setForm((f) => ({ ...f, versionName: '', notes: '', mandatory: false }));
      load();
    } catch (err) {
      toast.error(err.message || 'Gagal menerbitkan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="!mb-0"
        title="Rilis aplikasi"
        subtitle="Terbitkan APK Android baru. Perubahan tampilan sampai ke aplikasi sendiri; APK baru hanya perlu bila bagian sistem Android berubah."
        actions={<a href="https://wira.one/install" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-ink hover:underline">wira.one/install <ExternalLink size={14} /></a>}
      />

      <Card className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Aplikasi" htmlFor="rel-app" required>
            <Select id="rel-app" value={form.app} onChange={set('app')}>
              {Object.entries(APPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Nama versi" htmlFor="rel-name" required hint="versionName di build.gradle">
            <Input id="rel-name" value={form.versionName} onChange={set('versionName')} placeholder="1.2" className="font-mono" />
          </Field>
          <Field label="Nomor build" htmlFor="rel-code" required hint={`versionCode; terakhir ${lastCode(form.app) || '—'}`}>
            <Input id="rel-code" type="number" min="1" value={form.versionCode} onChange={set('versionCode')} className="font-mono" />
          </Field>
        </div>
        <Field label="File APK" htmlFor="rel-file" required>
          <input id="rel-file" ref={fileRef} type="file" accept=".apk,application/vnd.android.package-archive"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-[13px] text-ink file:mr-3 file:min-h-10 file:rounded-control file:border-0 file:bg-sunken file:px-4 file:font-semibold file:text-ink" />
        </Field>
        <Field label="Yang baru (tampil di aplikasi dan halaman unduhan)" htmlFor="rel-notes">
          <Textarea id="rel-notes" rows={3} maxLength={500} value={form.notes} onChange={set('notes')} placeholder="Kalender villa, notifikasi lebih cepat, perbaikan login" />
        </Field>
        <label className="flex items-start gap-2.5 text-[13.5px] text-ink">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={form.mandatory} onChange={set('mandatory')} />
          <span><span className="font-semibold">Wajib update</span>: versi lama tidak bisa dipakai sebelum memasang versi ini. Pakai hanya untuk perbaikan penting.</span>
        </label>
        {form.app !== 'admin' && (
          <label className="flex items-start gap-2.5 text-[13.5px] text-ink">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={form.announce} onChange={set('announce')} />
            <span>Kirim pengumuman ke semua {form.app === 'user' ? 'pelanggan' : 'mitra'} (notifikasi + push, menghitung batas 5 pengumuman per jam)</span>
          </label>
        )}
        <Notice tone="info">Sebelum menerbitkan, pastikan nomor build di APK (versionCode) sama dengan isian di atas, supaya aplikasi tidak terus meminta update.</Notice>
        <Button className="self-start" leftIcon={<Upload size={16} />} isLoading={busy} onClick={publish}>Unggah & terbitkan</Button>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-bold text-ink">Riwayat rilis</h2>
        <Table>
          <thead>
            <tr><th>Aplikasi</th><th>Versi</th><th>Diterbitkan</th><th>Catatan</th><th className="text-right">File</th></tr>
          </thead>
          <tbody>
            {releases.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Smartphone size={14} />{APPS[r.app]}</span></td>
                <td className="whitespace-nowrap font-mono">
                  {r.version_name} <span className="text-ink-muted">({r.version_code})</span>
                  {r.mandatory && <Badge tone="warning" className="ml-1.5">Wajib</Badge>}
                </td>
                <td className="whitespace-nowrap text-[12.5px] text-ink-muted">{when(r.created_at)}{r.author?.name ? ` · ${r.author.name}` : ''}</td>
                <td className="max-w-xs text-[13px] text-ink-muted">{r.notes || '—'}</td>
                <td className="text-right"><a href={r.download_url} className="text-[13px] font-semibold text-brand-ink hover:underline">Unduh</a></td>
              </tr>
            ))}
            {releases.length === 0 && <tr><td colSpan="5" className="py-8 text-center text-ink-muted">Belum ada rilis.</td></tr>}
          </tbody>
        </Table>
      </section>

      <TesterSignupsSection />
    </div>
  );
}
