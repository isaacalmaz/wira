import { Home, Sparkles, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from '../../i18n';

export default function BottomNav({ onOpenAI, isAIOpen = false }) {
  const location = useLocation();
  const { t } = useTranslation();

  const isHome = location.pathname === '/' && !isAIOpen;
  const isProfile = (location.pathname.startsWith('/profile') || location.pathname.startsWith('/activity')) && !isAIOpen;
  const isAI = Boolean(isAIOpen);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-line pb-safe" aria-label={t('nav.title') || 'Navigasi Utama'}>
      <div className="grid grid-cols-3 px-2 pt-1.5 pb-1.5">
        <Link
          to="/"
          aria-current={isHome ? 'page' : undefined}
          className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-[10px] py-1.5 transition-colors ${
            isHome ? 'text-brand-ink' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <Home size={21} strokeWidth={isHome ? 2.3 : 1.9} />
          <span className={`text-[11px] leading-none ${isHome ? 'font-bold' : 'font-semibold'}`}>
            {t('nav.home')}
          </span>
        </Link>

        <button
          type="button"
          onClick={onOpenAI}
          aria-haspopup="dialog"
          aria-expanded={isAI}
          aria-label={t('nav.ai') || 'Wira AI'}
          className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-[10px] py-1.5 transition-colors ${
            isAI ? 'text-brand-ink' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <Sparkles size={21} strokeWidth={isAI ? 2.3 : 1.9} />
          <span className={`text-[11px] leading-none ${isAI ? 'font-bold' : 'font-semibold'}`}>
            {t('nav.ai')}
          </span>
        </button>

        <Link
          to="/profile"
          aria-current={isProfile ? 'page' : undefined}
          className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-[10px] py-1.5 transition-colors ${
            isProfile ? 'text-brand-ink' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <User size={21} strokeWidth={isProfile ? 2.3 : 1.9} />
          <span className={`text-[11px] leading-none ${isProfile ? 'font-bold' : 'font-semibold'}`}>
            {t('nav.profile')}
          </span>
        </Link>
      </div>
    </nav>
  );
}
