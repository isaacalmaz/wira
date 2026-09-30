import { Mail, Phone, MapPin } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { Card, IconTile, ListRow, PageHeader } from '../../components/ui';

export default function ContactPage() {
  const { t } = useTranslation();
  const rowCls = 'min-h-16 px-4 py-3.5';

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader title={t('contact.title')} subtitle={t('contact.intro')} back backLabel={t('common.back')} className="!mb-0" />

      <Card padding="none" className="divide-y divide-line overflow-hidden">
        <ListRow
          as="a"
          href="mailto:wiraapp123@gmail.com"
          className={rowCls}
          leading={<IconTile tone="brand"><Mail size={19} aria-hidden="true" /></IconTile>}
          title={t('contact.email_label')}
          subtitle={<span className="font-medium text-brand-ink">wiraapp123@gmail.com</span>}
          chevron
        />
        <ListRow
          as="a"
          href="tel:085975079134"
          className={rowCls}
          leading={<IconTile tone="brand"><Phone size={19} aria-hidden="true" /></IconTile>}
          title={t('contact.phone_label')}
          subtitle={<span className="font-mono font-medium text-brand-ink">0859 7507 9134</span>}
          chevron
        />
        <ListRow
          className={rowCls}
          leading={<IconTile tone="neutral"><MapPin size={19} aria-hidden="true" /></IconTile>}
          title={t('contact.office_label')}
          subtitle={t('contact.office_value')}
        />
      </Card>
    </div>
  );
}
