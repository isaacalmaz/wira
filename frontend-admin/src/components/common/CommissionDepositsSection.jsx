import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, Coins, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Badge, Button, Card, EmptyState, Field, Input, Money, SectionHeader, Sheet, Spinner, Table, Textarea } from '../ui';

const STATUS = {
  pending: { label: 'Menunggu', tone: 'warning' },
  approved: { label: 'Diterima', tone: 'success' },
  rejected: { label: 'Ditolak', tone: 'danger' },
};

/**
 * Partner commission deposits ("Setor Komisi", migrations/0109): check the
 * transfer, then approve (the amount is added to the partner's balance) or
 * reject with a reason. Also where partners are told to send the money,
 * and the debt limit that stops overdue partners taking new orders.
 */
export default function CommissionDepositsSection() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [approving, setApproving] = useState(null);
  const [proofUrl, setProofUrl] = useState(null);

  // Show the transfer proof inside the confirm sheet (a popup opened after
  // an await is blocked on iPhones).
  useEffect(() => {
    setProofUrl(null);
    if (!approving?.proof_path) return;
    supabase.storage.from('commission-proofs').createSignedUrl(approving.proof_path, 300)
      .then(({ data }) => setProofUrl(data?.signedUrl || null));
  }, [approving]);
  const [reason, setReason] = useState('');
  const [info, setInfo] = useState('');
  const [limit, setLimit] = useState('200000');
  const [grace, setGrace] = useState('7');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    const [{ data, error }, { data: settings }] = await Promise.all([
      supabase
        .from('commission_deposits')
        .select('id, amount, proof_path, note, status, reject_reason, created_at, users!commission_deposits_user_id_fkey(name, phone, payable_balance)')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('app_settings').select('key, value').in('key', ['commission_payment_info', 'commission_debt_limit', 'commission_debt_grace_days']),
    ]);
    if (error) toast.error(`Gagal memuat setoran komisi: ${error.message}`);
    setRows(data || []);
    const get = (k) => settings?.find((r) => r.key === k)?.value;
    if (get('commission_payment_info') != null) setInfo(String(get('commission_payment_info')));
    if (get('commission_debt_limit') != null) setLimit(String(get('commission_debt_limit')));
    if (get('commission_debt_grace_days') != null) setGrace(String(get('commission_debt_grace_days')));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const viewProof = async (path) => {
    const { data, error } = await supabase.storage.from('commission-proofs').createSignedUrl(path, 300);
    if (error) { toast.error(`Bukti tidak bisa dibuka: ${error.message}`); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const review = async (row, approve, why = null) => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_review_commission_deposit', { p_id: row.id, p_approve: approve, p_reason: why });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? 'Setoran diterima, saldo mitra bertambah' : 'Setoran ditolak');
    setRejecting(null);
    setReason('');
    load();
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setBusy(true);
    const writes = [
      ['commission_payment_info', info.trim()],
      ['commission_debt_limit', Number(limit)],
      ['commission_debt_grace_days', Number(grace)],
    ];
    for (const [key, value] of writes) {
      const { error } = await supabase.rpc('admin_set_app_setting', { p_key: key, p_value: value });
      if (error) { setBusy(false); toast.error(error.message); return; }
    }
    setBusy(false);
    setSettingsOpen(false);
    toast.success('Pengaturan setoran komisi disimpan');
  };

  const pending = rows.filter((r) => r.status === 'pending').length;

  return (
    <section>
      <SectionHeader
        title="Setoran Komisi Mitra"
        action={(
          <div className="flex items-center gap-2">
            {pending > 0 && <Badge tone="warning" dot>{pending} menunggu</Badge>}
            <Button size="sm" variant="secondary" onClick={() => setSettingsOpen(true)}>Rekening & batas</Button>
          </div>
        )}
      />
      {loading ? (
        <Card className="flex min-h-[120px] items-center justify-center"><Spinner /></Card>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Coins size={24} />} title="Belum ada setoran komisi." />
      ) : (
        <Table titleCol={1}>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Mitra</th>
              <th className="text-right">Setoran</th>
              <th className="text-right">Saldo sekarang</th>
              <th>Status</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = STATUS[r.status] || STATUS.pending;
              const bal = Number(r.users?.payable_balance) || 0;
              return (
                <tr key={r.id}>
                  <td><span className="whitespace-nowrap font-mono text-[12.5px] text-ink-muted">{new Date(r.created_at).toLocaleString('id-ID')}</span></td>
                  <td>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-ink">{r.users?.name || 'Mitra'}</span>
                      <span className="font-mono text-[12px] text-ink-muted">{r.users?.phone || '-'}</span>
                      {r.note && <span className="text-[12px] text-ink-muted">{r.note}</span>}
                    </div>
                  </td>
                  <td className="text-right"><Money value={r.amount} className="font-medium text-ink" /></td>
                  <td className="text-right">
                    <Money value={Math.abs(bal)} sign={bal < 0 ? 'minus' : undefined} className={bal < 0 ? 'text-danger' : 'text-ink'} />
                  </td>
                  <td>
                    <div className="flex flex-col items-start gap-1">
                      <Badge tone={s.tone} dot>{s.label}</Badge>
                      {r.reject_reason && <span className="text-[12px] text-ink-muted">{r.reject_reason}</span>}
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" leftIcon={<ImageIcon size={15} />} onClick={() => viewProof(r.proof_path)}>Bukti</Button>
                      {r.status === 'pending' && (
                        <>
                          <Button size="sm" variant="secondary" leftIcon={<CheckCircle size={15} />} disabled={busy} onClick={() => setApproving(r)}>
                            Terima
                          </Button>
                          <Button size="sm" variant="danger-soft" leftIcon={<XCircle size={15} />} disabled={busy} onClick={() => setRejecting(r)}>
                            Tolak
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Sheet
        open={Boolean(approving)}
        onClose={() => { if (!busy) setApproving(null); }}
        title="Terima setoran komisi?"
        description="Pastikan uangnya sudah masuk di mutasi QRIS/BCA. Saldo mitra langsung bertambah."
        size="sm"
        footer={approving && (
          <>
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => setApproving(null)}>Batal</Button>
            <Button variant="primary" size="lg" isLoading={busy} onClick={async () => { await review(approving, true); setApproving(null); }}>
              Terima Rp {Number(approving.amount).toLocaleString('id-ID')}
            </Button>
          </>
        )}
      >
        {approving && (() => {
          const before = Number(approving.users?.payable_balance) || 0;
          const after = before + Number(approving.amount);
          const fmt = (n) => `${n < 0 ? '−' : ''}Rp ${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
          return (
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
                <dt className="text-ink-muted">Mitra</dt><dd className="text-right font-semibold text-ink">{approving.users?.name || 'Mitra'}</dd>
                <dt className="text-ink-muted">Saldo sekarang</dt><dd className="text-right font-mono text-ink">{fmt(before)}</dd>
                <dt className="text-ink-muted">Setoran</dt><dd className="text-right font-mono text-success-ink">+{fmt(Number(approving.amount))}</dd>
                <dt className="text-ink-muted">Saldo baru</dt><dd className="text-right font-mono font-semibold text-ink">{fmt(after)}</dd>
                {approving.note && (<><dt className="text-ink-muted">Catatan</dt><dd className="text-right text-ink">{approving.note}</dd></>)}
              </dl>
              {proofUrl ? (
                <a href={proofUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-control border border-line">
                  <img src={proofUrl} alt="Bukti transfer" className="max-h-80 w-full object-contain" />
                </a>
              ) : <div className="flex h-24 items-center justify-center rounded-control border border-line text-[12.5px] text-ink-muted">Memuat bukti…</div>}
            </div>
          );
        })()}
      </Sheet>

      <Sheet
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Tolak setoran"
        size="sm"
        footer={(
          <Button variant="danger" size="lg" isLoading={busy} disabled={!reason.trim()} onClick={() => review(rejecting, false, reason.trim())}>
            Tolak Setoran
          </Button>
        )}
      >
        <Field label="Alasan (dikirim ke mitra)" htmlFor="deposit-reject-reason">
          <Textarea
            id="deposit-reject-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: transfer belum masuk di mutasi"
          />
        </Field>
      </Sheet>

      <Sheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Rekening & batas komisi"
        size="sm"
        footer={(
          <Button type="submit" form="commission-settings" variant="primary" size="lg" isLoading={busy}>Simpan</Button>
        )}
      >
        <form id="commission-settings" onSubmit={saveSettings} className="flex flex-col gap-4">
          <Field label="Tujuan setoran (ditampilkan ke mitra)" htmlFor="commission-info">
            <Textarea
              id="commission-info"
              rows={4}
              value={info}
              onChange={(e) => setInfo(e.target.value)}
              placeholder={'Contoh:\nBCA 1234567890 a.n. Wira\nDANA 0812xxxx'}
              required
            />
          </Field>
          <Field label="Batas utang komisi (Rp)" htmlFor="commission-limit">
            <Input id="commission-limit" type="number" inputMode="numeric" min="10000" value={limit} onChange={(e) => setLimit(e.target.value)} className="font-mono" required />
          </Field>
          <Field label="Masa tenggang (hari)" htmlFor="commission-grace">
            <Input id="commission-grace" type="number" inputMode="numeric" min="0" max="60" value={grace} onChange={(e) => setGrace(e.target.value)} className="font-mono" required />
          </Field>
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            Mitra yang utang komisinya mencapai batas ini lebih lama dari masa tenggang tidak bisa menerima pesanan baru sampai menyetor. Penugasan dari admin tetap bisa.
          </p>
        </form>
      </Sheet>
    </section>
  );
}
