import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import WiraMark from '../../components/brand/WiraMark';
import { Button, Card } from '../../components/ui';
import DeleteAccountSheet from '../../components/account/DeleteAccountSheet';

// Public page (no login needed to read it): the account-deletion URL for the
// Google Play listings of both Wira and Wira Mitra. Partners sign in here
// with the same email and password they use in Wira Mitra.
export default function DeleteAccountPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-ground px-4 pb-16 pt-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Link to="/" className="self-start" aria-label="Wira"><WiraMark /></Link>

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink text-balance">{t('delete_account.page_title')}</h1>
          <p className="text-sm leading-relaxed text-ink-muted">{t('delete_account.page_intro')}</p>
        </header>

        <Card padding="lg" className="flex flex-col gap-3 text-sm leading-relaxed text-ink">
          <h2 className="text-[15px] font-bold tracking-tight">{t('delete_account.page_steps_title')}</h2>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5">
            <li>{t('delete_account.page_step_app')}</li>
            <li>{t('delete_account.page_step_web')}</li>
            <li>{t('delete_account.page_step_email')}</li>
          </ol>
        </Card>

        <Card padding="lg" className="flex flex-col gap-3 text-sm leading-relaxed text-ink">
          <h2 className="text-[15px] font-bold tracking-tight">{t('delete_account.page_what_title')}</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>{t('delete_account.point_profile')}</li>
            <li>{t('delete_account.point_history')}</li>
            <li>{t('delete_account.point_open')}</li>
          </ul>
        </Card>

        {user ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-muted">{t('delete_account.page_signed_in')} <span className="font-medium text-ink">{user.email || user.name}</span></p>
            <Button variant="danger" block leftIcon={<Trash2 size={18} />} onClick={() => setOpen(true)}>{t('delete_account.title')}</Button>
          </div>
        ) : (
          <Button variant="primary" block onClick={() => navigate('/login', { state: { from: '/hapus-akun' } })}>{t('delete_account.page_login')}</Button>
        )}

        <DeleteAccountSheet open={open} onClose={() => setOpen(false)} />
      </div>
    </div>
  );
}
