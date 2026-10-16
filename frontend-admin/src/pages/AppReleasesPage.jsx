import { useCallback, useEffect, useRef, useState } from 'react';
import { Smartphone, Upload, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Table, Textarea } from '../components/ui';
import { formatDateTime } from '../utils/datetime';
import TesterSignupsSection from '../components/common/TesterSignupsSection';

const APPS = { user: 'Wira (pelanggan)', mitra: 'Wira Mitra', admin: 'Wira Admin' };
const PLAY_CONSOLE_URL = 'https://play.google.com/console/u/0/developers/6382692752988564582/app-list';
const PLAY_TESTERS_URL = 'https://play.google.com/console/u/0/developers/6382692752988564582/app/4974526613589818292/tracks/4700274319503413459?tab=testers';
const when = (ts) => formatDateTime(ts);

/**
 * Tester & Aplikasi:
 * 1. Android tester sign-ups from wira.one on top, with direct links to the
 *    Play Console "tim wira" tester list.
 * 2. Direct APK upload only for Wira Admin (Wira and Wira Mitra ship via
 *    Google Play Console and receive UI updates automatically via live bundle).
 */
export default function AppReleasesPage() {
  const fileRef = useRef(null);
  const [releases, setReleases] = useState([]);
  const [form, setForm] = useState({ versionName: '', versionCode: '', notes: '', mandatory: false });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('app_releases').select('*, author:users!created_by(name)').order('created_at', { ascending: false });
    if (error) toast.error('Gagal memuat rilis: ' + error.message);
    setReleases(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const lastAdminCode = Math.max(0, ...releases.filter((r) => r.app === 'admin').map((r) => r.version_code));
  useEffect(() => {
    setForm((f) => ({ ...f, versionCode: String(lastAdminCode + 1) }));
  }, [lastAdminCode]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const publish = async () => {
    if (!file) { toast.error('Pilih file APK'); return; }
    if (!form.versionName.trim()) { toast.error('Isi nama versi, mis. 1.4'); return; }
    setBusy(true);
    try {
      const path = `admin/wira-admin-${form.versionName.trim()}-${form.versionCode}.apk`;
      const { error: upErr } = await supabase.storage.from('apk').upload(path, file, {
        contentType: 'application/vnd.android.package-archive', upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('apk').getPublicUrl(path);
      const { error } = await supabase.rpc('admin_publish_release', {
        p_app: 'admin', p_version_name: form.versionName.trim(), p_version_code: Number(form.versionCode),
        p_download_url: pub.publicUrl, p_notes: form.notes.trim() || null, p_mandatory: form.mandatory,
        p_file_size: file.size, p_announce: false,
      });
      if (error) throw error;
      toast.success(`Wira Admin ${form.versionName} diterbitkan`);
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
        title="Tester & Aplikasi"
        subtitle="Kelola pendaftar tester Google Play (Wira & Wira Mitra) serta rilis APK internal untuk Wira Admin."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <a href={PLAY_TESTERS_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-ink hover:underline">
              Daftar Tester Play Console <ExternalLink size={14} />
            </a>
            <a href={PLAY_CONSOLE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink hover:underline">
              Semua Aplikasi Play <ExternalLink size={14} />
            </a>
          </div>
        }
      />

      <TesterSignupsSection />

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[17px] font-bold tracking-tight text-ink">Unggah APK Wira Admin</h2>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Aplikasi pelanggan (<b>Wira</b>) dan <b>Wira Mitra</b> dirilis melalui{' '}
            <a href={PLAY_CONSOLE_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink hover:underline">Google Play Console</a>{' '}
            dan menerima pembaruan layar secara otomatis (live update). Unggah APK di sini hanya untuk aplikasi internal <b>Wira Admin</b>.
          </p>
        </div>

        <Card className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama versi Wira Admin" htmlFor="rel-name" required hint="versionName di build.gradle">
              <Input id="rel-name" value={form.versionName} onChange={set('versionName')} placeholder="1.4" className="font-mono" />
            </Field>
            <Field label="Nomor build" htmlFor="rel-code" required hint={`versionCode; terakhir ${lastAdminCode || '—'}`}>
              <Input id="rel-code" type="number" min="1" value={form.versionCode} onChange={set('versionCode')} className="font-mono" />
            </Field>
          </div>
          <Field label="File APK Wira Admin" htmlFor="rel-file" required>
            <input id="rel-file" ref={fileRef} type="file" accept=".apk,application/vnd.android.package-archive"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-[13px] text-ink file:mr-3 file:min-h-10 file:rounded-control file:border-0 file:bg-sunken file:px-4 file:font-semibold file:text-ink" />
          </Field>
          <Field label="Catatan perubahan" htmlFor="rel-notes">
            <Textarea id="rel-notes" rows={2} maxLength={500} value={form.notes} onChange={set('notes')} placeholder="Perbaikan tampilan dashboard, peningkatan stabilitas" />
          </Field>
          <label className="flex items-start gap-2.5 text-[13.5px] text-ink">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={form.mandatory} onChange={set('mandatory')} />
            <span><span className="font-semibold">Wajib update</span>: versi lama tidak bisa dipakai sebelum memasang versi ini.</span>
          </label>
          <Notice tone="info">Pastikan nomor build (versionCode) di APK Wira Admin sama dengan isian di atas agar aplikasi tidak terus meminta update.</Notice>
          <Button className="self-start" leftIcon={<Upload size={16} />} isLoading={busy} onClick={publish}>Unggah & terbitkan APK Admin</Button>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-bold text-ink">Riwayat rilis APK</h2>
        <Table>
          <thead>
            <tr><th>Aplikasi</th><th>Versi</th><th>Diterbitkan</th><th>Catatan</th><th className="text-right">File</th></tr>
          </thead>
          <tbody>
            {releases.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Smartphone size={14} />{APPS[r.app] || r.app}</span></td>
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
    </div>
  );
}
