import { useCallback, useEffect, useState } from 'react';
import { Percent, Save, History } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { Button, Card, EmptyState, Field, Input, Notice, PageHeader, SectionHeader, Sheet, Spinner, Table, Textarea } from '../components/ui';

const pct = (rate) => `${(Math.round(Number(rate) * 10000) / 100).toLocaleString('id-ID')}%`;
const toInput = (rate) => String(Math.round(Number(rate) * 10000) / 100);

/**
 * Wira's cut per service (commission_rates, migrations/0099). A new rate
 * applies to orders that complete after it is saved and to projects
 * awarded after it is saved; earlier orders and projects keep the rate
 * they were charged. Every change is logged with who, when and why.
 */
export default function CommissionPage() {
  const [rates, setRates] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // { row, percent }
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, h] = await Promise.all([
      supabase.from('commission_rates').select('*').order('sort_order'),
      supabase.from('commission_rate_changes').select('*, user:changed_by(name)').order('changed_at', { ascending: false }).limit(50),
    ]);
    if (r.error) toast.error('Gagal memuat komisi: ' + r.error.message);
    setRates(r.data || []);
    setDrafts(Object.fromEntries((r.data || []).map((x) => [x.service_type, toInput(x.rate)])));
    setHistory(h.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const labelOf = (service) => rates.find((x) => x.service_type === service)?.label || service;

  const ask = (row) => {
    const value = Number(String(drafts[row.service_type]).replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > 50) {
      toast.error('Isi persentase 0 sampai 50');
      return;
    }
    if (Math.round(value * 100) === Math.round(Number(row.rate) * 10000)) {
      toast('Persentase tidak berubah');
      return;
    }
    setNote('');
    setConfirm({ row, percent: Math.round(value * 100) / 100 });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('admin_set_commission_rate', {
      p_service_type: confirm.row.service_type,
      p_rate_percent: confirm.percent,
      p_note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Komisi ${confirm.row.label} sekarang ${confirm.percent.toLocaleString('id-ID')}%`);
    setConfirm(null);
    load();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="!mb-0"
        title="Komisi Platform"
        subtitle="Persentase yang dipotong Wira dari tiap layanan. Mitra menerima sisanya."
      />

      <Notice tone="info" title="Kapan berlaku">
        Persentase baru dipakai untuk pesanan yang selesai setelah disimpan dan proyek yang diterima setelah disimpan.
        Pesanan dan proyek sebelumnya tetap memakai persentase lamanya. Bahan dan suku cadang teknisi tidak pernah dipotong.
      </Notice>

      {loading ? (
        <div className="flex justify-center py-12 text-brand-ink" role="status"><Spinner size={24} /></div>
      ) : (
        <Card padding="none" className="divide-y divide-line overflow-hidden">
          {rates.map((row) => {
            const draft = drafts[row.service_type] ?? '';
            const changed = draft !== toInput(row.rate);
            const keep = 100 - Number(String(draft).replace(',', '.'));
            return (
              <div key={row.service_type} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4">
                <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                  <p className="text-[15px] font-bold text-ink">{row.label}</p>
                  <p className="text-[13px] text-ink-muted">{row.description}</p>
                  <p className="text-[12px] text-ink-muted">
                    Sekarang <span className="font-mono font-medium text-ink">{pct(row.rate)}</span>
                    {' · '}mitra menerima <span className="font-mono">{pct(1 - Number(row.rate))}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-28">
                    <Input
                      id={`rate-${row.service_type}`}
                      aria-label={`Komisi ${row.label} dalam persen`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="50"
                      step="0.5"
                      value={draft}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.service_type]: e.target.value }))}
                      className="pr-8 text-right font-mono"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-muted">%</span>
                  </div>
                  <Button variant={changed ? 'primary' : 'secondary'} leftIcon={<Save size={16} />} disabled={!changed} onClick={() => ask(row)}>
                    Simpan
                  </Button>
                </div>
                {changed && Number.isFinite(keep) && (
                  <p className="w-full text-[12px] text-ink-muted">Setelah disimpan, mitra menerima <span className="font-mono text-ink">{keep.toLocaleString('id-ID')}%</span>.</p>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Riwayat perubahan" className="mb-0" />
        {history.length === 0 ? (
          <EmptyState icon={<History size={22} />} title="Belum ada perubahan" description="Setiap perubahan persentase tercatat di sini." />
        ) : (
          <Table titleCol={1}>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Layanan</th>
                <th className="text-right">Dari</th>
                <th className="text-right">Ke</th>
                <th>Oleh</th>
                <th>Alasan</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap font-mono text-[12.5px]">{new Date(h.changed_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="whitespace-nowrap">{labelOf(h.service_type)}</td>
                  <td className="text-right font-mono">{h.old_rate != null ? pct(h.old_rate) : '—'}</td>
                  <td className="text-right font-mono font-medium">{pct(h.new_rate)}</td>
                  <td className="whitespace-nowrap">{h.user?.name || '—'}</td>
                  <td className="text-ink-muted">{h.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <Sheet
        open={!!confirm}
        onClose={() => { if (!saving) setConfirm(null); }}
        dismissible={!saving}
        size="sm"
        icon={<Percent size={22} />}
        title={confirm ? `Ubah komisi ${confirm.row.label}?` : ''}
        description={confirm ? `${pct(confirm.row.rate)} → ${confirm.percent.toLocaleString('id-ID')}%. Mitra menerima ${(100 - confirm.percent).toLocaleString('id-ID')}% untuk pesanan yang selesai setelah ini.` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={saving}>Batal</Button>
            <Button onClick={save} isLoading={saving}>Simpan</Button>
          </>
        )}
      >
        <Field label="Alasan (dicatat di riwayat)" htmlFor="commission-note">
          <Textarea id="commission-note" rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: Promo mitra villa baru, Oktober 2026" />
        </Field>
      </Sheet>
    </div>
  );
}
