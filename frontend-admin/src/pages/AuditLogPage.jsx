import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Spinner } from '../components/ui';

// Readable names for admin_audit_log.action (migrations/0101, 0102).
const ACTIONS = {
  application_approved: 'Pendaftaran disetujui', application_rejected: 'Pendaftaran ditolak',
  user_suspended: 'Akun ditangguhkan', user_reactivated: 'Akun diaktifkan lagi',
  access_granted: 'Akses mitra dibuka', access_revoked: 'Akses mitra dicabut',
  merchant_suspended: 'Tempat dinonaktifkan', merchant_reactivated: 'Tempat diaktifkan lagi',
  listing_approved: 'Properti villa disetujui', listing_rejected: 'Properti villa ditolak',
  technician_verified: 'Teknisi diverifikasi', technician_unverified: 'Verifikasi teknisi dicabut',
  payout_approved: 'Pencairan dikirim', payout_rejected: 'Pencairan ditolak',
  topup_approved: 'Top-up disetujui', topup_rejected: 'Top-up ditolak', wallet_corrected: 'Koreksi saldo',
  review_hidden: 'Ulasan disembunyikan', review_shown: 'Ulasan ditampilkan lagi',
  dispute_paid_partner: 'Keberatan proyek: dana ke teknisi', dispute_refunded_customer: 'Keberatan proyek: dana ke pelanggan',
  order_cancel: 'Pesanan dibatalkan', order_complete: 'Pesanan diselesaikan', order_reassign: 'Mitra pesanan diganti',
  order_compensate: 'Kompensasi pesanan', order_note: 'Catatan pesanan',
  commission_changed: 'Komisi diubah', staff_role_changed: 'Peran staf diubah',
  ticket_in_progress: 'Tiket diproses', ticket_resolved: 'Tiket selesai', ticket_open: 'Tiket dibuka lagi',
};
const TABLE_LABEL = { pricing_rules: 'Harga', vehicles: 'Kendaraan', promos: 'Promo', feature_flags: 'Pengaturan aplikasi' };
const OP_LABEL = { insert: 'ditambah', update: 'diubah', delete: 'dihapus' };
const GROUPS = {
  all: { label: 'Semua', match: () => true },
  partners: { label: 'Mitra', match: (a) => /^(application|user_|access|merchant_|listing|technician)/.test(a) },
  money: { label: 'Uang', match: (a) => /^(payout|topup|wallet|order_compensate|commission|dispute)/.test(a) },
  orders: { label: 'Pesanan', match: (a) => a.startsWith('order_') },
  config: { label: 'Harga & pengaturan', match: (a) => /^(pricing_rules|vehicles|promos|feature_flags|commission)/.test(a) },
  staff: { label: 'Staf', match: (a) => a.startsWith('staff') },
  cs: { label: 'Ulasan & tiket', match: (a) => /^(review|ticket)/.test(a) },
};

const label = (a) => {
  if (ACTIONS[a]) return ACTIONS[a];
  const m = a.match(/^(pricing_rules|vehicles|promos|feature_flags)_(insert|update|delete)$/);
  return m ? `${TABLE_LABEL[m[1]]} ${OP_LABEL[m[2]]}` : a;
};
const when = (ts) => new Date(ts).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmt = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

// One-line summary of the extra data each action carries.
function details(row) {
  const d = row.data || {};
  if (d.changes && row.action.endsWith('_update')) {
    return Object.entries(d.changes).slice(0, 4).map(([k, [from, to]]) => `${k}: ${fmt(from)} → ${fmt(to)}`).join(' · ');
  }
  if (row.action === 'commission_changed') return `${row.target_id}: ${Math.round(d.from * 1000) / 10}% → ${Math.round(d.to * 1000) / 10}%`;
  if (row.action === 'staff_role_changed') return `${d.email}: ${d.from} → ${d.to}`;
  const parts = [];
  if (d.label) parts.push(d.label);
  if (d.name) parts.push(d.name);
  if (d.role) parts.push(d.role);
  if (d.kind) parts.push(d.kind);
  if (d.stage) parts.push(d.stage);
  if (d.amount !== undefined) parts.push(`Rp ${Math.round(Number(d.amount)).toLocaleString('id-ID')}`);
  if (d.method) parts.push(d.method);
  return parts.join(' · ');
}

