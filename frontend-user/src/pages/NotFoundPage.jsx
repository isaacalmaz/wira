import { Link } from 'react-router-dom';
import { Home, SearchX } from 'lucide-react';
import { Card, IconTile } from '../components/ui';
import WiraMark from '../components/brand/WiraMark';
import { useTranslation } from '../i18n';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-ground px-4 py-10">
      <Link to="/" className="flex items-center gap-2.5" aria-label="Wira">
        <WiraMark size={34} />
        <span className="text-[24px] font-extrabold leading-none tracking-[-0.035em] text-brand-ink">wira</span>
      </Link>
      <Card padding="lg" className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <IconTile tone="neutral" size="lg">
          <SearchX size={24} aria-hidden="true" />
        </IconTile>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance">
            {t('not_found.title')}
          </h1>
          <p className="text-sm leading-relaxed text-ink-muted">
            {t('not_found.desc')}
          </p>
        </div>
        <Link
          to="/"
          className="mt-1 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-brand px-5 py-3 text-center text-[15px] font-semibold leading-tight text-white transition-colors hover:bg-brand-hover"
        >
          <Home size={17} className="shrink-0" aria-hidden="true" /> {t('not_found.home')}
        </Link>
      </Card>
    </div>
  );
}
