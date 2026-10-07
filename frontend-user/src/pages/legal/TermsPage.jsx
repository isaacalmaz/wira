import { useTranslation } from '../../i18n';
import { Card, PageHeader } from '../../components/ui';

export default function TermsPage() {
  const { t } = useTranslation();

  const sections = ['s1', 's2', 's3', 's4', 's5', 's6'];

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader title={t('terms.title')} subtitle={t('terms.updated')} back backLabel={t('common.back')} className="!mb-0" />

      <Card padding="lg">
        <article className="flex flex-col gap-6 text-sm leading-relaxed text-ink">
          {sections.map((id) => (
            <section key={id} className="flex flex-col gap-2">
              <h2 className="text-[15px] font-bold tracking-tight text-ink text-balance">{t(`terms.${id}_title`)}</h2>
              <p>{t(`terms.${id}_body`)}</p>
            </section>
          ))}
        </article>
      </Card>
    </div>
  );
}
