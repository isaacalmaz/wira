import { useCallback, useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { Badge, Button, Table } from '../ui';
import { formatDateTime } from '../../utils/datetime';

const PLAY_TESTERS_URL = 'https://play.google.com/console/u/0/developers/6382692752988564582/app/4974526613589818292/tracks/4700274319503413459?tab=testers';

/**
 * Gmail addresses left on the wira.one landing page ("Unduh aplikasi" >
 * Android, migrations/0118). Copy the new ones into the Play Console email
 * list "tim wira" (shared by both apps), then tick them here.
 */
export default function TesterSignupsSection() {
  const [rows, setRows] = useState([]);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('tester_signups').select('*').order('created_at', { ascending: false }).limit(500);
    setLoadError(Boolean(error));
    setRows(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = rows.filter((r) => !r.added);

  const copyPending = async () => {
    const text = pending.map((r) => r.email).join(', ');
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${pending.length} email disalin`);
    } catch {
      toast.error('Tidak bisa menyalin otomatis. Salin dari tabel.');
    }
  };

  const toggle = async (row) => {
    const { data, error } = await supabase.from('tester_signups').update({ added: !row.added }).eq('id', row.id).select();
    if (error || !data?.length) {
      toast.error('Gagal menyimpan');
      return;
    }
    setRows((list) => list.map((r) => (r.id === row.id ? data[0] : r)));
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-[17px] font-bold tracking-tight text-ink">Pendaftar tester Android</h2>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Dari tombol "Unduh aplikasi" di wira.one. Tambahkan ke daftar <b>tim wira</b> di{' '}
            <a href={PLAY_TESTERS_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink hover:underline">Play Console</a>, lalu centang.
          </p>
        </div>
        <Button variant="secondary" size="sm" leftIcon={<Copy size={15} />} onClick={copyPending} disabled={pending.length === 0}>
          Salin {pending.length} email baru
        </Button>
      </div>
      {loadError ? (
        <p className="text-[13px] text-danger-ink">Daftar belum bisa dimuat. Pastikan migrasi 0118 sudah dijalankan.</p>
      ) : (
        <Table titleCol={0}>
          <thead><tr><th>Email</th><th>Masuk</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="break-all font-mono text-[13px]">{r.email}</td>
                <td className="whitespace-nowrap text-[12.5px] text-ink-muted">{formatDateTime(r.created_at)}</td>
                <td>
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={r.added} onChange={() => toggle(r)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                    {r.added ? <Badge tone="success">Sudah ditambahkan</Badge> : <Badge tone="warning">Belum</Badge>}
                  </label>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="3" className="py-8 text-center text-ink-muted">Belum ada pendaftar.</td></tr>}
          </tbody>
        </Table>
      )}
    </section>
  );
}
