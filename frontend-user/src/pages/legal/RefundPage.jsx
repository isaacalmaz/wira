import { useTranslation } from '../../i18n';
import { Card, PageHeader } from '../../components/ui';

export default function RefundPage() {
  const { t } = useTranslation();
  const h2 = 'text-[15px] font-bold tracking-tight text-ink text-balance';

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader title={t('refund.title')} subtitle={t('refund.updated')} back backLabel={t('common.back')} className="!mb-0" />

      <Card padding="lg">
        <article className="flex flex-col gap-6 text-sm leading-relaxed text-ink">
          <section className="flex flex-col gap-2">
            <h2 className={h2}>{t('refund.s1_title')}</h2>
            <p>{t('refund.s1_body')}</p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className={h2}>{t('refund.s2_title')}</h2>
            <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-ink-muted">
              <li>{t('refund.s2_item_1')}</li>
              <li>{t('refund.s2_item_2')}</li>
              <li>{t('refund.s2_item_3')}</li>
              <li>{t('refund.s2_item_4')}</li>
              <li>{t('refund.s2_item_5')}</li>
              <li>{t('refund.s2_item_6')}</li>
              <li>{t('refund.s2_item_7')}</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className={h2}>{t('refund.s3_title')}</h2>
            <p>{t('refund.s3_body')}</p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className={h2}>{t('refund.s4_title')}</h2>
            <p>{t('refund.s4_body')}</p>
          </section>
        </article>
      </Card>
    </div>
  );
}
