import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';

export default function RefundPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

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
        <h1 className="text-lg font-bold dark:text-white">{t('refund.title')}</h1>
      </div>

      <div className="p-4 space-y-4 text-sm text-slate-700 dark:text-slate-300">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
          <p className="text-xs text-slate-500">{t('refund.updated')}</p>

          <h2 className="font-bold text-lg dark:text-white">{t('refund.s1_title')}</h2>
          <p>{t('refund.s1_body')}</p>

          <h2 className="font-bold text-lg dark:text-white">{t('refund.s2_title')}</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>{t('refund.s2_item_1')}</li>
            <li>{t('refund.s2_item_2')}</li>
            <li>{t('refund.s2_item_3')}</li>
          </ul>

          <h2 className="font-bold text-lg dark:text-white">{t('refund.s3_title')}</h2>
          <p>{t('refund.s3_body')}</p>

          <h2 className="font-bold text-lg dark:text-white">{t('refund.s4_title')}</h2>
          <p>{t('refund.s4_body')}</p>
        </div>
      </div>
    </div>
  );
}
