import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Phone, Mail, Ban, CheckCircle2, Star, Store, Home, Wrench, Car, ShieldOff, Power, History, FileImage } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { CORE_ADMIN_ROLES } from '../config/roles';
import { orderStatusLabel } from '../config/orderStatus';
import { Badge, Button, Card, EmptyState, Money, Notice, PageHeader, SectionHeader, Spinner, Stat, Table } from '../components/ui';
import ReasonSheet from '../components/common/ReasonSheet';
import { setUserBlocked, setPartnerAccess, setMerchantActive, KIND_LABEL } from '../services/partnerAdminService';

const KIND_ICON = { driver: Car, merchant: Store, villa: Home, technician: Wrench };
const SERVICE_LABEL = { ride: 'WiraRide', send: 'WiraSend', food: 'WiraFood', villa: 'WiraVilla', service: 'WiraService', pool: 'WiraPool' };
const AUDIT_LABEL = {
  application_approved: 'Pendaftaran disetujui', application_rejected: 'Pendaftaran ditolak',
  user_suspended: 'Akun ditangguhkan', user_reactivated: 'Akun diaktifkan lagi',
  access_granted: 'Akses dibuka', access_revoked: 'Akses dicabut',
  merchant_suspended: 'Tempat dinonaktifkan', merchant_reactivated: 'Tempat diaktifkan lagi',
};
const LISTING = {
  approved: ['success', 'Tayang'], pending: ['warning', 'Menunggu'], rejected: ['danger', 'Ditolak'], suspended: ['danger', 'Dinonaktifkan'],
};
const when = (ts) => (ts ? new Date(ts).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const waLink = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  return d ? `https://wa.me/${d.startsWith('0') ? `62${d.slice(1)}` : d}` : null;
};

/**
 * One partner: account, documents, places they run, work and money,
 * reviews and every admin decision about them (admin_partner_overview,
 * migrations/0101). Core admins can suspend the account, revoke one kind of
 * access, or deactivate a restaurant or villa; every action needs a reason.
 */
