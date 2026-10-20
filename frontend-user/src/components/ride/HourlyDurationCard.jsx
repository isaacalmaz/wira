import { Minus, Plus, Clock } from 'lucide-react';
import { Money, Segmented, cx } from '../ui';

/**
 * HourlyDurationCard
 * 
 * Tenun Laut compliant design for charter / hourly rental duration selection.
 * Solves:
 * - Replaces 11 chaotic wrapping chips with an ergonomic, tactile Stepper [-] N Jam [+]
 * - Provides horizontal smooth-scrolling quick preset pills (2h - 12h) for 1-tap selection
 * - Shows clear subtotal / vehicle rate preview
 * - Uses Tenun Laut Segmented control for "Mulai sekarang" vs "Pilih jam"
 */
export default function HourlyDurationCard({
  hours,
  onChangeHours,
  limits,
  startNow,
  onChangeStartNow,
  selectedVehicle,
  t,
}) {
  const min = limits?.minHours ?? 2;
  const max = limits?.maxHours ?? 12;

  const handleDecrement = () => {
    if (hours > min) {
      onChangeHours(hours - 1);
    }
  };

  const handleIncrement = () => {
    if (hours < max) {
      onChangeHours(hours + 1);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Duration Stepper Card */}
      <div className="flex flex-col gap-3 rounded-card border border-line bg-card p-4 transition-colors">
        {/* Header with Title and Range limit pill */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
              <Clock size={15} />
            </span>
            <span className="text-[14px] font-bold text-ink">
              {t('ride.hours_title')}
            </span>
          </div>
          <span className="rounded-full border border-line bg-sunken px-2.5 py-0.5 font-mono text-[11px] font-semibold text-ink-muted">
            {min}–{max} {t('ride.hours_n', { count: '' }).trim()}
          </span>
        </div>

        {/* Stepper Control */}
        <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-sunken/60 p-2.5">
          <button
            type="button"
            aria-label={t('ride.hours_less') || 'Kurangi durasi sewa'}
            disabled={hours <= min}
            onClick={handleDecrement}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line-strong bg-card text-ink transition-all hover:bg-ground active:scale-95 disabled:pointer-events-none disabled:opacity-30"
          >
            <Minus size={20} />
          </button>

          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-3xl font-extrabold tracking-tight text-ink">
                {hours}
              </span>
              <span className="text-[14px] font-bold text-ink-muted">
                {t('ride.hours_n', { count: '' }).trim() || 'Jam'}
              </span>
            </div>
            {selectedVehicle?.hourlyRate > 0 && (
              <span className="mt-0.5 font-mono text-[11.5px] font-semibold text-brand-ink">
                Total <Money value={selectedVehicle.hourlyRate * hours} />
              </span>
            )}
          </div>

          <button
            type="button"
            aria-label={t('ride.hours_more') || 'Tambah durasi sewa'}
            disabled={hours >= max}
            onClick={handleIncrement}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line-strong bg-card text-ink transition-all hover:bg-ground active:scale-95 disabled:pointer-events-none disabled:opacity-30"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Preset Quick-Select Pills (horizontal scroll rail) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {t('ride.quick_hours') || 'Pilihan Cepat'}
          </span>
          <div
            role="radiogroup"
            aria-label={t('ride.hours_title')}
            className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar"
          >
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((h) => {
              const active = hours === h;
              return (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChangeHours(h)}
                  className={cx(
                    'min-h-9 shrink-0 rounded-full px-3.5 font-mono text-[12px] font-semibold transition-all',
                    active
                      ? 'border-2 border-brand bg-brand text-white ring-1 ring-brand-soft'
                      : 'border border-line bg-sunken text-ink hover:border-line-strong hover:bg-card'
                  )}
                >
                  {t('ride.hours_n', { count: h })}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Start Timing: "Mulai sekarang" vs "Pilih jam" using Segmented */}
      <div className="flex flex-col gap-1.5 pt-0.5">
        <label className="text-[13px] font-semibold text-ink">
          {t('ride.start_label')}
        </label>
        <Segmented
          ariaLabel={t('ride.start_label')}
          value={startNow ? 'now' : 'pick'}
          onChange={(val) => onChangeStartNow(val === 'now')}
          options={[
            { value: 'now', label: t('ride.start_now') },
            { value: 'pick', label: t('ride.start_pick') },
          ]}
          className="w-full"
        />
      </div>
    </div>
  );
}
