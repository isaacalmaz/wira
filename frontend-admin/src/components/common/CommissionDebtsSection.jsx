import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MessageCircle, Scale } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Badge, Card, EmptyState, Money, SectionHeader, Spinner, Table } from '../ui';

const ROLE_LABEL = { driver: 'Driver', merchant: 'Restoran', villa: 'Villa', technician: 'Teknisi', nanny: 'Pengasuh' };

const waUrl = (phone, text) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith('0') ? `62${digits.slice(1)}` : digits}?text=${encodeURIComponent(text)}`;
};

const rupiah = (n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

/**
 * Who owes Wira commission (payable_balance < 0, migrations/0075/0109),
 * for how long, and who is already blocked from new orders. Each row has a
 * ready-made WhatsApp reminder.
 */
export default function CommissionDebtsSection() {
  const [rows, setRows] = useState(null);
  const [limit, setLimit] = useState(200000);
  const [grace, setGrace] = useState(7);

  useEffect(() => {
    (async () => {
      const [{ data, error }, { data: settings }] = await Promise.all([
        supabase
          .from('users')
          .select('id, name, phone, payable_balance, commission_debt_since, commission_billed_at, mitra_access')
          .lt('payable_balance', 0)
          .order('payable_balance', { ascending: true })
          .limit(200),
        supabase.from('app_settings').select('key, value').in('key', ['commission_debt_limit', 'commission_debt_grace_days']),
      ]);
      if (error) toast.error(`Gagal memuat utang komisi: ${error.message}`);
      const get = (k) => settings?.find((r) => r.key === k)?.value;
      if (Number(get('commission_debt_limit')) > 0) setLimit(Number(get('commission_debt_limit')));
      if (get('commission_debt_grace_days') != null) setGrace(Number(get('commission_debt_grace_days')));
      setRows(data || []);
    })();
  }, []);

  const now = Date.now();
  const list = (rows || []).map((u) => {
    const debt = -Number(u.payable_balance || 0);
    const days = u.commission_debt_since ? Math.floor((now - new Date(u.commission_debt_since).getTime()) / 86400000) : 0;
    return { ...u, debt, days, blocked: debt >= limit && days > grace };
  });
  const total = list.reduce((s, u) => s + u.debt, 0);
  const blockedCount = list.filter((u) => u.blocked).length;

  return (
    <section>
      <SectionHeader
        title="Utang Komisi Mitra"
        action={list.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Total {rupiah(total)}</Badge>
            {blockedCount > 0 && <Badge tone="danger" dot>{blockedCount} terblokir</Badge>}
          </div>
        ) : null}
      />
      {rows === null ? (
        <Card className="flex min-h-[120px] items-center justify-center"><Spinner /></Card>
      ) : list.length === 0 ? (
        <EmptyState icon={<Scale size={24} />} title="Tidak ada mitra yang berutang komisi." />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Mitra</th>
              <th>Peran</th>
              <th className="text-right">Utang</th>
              <th className="text-right">Sejak</th>
              <th>Status</th>
              <th className="text-right">Tagih</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const roles = Array.isArray(u.mitra_access) ? u.mitra_access.map((r) => ROLE_LABEL[r] || r).join(', ') : '-';
              const text = `Halo ${u.name || ''}, komisi Wira Anda saat ini ${rupiah(u.debt)}. Mohon disetor lewat aplikasi Wira Mitra: Pendapatan -> Setor Komisi. Terima kasih!`;
              const href = waUrl(u.phone, text);
              return (
                <tr key={u.id}>
                  <td>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-ink">{u.name || 'Mitra'}</span>
                      <span className="font-mono text-[12px] text-ink-muted">{u.phone || '-'}</span>
                    </div>
                  </td>
                  <td className="text-[13px] text-ink-muted">{roles || '-'}</td>
                  <td className="text-right"><Money value={u.debt} className="font-medium text-danger" /></td>
                  <td className="text-right font-mono text-[12.5px] text-ink-muted">{u.commission_debt_since ? `${u.days} hari` : '-'}</td>
                  <td>
                    {u.blocked
                      ? <Badge tone="danger" dot>Terblokir</Badge>
                      : u.debt >= limit
                        ? <Badge tone="warning" dot>Lewat batas</Badge>
                        : <Badge tone="neutral">Normal</Badge>}
                  </td>
                  <td className="text-right">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-3 text-[13px] font-semibold text-brand-ink hover:bg-brand-soft"
                      >
                        <MessageCircle size={15} aria-hidden="true" /> WhatsApp
                      </a>
                    ) : <span className="text-[12px] text-ink-muted">Tanpa nomor</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </section>
  );
}
