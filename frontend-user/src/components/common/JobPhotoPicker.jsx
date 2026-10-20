import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronRight, ImagePlus, Images, X } from 'lucide-react';
import { useTranslation } from '../../i18n';
import Sheet from '../ui/Sheet';
import IconTile from '../ui/IconTile';

const MAX_JOB_PHOTOS = 3;

/**
 * Up to three photos of a "Pekerjaan lain" job (WiraService, WiraPool, WiraSend).
 * Holds File objects; the page uploads them to the private order-photos
 * bucket when the order is placed (migrations/0123).
 *
 * Provides a 2-option sheet on tap:
 * 1. Camera (direct snapshot with capture="environment")
 * 2. Gallery (file picker for existing device photos)
 */
export default function JobPhotoPicker({ files, onChange, label }) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const handleCameraChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const remaining = MAX_JOB_PHOTOS - files.length;
      if (remaining > 0) {
        onChange([...files, file]);
      }
    }
    e.target.value = '';
  };

  const handleGalleryChange = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      const remaining = MAX_JOB_PHOTOS - files.length;
      onChange([...files, ...selected.slice(0, remaining)]);
    }
    e.target.value = '';
  };

  const openCamera = () => {
    cameraInputRef.current?.click();
    setPickerOpen(false);
  };

  const openGallery = () => {
    galleryInputRef.current?.click();
    setPickerOpen(false);
  };

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
              className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-card text-ink hover:bg-ground transition-colors"
            >
              <X size={14} />
            </button>
          </span>
        ))}
        {files.length < MAX_JOB_PHOTOS && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-label={t('service.custom_photo_add')}
            className="relative inline-flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-control border border-dashed border-line-strong text-[11px] text-ink-muted hover:border-brand hover:text-brand-ink hover:bg-sunken transition-colors"
          >
            <ImagePlus size={18} aria-hidden="true" />
            {t('service.custom_photo_add')}
          </button>
        )}
      </div>
      <span className="text-[12px] text-ink-muted">{t('service.custom_photos_hint')}</span>

      {/* Hidden native file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleGalleryChange}
      />

      {/* 2-Option Action Sheet for Camera vs Gallery */}
      <Sheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('service.photo_source_title')}
        size="sm"
      >
        <div className="flex flex-col gap-2.5 p-4 pt-1">
          <button
            type="button"
            onClick={openCamera}
            className="flex w-full items-center gap-3.5 rounded-card border border-line bg-card p-3.5 text-left transition-colors hover:border-brand hover:bg-sunken active:bg-sunken min-h-[56px]"
          >
            <IconTile tone="brand" size="md">
              <Camera size={20} />
            </IconTile>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-ink">
                {t('service.photo_source_camera')}
              </div>
              <div className="text-[12px] text-ink-muted">
                {t('service.photo_source_camera_desc')}
              </div>
            </div>
            <ChevronRight size={18} className="text-ink-muted shrink-0" />
          </button>

          <button
            type="button"
            onClick={openGallery}
            className="flex w-full items-center gap-3.5 rounded-card border border-line bg-card p-3.5 text-left transition-colors hover:border-brand hover:bg-sunken active:bg-sunken min-h-[56px]"
          >
            <IconTile tone="neutral" size="md">
              <Images size={20} />
            </IconTile>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-ink">
                {t('service.photo_source_gallery')}
              </div>
              <div className="text-[12px] text-ink-muted">
                {t('service.photo_source_gallery_desc')}
              </div>
            </div>
            <ChevronRight size={18} className="text-ink-muted shrink-0" />
          </button>
        </div>
      </Sheet>
    </div>
  );
}
