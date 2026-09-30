import { Link } from 'react-router-dom';
import { Home, SearchX } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { useTranslation } from '../i18n';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-full mx-auto flex items-center justify-center">
          <SearchX size={32} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {t('not_found.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('not_found.desc')}
          </p>
        </div>
        <Link to="/">
          <Button className="w-full py-3 font-bold flex items-center justify-center gap-2">
            <Home size={16} /> {t('not_found.home')}
          </Button>
        </Link>
      </Card>
    </div>
  );
}
