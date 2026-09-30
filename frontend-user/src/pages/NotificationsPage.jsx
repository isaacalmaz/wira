import { useState, useEffect } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Button, Card, EmptyState, IconTile, PageHeader, Spinner, cx } from '../components/ui';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';

export default function NotificationsPage() {
  const { notifications: notifs, setNotifications } = useNotification();
  const { user } = useAuth();
  const { t, lang } = useTranslation();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Context already fetches it on mount, so just turn off loading
    setLoading(false);
  }, []);

  const handleMarkAllRead = async () => {
    if (!user) return;
    const hasUnread = notifs.some(n => !n.is_read);
    if (!hasUnread) {
      toast.success(t('notifications.all_read_already'));
      return;
    }

    // Scoped to the current user - previously this updated is_read=true on
    // EVERY unread row in public.notifications, not just this user's own
    // (RLS - migrations/0053 - now also enforces auth.uid() = user_id on
    // UPDATE, but this client-side filter stays as the honest, explicit
    // query rather than relying on RLS alone).
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false)
      .eq('user_id', user.id)
      .select();

    if (error) {
      toast.error(t('notifications.mark_all_failed', { message: error.message }));
    } else if (!data || data.length === 0) {
      toast.error(t('notifications.mark_all_denied'));
    } else {
      setNotifications(notifs.map(n => ({ ...n, is_read: true })));
      toast.success(t('notifications.mark_all_success'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2.5 py-16 text-sm text-ink-muted">
        <Spinner size={18} className="text-brand-ink" /> {t('notifications.loading')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader
        title={t('notifications.title')}
        className="!mb-0"
        actions={(
          <Button variant="ghost" size="sm" className="min-h-11" leftIcon={<CheckCheck size={16} aria-hidden="true" />} onClick={handleMarkAllRead}>
            {t('notifications.mark_all_read')}
          </Button>
        )}
      />
      {notifs.length === 0 ? (
        <EmptyState icon={<Bell size={24} />} title={t('notifications.empty')} />
      ) : (
        <Card padding="none" className="divide-y divide-line overflow-hidden">
          {notifs.map(n => (
            <div key={n.id} className={cx('flex gap-3 px-4 py-3.5', !n.is_read && 'bg-brand-soft/50')}>
              <IconTile size="sm" tone={n.is_read ? 'neutral' : 'brand'}>
                <Bell size={17} aria-hidden="true" />
              </IconTile>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-start gap-2">
                  <h3 className={cx('min-w-0 flex-1 break-words text-[14px] leading-snug', n.is_read ? 'font-semibold text-ink-muted' : 'font-bold text-ink')}>{n.title}</h3>
                  {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
                </div>
                <p className="break-words text-[13px] leading-relaxed text-ink-muted">{n.description}</p>
                <p className="font-mono text-[11.5px] text-ink-muted">{new Date(n.created_at).toLocaleString(lang === 'en' ? 'en-GB' : 'id-ID')}</p>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
