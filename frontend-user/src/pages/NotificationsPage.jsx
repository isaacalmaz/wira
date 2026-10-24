import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ChevronRight } from 'lucide-react';
import { Button, Card, EmptyState, IconTile, PageHeader, Spinner, cx } from '../components/ui';
import { toast } from 'react-hot-toast';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import { friendlyError } from '../utils/friendlyError';
import { formatDateTime, localizeDbDates } from '../utils/formatDate';

export default function NotificationsPage() {
  const { notifications: notifs, markRead, markAllRead } = useNotification();
  const { user } = useAuth();
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
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

    try {
      await markAllRead();
      toast.success(t('notifications.mark_all_success'));
    } catch (error) {
      toast.error(t('notifications.mark_all_failed', { message: friendlyError(error) }));
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
            <button
              key={n.id}
              type="button"
              onClick={() => {
                if (!n.is_read) {
                  markRead(n.id);
                }
                if (n.link) {
                  navigate(n.link);
                }
              }}
              className={cx(
                'flex w-full min-h-11 items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sunken/60',
                !n.is_read && 'bg-brand-soft/50',
                n.link && 'cursor-pointer'
              )}
            >
              <IconTile size="sm" tone={n.is_read ? 'neutral' : 'brand'}>
                <Bell size={17} aria-hidden="true" />
              </IconTile>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-start gap-2">
                  <h3 className={cx('min-w-0 flex-1 break-words text-[14px] leading-snug', n.is_read ? 'font-semibold text-ink-muted' : 'font-bold text-ink')}>{n.title}</h3>
                  {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
                </div>
                <p className="break-words text-[13px] leading-relaxed text-ink-muted">{localizeDbDates(n.description)}</p>
                <p className="font-mono text-[11.5px] text-ink-muted">{formatDateTime(n.created_at, lang === 'en' ? 'en-GB' : 'id-ID')}</p>
              </div>
              {n.link && (
                <ChevronRight size={17} className="mt-1 shrink-0 text-ink-muted" aria-hidden="true" />
              )}
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