export default function PartnerProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const core = CORE_ADMIN_ROLES.includes(me?.role);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // { title, description, label, tone, run }

  const load = useCallback(async () => {
    setLoading(true);
    const { data: d, error } = await supabase.rpc('admin_partner_overview', { p_user_id: id });
    if (error) toast.error('Gagal memuat profil: ' + error.message);
    setData(d || null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = (cfg) => setConfirm(cfg);
  const run = async (reason) => {
    try {
      await confirm.run(reason);
      toast.success(confirm.done);
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading && !data) {
    return <div className="flex justify-center py-16 text-brand" role="status"><Spinner size={24} /></div>;
  }
  const u = data?.user;
  if (!u) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader back title="Profil mitra" className="!mb-0" />
        <EmptyState title="Akun tidak ditemukan" />
      </div>
    );
  }

  const access = Array.isArray(u.mitra_access) ? u.mitra_access : [];
  const blocked = u.status === 'Diblokir';
  const s = data.stats || {};
  const docs = (data.applications || []).flatMap((a) => [
    ['KTP', a.ktp_photo], ['Selfie', a.selfie_photo], ['SIM', a.sim_photo],
  ].filter(([, src]) => src).map(([label, src]) => ({ label: `${label} · ${KIND_LABEL[a.role] || a.role}`, src })));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back
        className="!mb-0"
        eyebrow="Profil mitra"
        title={u.name || 'Tanpa nama'}
        subtitle={`Bergabung ${when(u.created_at)}`}
        actions={core && (
          blocked ? (
            <Button leftIcon={<CheckCircle2 size={16} />} onClick={() => act({
              title: `Aktifkan lagi ${u.name}?`, description: 'Mitra bisa masuk dan menerima pesanan lagi.', label: 'Aktifkan',
              done: 'Akun aktif kembali', run: (r) => setUserBlocked(u.id, false, r),
            })}>Aktifkan akun</Button>
          ) : (
            <Button variant="danger-soft" leftIcon={<Ban size={16} />} onClick={() => act({
              title: `Tangguhkan ${u.name}?`, tone: 'danger', label: 'Tangguhkan',
              description: `Mitra tidak bisa masuk ke Wira Mitra dan tidak ditawari pesanan baru.${s.active > 0 ? ` Ada ${s.active} pesanan berjalan: selesaikan atau alihkan dulu dari halaman Orders.` : ''}`,
              done: 'Akun ditangguhkan', run: (r) => setUserBlocked(u.id, true, r),
            })}>Tangguhkan</Button>
          )
        )}
      />

      {blocked && <Notice tone="danger" title="Akun ditangguhkan">Lihat alasannya di Riwayat admin di bawah.</Notice>}

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={blocked ? 'danger' : 'success'} dot>{blocked ? 'Ditangguhkan' : u.status || 'Aktif'}</Badge>
          {access.map((k) => {
            const Icon = KIND_ICON[k] || Car;
            return (
              <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[12px] font-medium text-ink">
                <Icon size={12} aria-hidden="true" />{KIND_LABEL[k] || k}
                {core && (
                  <button
                    type="button"
                    aria-label={`Cabut akses ${KIND_LABEL[k] || k}`}
                    title="Cabut akses ini"
                    className="ml-0.5 text-ink-muted hover:text-danger-ink"
                    onClick={() => act({
                      title: `Cabut akses ${KIND_LABEL[k] || k}?`, tone: 'danger', label: 'Cabut akses',
                      description: 'Portal ini tertutup untuk mitra; akses lain dan saldonya tidak berubah.',
                      done: 'Akses dicabut', run: (r) => setPartnerAccess(u.id, k, false, r),
                    })}
                  >
                    <ShieldOff size={12} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
          {u.phone && (
            <a href={waLink(u.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-ink hover:underline">
              <Phone size={14} className="text-ink-muted" />{u.phone}
            </a>
          )}
          {u.email && <span className="inline-flex items-center gap-1.5 text-ink"><Mail size={14} className="text-ink-muted" />{u.email}</span>}
          {u.vehicle_type && <span className="text-ink-muted">Kendaraan: <span className="text-ink">{u.vehicle_type}</span></span>}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Pesanan selesai" value={Number(s.completed || 0).toLocaleString('id-ID')} hint={`${s.completed_30d || 0} dalam 30 hari`} />
        <Stat label="Nilai 30 hari" value={<Money value={s.gmv_30d || 0} className="text-[22px]" />} tone="pay" hint="Total dibayar pelanggan" />
        <Stat label="Rating" value={data.rating?.count ? `${Number(data.rating.avg).toLocaleString('id-ID')} ★` : '—'} icon={<Star size={18} />} tone="neutral" hint={`${data.rating?.count || 0} ulasan`} />
        <Stat label="Saldo pendapatan" value={<Money value={u.payable_balance || 0} className="text-[22px]" />} tone="neutral" hint={`${s.active || 0} pesanan berjalan · ${s.cancelled || 0} batal`} />
      </div>

      {data.technician && (
        <Card className="flex flex-wrap items-center gap-3 text-[13px]">
          <Wrench size={16} className="text-ink-muted" />
          <Badge tone={data.technician.verified_at ? 'success' : 'neutral'}>{data.technician.verified_at ? 'Terverifikasi' : 'Belum verifikasi'}</Badge>
          <span className="text-ink-muted">Keahlian:</span>
          <span className="text-ink">{(data.technician.skills || []).join(', ') || '—'}</span>
          {data.technician.service_areas?.length > 0 && <span className="text-ink-muted">· Wilayah: <span className="text-ink">{data.technician.service_areas.join(', ')}</span></span>}
        </Card>
      )}

      {data.merchants?.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Restoran & villa" className="mb-0" />
          <div className="grid gap-3 md:grid-cols-2">
            {data.merchants.map((m) => {
              const [tone, label] = LISTING[m.listing_status] || LISTING.approved;
              const isVilla = ['villa', 'WiraVilla'].includes(m.service_type);
              return (
                <Card key={m.id} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                        {isVilla ? <Home size={14} /> : <Store size={14} />}{m.name}
                      </p>
                      <p className="text-[12.5px] text-ink-muted">{m.address || '—'}</p>
                    </div>
                    <Badge tone={tone} dot>{label}</Badge>
                  </div>
                  {m.review_note && m.listing_status !== 'approved' && <p className="text-[12.5px] text-danger-ink">Catatan: {m.review_note}</p>}
                  {core && m.listing_status === 'approved' && (
                    <Button size="sm" variant="danger-soft" leftIcon={<Power size={14} />} className="self-start" onClick={() => act({
                      title: `Nonaktifkan ${m.name}?`, tone: 'danger', label: 'Nonaktifkan',
                      description: 'Tidak tampil untuk pelanggan dan tidak bisa dipesan. Riwayat pesanan tetap tersimpan.',
                      done: `${m.name} dinonaktifkan`, run: (r) => setMerchantActive(m.id, false, r),
                    })}>Nonaktifkan</Button>
                  )}
                  {core && m.listing_status === 'suspended' && (
                    <Button size="sm" leftIcon={<Power size={14} />} className="self-start" onClick={() => act({
                      title: `Aktifkan lagi ${m.name}?`, label: 'Aktifkan',
                      description: 'Tampil lagi untuk pelanggan dan bisa dipesan.',
                      done: `${m.name} aktif kembali`, run: (r) => setMerchantActive(m.id, true, r),
                    })}>Aktifkan lagi</Button>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Pesanan terbaru" className="mb-0" />
        {data.recent_orders?.length ? (
          <Table>
            <thead><tr><th>Pesanan</th><th>Layanan</th><th>Status</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {data.recent_orders.map((o) => (
                <tr key={o.id} onClick={() => navigate(`/orders?id=${o.id}`)} className="cursor-pointer hover:bg-sunken/60">
                  <td>
                    <span className="block font-semibold">{o.title || o.id.slice(0, 8)}</span>
                    <span className="font-mono text-[11.5px] text-ink-muted">{when(o.created_at)}</span>
                  </td>
                  <td className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{SERVICE_LABEL[o.service_type] || o.service_type}</td>
                  <td><Badge tone={o.status === 'completed' ? 'success' : o.status === 'cancelled' ? 'danger' : 'brand'} dot>{orderStatusLabel(o.status)}</Badge></td>
                  <td className="text-right"><Money value={o.total_price || 0} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <p className="text-[13px] text-ink-muted">Belum ada pesanan.</p>}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="flex flex-col gap-3">
          <SectionHeader title="Ulasan terbaru" className="mb-0" />
          {data.reviews?.length ? (
            <Card padding="none" className="divide-y divide-line">
              {data.reviews.map((r) => (
                <div key={r.id} className="flex flex-col gap-1 px-4 py-3">
                  <p className="flex items-center gap-2 text-[13px]">
                    <span className="font-mono font-semibold text-ink">{r.rating}★</span>
                    <span className="font-mono text-[11.5px] text-ink-muted">{when(r.created_at)}</span>
                    {r.is_hidden && <Badge tone="neutral">Disembunyikan</Badge>}
                  </p>
                  {r.review_text && <p className="text-[13px] text-ink">{r.review_text}</p>}
                </div>
              ))}
            </Card>
          ) : <p className="text-[13px] text-ink-muted">Belum ada ulasan.</p>}
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Pencairan" className="mb-0" />
          {data.payouts?.length ? (
            <Card padding="none" className="divide-y divide-line">
              {data.payouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
                  <span>
                    <span className="block text-ink">{p.payout_method}</span>
                    <span className="font-mono text-[11.5px] text-ink-muted">{when(p.created_at)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Money value={p.amount} />
                    <Badge tone={p.status === 'approved' ? 'success' : p.status === 'pending' ? 'warning' : 'neutral'}>{p.status}</Badge>
                  </span>
                </div>
              ))}
            </Card>
          ) : <p className="text-[13px] text-ink-muted">Belum ada pencairan.</p>}
        </section>
      </div>

      {docs.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Berkas pendaftaran" className="mb-0" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {docs.map((d) => (
              <a key={d.src} href={d.src} target="_blank" rel="noreferrer" className="flex flex-col gap-1.5 rounded-card border border-line p-2 hover:border-line-strong">
                <img src={d.src} alt={d.label} className="aspect-[4/3] w-full rounded-control bg-sunken object-cover" />
                <span className="flex items-center gap-1 text-[12px] text-ink-muted"><FileImage size={12} />{d.label}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Riwayat admin" className="mb-0" />
        {data.audit?.length ? (
          <ol className="flex flex-col border-l border-line pl-4">
            {data.audit.map((l) => (
              <li key={l.id} className="relative pb-3">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand" />
                <p className="text-[13.5px] font-semibold text-ink">
                  {AUDIT_LABEL[l.action] || l.action}
                  {l.data?.kind ? ` · ${KIND_LABEL[l.data.kind] || l.data.kind}` : ''}
                  {l.data?.name && l.action.startsWith('merchant') ? ` · ${l.data.name}` : ''}
                </p>
                {l.note && <p className="text-[13px] text-ink-muted">{l.note}</p>}
                <p className="font-mono text-[11.5px] text-ink-muted">{when(l.created_at)}{l.actor_name ? ` · ${l.actor_name}` : ''}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="flex items-center gap-1.5 text-[13px] text-ink-muted"><History size={14} /> Belum ada keputusan admin yang tercatat (tercatat sejak Oktober 2026).</p>
        )}
      </section>

      <ReasonSheet
        open={!!confirm}
        title={confirm?.title}
        description={confirm?.description}
        confirmLabel={confirm?.label}
        tone={confirm?.tone}
        onClose={() => setConfirm(null)}
        onConfirm={run}
      />
    </div>
  );
}
