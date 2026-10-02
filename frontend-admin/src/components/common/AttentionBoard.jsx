import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Clock, Gavel, Wallet, ArrowDownToLine, LifeBuoy, Star, UserPlus, Home, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { CORE_ADMIN_ROLES, CS_ADMIN_ROLES, FINANCE_ADMIN_ROLES } from '../../config/roles';
import { Button, Card, Money, cx } from '../ui';

const ROLE_PAGE = { driver: '/drivers', courier: '/drivers', merchant: '/merchants', villa: '/villas', technician: '/technicians' };
const ROLE_NAME = { driver: 'driver', courier: 'kurir', merchant: 'resto', villa: 'villa', technician: 'teknisi' };

// Kinds from admin_attention() (migrations/0100). level: 3 = money or a
// customer waiting right now, 2 = someone waiting on a decision, 1 = follow-up.
const KINDS = [
  { key: 'stale_orders', label: 'Pesanan macet', icon: AlertTriangle, level: 3, link: '/orders', roles: CS_ADMIN_ROLES, hint: 'Status tidak bergerak' },
  { key: 'unmatched_orders', label: 'Belum dapat mitra', icon: Clock, level: 3, link: '/orders', roles: CS_ADMIN_ROLES, hint: 'Lebih dari 10 menit; batal otomatis di menit 30' },
  { key: 'disputes', label: 'Keberatan proyek', icon: Gavel, level: 3, link: '/projects', roles: CORE_ADMIN_ROLES, hint: 'Dana ditahan sampai diputuskan' },
  { key: 'payouts', label: 'Permintaan pencairan', icon: Wallet, level: 2, link: '/finance', roles: FINANCE_ADMIN_ROLES, money: true },
  { key: 'topups', label: 'Top-up menunggu', icon: ArrowDownToLine, level: 2, link: '/finance', roles: FINANCE_ADMIN_ROLES, money: true },
  { key: 'applications', label: 'Pendaftar mitra baru', icon: UserPlus, level: 2, link: null, roles: CORE_ADMIN_ROLES },
  { key: 'villa_listings', label: 'Properti villa menunggu', icon: Home, level: 2, link: '/villas', roles: CORE_ADMIN_ROLES },
  { key: 'tickets', label: 'Tiket bantuan terbuka', icon: LifeBuoy, level: 1, link: '/support', roles: CS_ADMIN_ROLES },
  { key: 'low_reviews', label: 'Ulasan 1–2 bintang', icon: Star, level: 1, link: '/reviews', roles: CORE_ADMIN_ROLES, hint: '7 hari terakhir' },
];

const TONE = {
  3: { box: 'border-danger-line bg-danger-soft', ink: 'text-danger-ink' },
  2: { box: 'border-warning-line bg-warning-soft', ink: 'text-warning-ink' },
  1: { box: 'border-line bg-card', ink: 'text-ink' },
};

const since = (ts) => {
  if (!ts) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if (mins < 60) return `${mins} mnt`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} jam` : `${Math.round(h / 24)} hari`;
};

/**
 * "Perlu ditangani": everything waiting for an admin, most urgent first,
 * each tile opening the page where it is handled. Only kinds the signed-in
 * role can act on are shown.
 */
export default function AttentionBoard({ onLoaded }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: d, error: e } = await supabase.rpc('admin_attention');
    setError(e ? e.message : null);
    setData(d || null);
    onLoaded?.(d || null);
    setLoading(false);
  }, [onLoaded]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const tiles = KINDS
    .filter((k) => k.roles.includes(user?.role))
    .map((k) => ({ ...k, ...(data?.[k.key] || {}) }))
    .filter((k) => Number(k.count) > 0)
    .sort((a, b) => b.level - a.level || Number(b.count) - Number(a.count));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-bold tracking-tight text-ink">Perlu ditangani</h2>
        <Button size="sm" variant="ghost" onClick={load} aria-label="Muat ulang" className="px-2">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>
      {error ? (
        <Card className="text-[13px] text-ink-muted">Daftar tugas belum bisa dimuat: {error}</Card>
      ) : !data && loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((n) => <div key={n} className="h-[104px] animate-pulse rounded-card border border-line bg-sunken" />)}
        </div>
      ) : tiles.length === 0 ? (
        <Card className="flex items-center gap-3">
          <CheckCircle2 size={22} className="shrink-0 text-success" aria-hidden="true" />
          <div>
            <p className="text-[14px] font-semibold text-ink">Semua beres</p>
            <p className="text-[13px] text-ink-muted">Tidak ada pendaftar, pesanan bermasalah, pencairan atau tiket yang menunggu.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((k) => {
            const Icon = k.icon;
            const tone = TONE[k.level];
            const roles = k.key === 'applications'
              ? Object.entries(k.by_role || {}).sort((a, b) => b[1] - a[1])
              : null;
            const go = k.link || (roles?.[0] && ROLE_PAGE[roles[0][0]]) || '/drivers';
            return (
              <div key={k.key} className={cx('flex flex-col gap-2 rounded-card border p-4', tone.box)}>
                <button type="button" onClick={() => navigate(go)} className="flex items-start gap-3 text-left">
                  <Icon size={20} className={cx('mt-0.5 shrink-0', tone.ink)} aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cx('text-[14px] font-semibold', tone.ink)}>{k.label}</span>
                    <span className="text-[12px] text-ink-muted">
                      {k.hint ? `${k.hint}` : ''}
                      {k.hint && k.oldest ? ' · ' : ''}
                      {k.oldest ? `terlama ${since(k.oldest)}` : ''}
                    </span>
                  </span>
                  <span className={cx('font-mono text-[26px] font-semibold leading-none', tone.ink)}>{Number(k.count).toLocaleString('id-ID')}</span>
                </button>
                {k.money && Number(k.amount) > 0 && (
                  <p className="pl-8 text-[12.5px] text-ink-muted">Total <Money value={k.amount} className="font-medium text-ink" /></p>
                )}
                {roles && roles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-8">
                    {roles.map(([role, n]) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => navigate(ROLE_PAGE[role] || '/users')}
                        className="rounded-full border border-warning-line bg-card px-2.5 py-0.5 text-[12px] font-medium text-ink hover:border-line-strong"
                      >
                        {n} {ROLE_NAME[role] || role}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
