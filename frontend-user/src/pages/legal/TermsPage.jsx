import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';

export default function TermsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const sections = ['s1', 's2', 's3', 's4', 's5'];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
      <div className="bg-white dark:bg-slate-800 px-4 py-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          title={t('common.back')}
          aria-label={t('common.back')}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <ChevronLeft size={24} className="dark:text-white" />
        </button>
        <h1 className="text-lg font-bold dark:text-white">{t('terms.title')}</h1>
      </div>

      <div className="p-4 space-y-4 text-sm text-slate-700 dark:text-slate-300">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
          <p className="text-xs text-slate-500">{t('terms.updated')}</p>

          {sections.map((id) => (
            <div key={id} className="space-y-4">
              <h2 className="font-bold text-lg dark:text-white">{t(`terms.${id}_title`)}</h2>
              <p>{t(`terms.${id}_body`)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
