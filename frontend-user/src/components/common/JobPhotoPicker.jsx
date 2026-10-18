import { useEffect, useMemo } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useTranslation } from '../../i18n';

const MAX_JOB_PHOTOS = 3;

/**
 * Up to three photos of a "Pekerjaan lain" job (WiraService, WiraPool).
 * Holds File objects; the page uploads them to the private order-photos
 * bucket when the order is placed (migrations/0123).
 */
export default function JobPhotoPicker({ files, onChange, label }) {
  const { t } = useTranslation();
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-ink">{label || t('service.custom_photos_label')}</span>
      <div className="flex flex-wrap gap-2">
        {files.map((file, i) => (
          <span key={`${file.name}-${i}`} className="relative">
            <img src={previews[i]} alt="" className="h-16 w-16 rounded-control border border-line object-cover" />
            <button
              type="button"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              aria-label={t('service.custom_photo_remove')}
              className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-ink shadow-sm"
            >
              <X size={14} />
            </button>
          </span>
        ))}
        {files.length < MAX_JOB_PHOTOS && (
          <label className="relative inline-flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-control border border-dashed border-line-strong text-[11px] text-ink-muted hover:bg-sunken">
            <ImagePlus size={18} aria-hidden="true" />
            {t('service.custom_photo_add')}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onChange([...files, file].slice(0, MAX_JOB_PHOTOS));
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      <span className="text-[12px] text-ink-muted">{t('service.custom_photos_hint')}</span>
    </div>
  );
}
