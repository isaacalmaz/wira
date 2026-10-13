import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useTranslation } from '../../i18n';
import { Card, cx } from '../ui';
import OrderPhotoThumbs from './OrderPhotoThumbs';

// Ideal ranges shown to the customer (owner's decision, 2026-10-13).
const PH_RANGE = [7.2, 7.6];
const CHLORINE_RANGE = [1, 3];

function Measure({ label, value, unit, range, idealLabel }) {
  const ok = value >= range[0] && value <= range[1];
  return (
    <div className={cx('flex min-w-0 flex-col gap-0.5 rounded-control border px-3 py-2', ok ? 'border-success-line bg-success-soft' : 'border-warning-line bg-warning-soft')}>
      <span className={cx('text-[11.5px]', ok ? 'text-success-ink' : 'text-warning-ink')}>{label}</span>
      <span className="font-mono text-[17px] font-medium text-ink">
        {Number(value).toLocaleString('id-ID', { maximumFractionDigits: 1 })}{unit && <span className="text-[12px] text-ink-muted"> {unit}</span>}
      </span>
      <span className="text-[11px] text-ink-muted">{idealLabel}</span>
    </div>
  );
}

/**
 * The technician's report of a pool visit (migrations/0125): before/after
 * photos, pH, chlorine, water condition, what was done and a note.
 */
export default function VisitReportCard({ order }) {
  const { t } = useTranslation();
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (order?.service_type !== 'pool' || String(order?.rawStatus || order?.status) !== 'completed') return undefined;
    let cancelled = false;
    supabase.from('visit_reports').select('*').eq('order_id', order.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setReport(data || null); });
    return () => { cancelled = true; };
  }, [order?.id, order?.service_type, order?.status, order?.rawStatus]);

  if (!report) return null;
  const date = new Date(report.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

  return (
    <Card className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
        <ClipboardCheck size={17} className="text-brand-ink" aria-hidden="true" />
        {t('report.title', { date })}
      </p>
      {(report.photos_before?.length > 0 || report.photos_after?.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {report.photos_before?.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[12px] text-ink-muted">{t('report.before')}</span>
              <OrderPhotoThumbs paths={report.photos_before} label={t('report.before')} />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-ink-muted">{t('report.after')}</span>
            <OrderPhotoThumbs paths={report.photos_after} label={t('report.after')} />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Measure label="pH" value={report.ph} range={PH_RANGE} idealLabel={t('report.ideal', { range: '7,2–7,6' })} />
        <Measure label={t('report.chlorine')} value={report.chlorine} unit="ppm" range={CHLORINE_RANGE} idealLabel={t('report.ideal', { range: '1–3 ppm' })} />
      </div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-ink-muted">{t('report.water')}</span>
        <span className={cx('font-semibold', report.water_condition === 'jernih' ? 'text-success-ink' : 'text-warning-ink')}>
          {t(`report.water_${report.water_condition}`)}
        </span>
      </div>
      {report.tasks?.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px] text-ink">
          {report.tasks.map((task) => <li key={task} className="flex gap-2"><span aria-hidden="true" className="text-brand-ink">✓</span>{task}</li>)}
        </ul>
      )}
      {report.note && <p className="rounded-control bg-sunken px-3 py-2 text-[13px] leading-relaxed text-ink">{report.note}</p>}
    </Card>
  );
}
