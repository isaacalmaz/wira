import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Users, Inbox, Star } from 'lucide-react';
import { fetchPartnerList, KIND_META, debtState } from '../services/peopleAdminService';
import { fetchPendingApplications } from '../services/mitraApplicationService';
import { Badge, Card, EmptyState, Money, PageHeader, Segmented, Spinner, Table } from '../components/ui';

const SUBTITLE = {
  driver: 'Ojek, mobil, kirim barang, dan antar makanan. Klik nama untuk Profil Akun.',
  nanny: 'Pengasuh WiraAsuh. Akses Pengasuh diberikan dari Profil Akun (tidak lewat pendaftaran umum).',
  technician: 'Teknisi jasa servis dan kolam.',
};

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';


/**
 * Active partners of one kind (admin_partner_list, migrations/0122): rating,
 * orders and earnings over 30 days, commission owed and its state.
 * New partners come in through Pendaftaran, never from here.
 */
export default function PartnersPage({ kind }) {
  const navigate = useNavigate();
  const meta = KIND_META[kind];
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setRows(null);
    fetchPartnerList(kind).then(setRows).catch((err) => { toast.error(`Gagal memuat ${meta.label}: ${err.message}`); setRows([]); });
    if (kind !== 'nanny') {
      fetchPendingApplications(kind === 'driver' ? ['driver', 'courier'] : [kind], 'id').then((l) => setPending(l.length)).catch(() => {});
    }
  }, [kind, meta.label]);

  const counts = useMemo(() => {
    const list = rows || [];
    return {
      online: list.filter((p) => p.online && p.status === 'Aktif').length,
      debt: list.filter((p) => ['warning', 'danger'].includes(debtState(p).tone) && p.status === 'Aktif').length,
      suspended: list.filter((p) => p.status !== 'Aktif').length,
    };
  }, [rows]);

  const shown = (rows || []).filter((p) => {
    if (filter === 'online') return p.online && p.status === 'Aktif';
    if (filter === 'debt') return p.status === 'Aktif' && ['warning', 'danger'].includes(debtState(p).tone);
    if (filter === 'suspended') return p.status !== 'Aktif';
    return true;
  });

  const options = [
    { value: 'all', label: `Semua ${rows ? rows.length : ''}`.trim() },
    ...(kind === 'driver' ? [{ value: 'online', label: `Online ${counts.online}` }] : []),
    { value: 'debt', label: `Komisi perlu ditagih ${counts.debt}` },
    { value: 'suspended', label: `Ditangguhkan ${counts.suspended}` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader className="!mb-0" title={meta.label} subtitle={SUBTITLE[kind]} />

      {pending > 0 && (
        <Link to="/applications" className="flex items-center gap-3 rounded-card border border-warning-line bg-warning-soft px-4 py-3 text-[13.5px] font-semibold text-warning-ink">
          <Inbox size={18} aria-hidden="true" /> {pending} pendaftar {meta.label} menunggu di Pendaftaran
        </Link>
      )}

      <Segmented scroll ariaLabel="Filter" value={filter} onChange={setFilter} options={options} />

      {rows === null ? (
        <Card className="flex min-h-[140px] items-center justify-center"><Spinner /></Card>
      ) : shown.length === 0 ? (
        <EmptyState icon={<Users size={24} />} title={rows.length ? 'Tidak ada yang cocok dengan filter ini' : `Belum ada ${meta.label} aktif`} />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <th>Mitra</th>
                <th>30 hari</th>
                <th className="text-right">Komisi belum disetor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const st = debtState(p);
                const sub = kind === 'driver'
                  ? [p.vehicle_type === 'mobil' ? 'Mobil' : p.vehicle_type === 'motor' ? 'Motor' : null, p.vehicle_plate].filter(Boolean).join(' · ')
                  : p.phone;
                return (
                  <tr key={p.id} className="cursor-pointer hover:bg-sunken" onClick={() => navigate(`/accounts/${p.id}`)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft text-[12.5px] font-bold text-brand-ink">
                          {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(p.name)}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <Link to={`/accounts/${p.id}`} onClick={(e) => e.stopPropagation()} className="truncate font-semibold text-ink hover:underline">{p.name || 'Tanpa nama'}</Link>
                          <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                            {sub}
                            {p.rating_count > 0 && <span className="inline-flex items-center gap-0.5"><Star size={11} className="fill-current" aria-hidden="true" />{Number(p.rating_avg).toFixed(1)} ({p.rating_count})</span>}
                            {kind === 'technician' && p.verified && <Badge tone="success">Terverifikasi</Badge>}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-[13px] text-ink-muted">
                      <span className="font-mono text-ink">{p.orders_30d}</span> order · <Money value={Math.round(Number(p.income_30d) || 0)} className="text-ink" />
                    </td>
                    <td className="text-right">
                      <Money value={Math.round(Number(p.commission_owed) || 0)} className={st.tone === 'warning' ? 'text-warning-ink' : st.tone === 'danger' && p.order_locked ? 'text-danger-ink' : 'text-ink'} />
                    </td>
                    <td><Badge tone={st.tone} dot>{st.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
