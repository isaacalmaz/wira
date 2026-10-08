import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { Card, EmptyState, PageHeader, Spinner, cx } from '../../components/ui';
import { resolvePartnerLink } from '../../utils/links';
import { localizeDbDates } from '../../utils/datetime';

// "Portal nanny" (raw portal key from the database) -> "Portal Pengasuh".
const PORTAL_NAME = { driver: 'Driver', merchant: 'Restoran', villa: 'Villa', technician: 'Teknisi', nanny: 'Pengasuh' };
const partnerNotificationText = (text) => localizeDbDates(text).replace(/\bPortal (driver|merchant|villa|technician|nanny)\b/g, (_, k) => `Portal ${PORTAL_NAME[k]}`);

const when = (ts) => {
  const d = new Date(ts);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} mnt lalu`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} jam lalu`;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

/**
 * The partner's inbox: every notification the database sent this account
 * (billing reminders, deposit decisions, new orders, cancellations,
 * admin messages) - also when push never arrived. Opening marks them read.
 */
export default function NotificationsPage() {
  const { user, mitraAccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = location.pathname.split('/').filter(Boolean)[0];
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error: e } = await supabase
      .from('notifications')
      .select('id, title, description, link, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60);
    setError(Boolean(e));
    setRows(data || []);
    const unread = (data || []).filter((n) => !n.is_read).map((n) => n.id);
    if (unread.length) {
      await supabase.from('notifications').update({ is_read: true }).in('id', unread).select('id');
      window.dispatchEvent(new Event('wira:notifications-read'));
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-4 pb-20">
      <PageHeader title="Notifikasi" back className="mb-0" />
      {rows === null ? (
        <Card className="flex min-h-[120px] items-center justify-center"><Spinner /></Card>
      ) : error && rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center text-[13.5px] text-ink-muted">
          Notifikasi belum bisa dimuat. Periksa koneksi, lalu coba lagi.
          <button type="button" onClick={load} className="min-h-11 rounded-control border border-line-strong px-4 font-semibold text-ink">Coba lagi</button>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Bell size={24} />} title="Belum ada notifikasi" description="Pesanan baru, tagihan komisi dan kabar dari admin muncul di sini." />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-line">
            {rows.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => navigate(resolvePartnerLink(n.link, mitraAccess, role))}
                  className={cx('flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sunken', !n.is_read && 'bg-brand-soft/40')}
                >
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-brand')} aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[14px] font-semibold text-ink">{n.title}</span>
                    {n.description && <span className="text-[13px] leading-relaxed text-ink-muted">{partnerNotificationText(n.description)}</span>}
                    <span className="text-[11.5px] text-ink-muted">{when(n.created_at)}</span>
                  </span>
                  <ChevronRight size={16} className="mt-1 shrink-0 text-ink-muted" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