/**
 * Everything admins decided, newest first (admin_audit_log). Who did it,
 * to whom, why, and what changed.
 */
export default function AuditLogPage() {
  const [rows, setRows] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState('all');
  const [actor, setActor] = useState('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(200);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_audit_log')
      .select('*, actor:users!actor_id(name)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) toast.error('Gagal memuat log: ' + error.message);
    const list = data || [];
    setRows(list);
    const ids = [...new Set(list.map((r) => r.subject_user_id).filter(Boolean))];
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, name').in('id', ids);
      setNames(Object.fromEntries((us || []).map((u) => [u.id, u.name])));
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  const actors = useMemo(() => [...new Map(rows.filter((r) => r.actor_id).map((r) => [r.actor_id, r.actor?.name || r.actor_id.slice(0, 8)])).entries()], [rows]);
  const term = q.trim().toLowerCase();
  const filtered = rows.filter((r) => GROUPS[group].match(r.action)
    && (actor === 'all' || r.actor_id === actor)
    && (!term || [label(r.action), r.note, details(r), names[r.subject_user_id], r.actor?.name].some((v) => v && String(v).toLowerCase().includes(term))));

  const targetLink = (r) => {
    if (r.target_type === 'order') return `/orders?id=${r.target_id}`;
    if (r.subject_user_id) return `/partners/${r.subject_user_id}`;
    return null;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="!mb-0"
        title="Log aktivitas admin"
        subtitle="Setiap keputusan admin: siapa, kapan, kepada siapa, dan alasannya."
        actions={(
          <Button variant="secondary" onClick={load} aria-label="Muat ulang" className="px-3">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </Button>
        )}
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-xs">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input aria-label="Cari di log" placeholder="Cari nama, alasan, nominal..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-10 !text-sm" />
        </div>
        <Select aria-label="Jenis" value={group} onChange={(e) => setGroup(e.target.value)} className="!text-sm md:w-52">
          {Object.entries(GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}
        </Select>
        <Select aria-label="Pelaku" value={actor} onChange={(e) => setActor(e.target.value)} className="!text-sm md:w-48">
          <option value="all">Semua admin</option>
          {actors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
        <p className="text-[13px] text-ink-muted md:ml-auto"><span className="font-mono text-ink">{filtered.length}</span> catatan</p>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-12 text-brand" role="status"><Spinner size={22} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<History size={22} />} title="Belum ada catatan" description="Keputusan admin tercatat sejak pembaruan Oktober 2026." />
      ) : (
        <Card padding="none" className="divide-y divide-line">
          {filtered.map((r) => {
            const link = targetLink(r);
            const who = names[r.subject_user_id];
            const extra = details(r);
            return (
              <div key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                <span className="w-36 shrink-0 font-mono text-[12px] text-ink-muted">{when(r.created_at)}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-[13.5px] text-ink">
                    <span className="font-semibold">{label(r.action)}</span>
                    {who && <> · {link ? <Link to={link} className="hover:underline">{who}</Link> : who}</>}
                    {!who && link && <> · <Link to={link} className="font-mono text-[12.5px] hover:underline">{r.target_id.slice(0, 8)}</Link></>}
                  </p>
                  {extra && <p className="break-words text-[12.5px] text-ink-muted">{extra}</p>}
                  {r.note && <p className="text-[13px] text-ink">“{r.note}”</p>}
                </div>
                <Badge tone="neutral" className="self-start">{r.actor?.name || 'Sistem'}</Badge>
              </div>
            );
          })}
        </Card>
      )}
      {rows.length >= limit && (
        <Button variant="secondary" className="self-center" onClick={() => setLimit((l) => l + 300)}>Muat lebih banyak</Button>
      )}
    </div>
  );
}
