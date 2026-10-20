import { useState, useMemo, useEffect } from 'react';
import { Clock, ChevronDown, Calendar } from 'lucide-react';
import { Button, Sheet, cx } from '../ui';

function getSlotPeriod(d) {
  const h = d.getHours();
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 15) return 'afternoon';
  if (h >= 15 && h < 18) return 'evening';
  return 'night';
}

/**
 * RideSchedulePicker
 * 
 * Tenun Laut compliant pickup date and time selector.
 * Solves:
 * - Replaces raw HTML <select> with a branded interactive trigger button
 * - Replaces the huge 96-item native OS popup with an official Tenun Laut Sheet
 * - Categorizes 15-minute time slots into natural periods (Pagi, Siang, Sore, Malam)
 * - Offers an in-sheet day switcher and quick period filtering (Semua, Pagi, Siang, Sore, Malam)
 * - Renders slots in an ergonomic 4-column grid with 44px minimum touch targets
 */
export default function RideSchedulePicker({
  schedDay,
  setSchedDay,
  schedTime,
  setSchedTime,
  dayOptions,
  timeOptions,
  dayLabel,
  timeKey,
  limits,
  t,
  lang,
}) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [activePeriod, setActivePeriod] = useState('all');

  const periodDefs = useMemo(() => [
    { id: 'morning', label: t('ride.period_morning') || (lang === 'en' ? 'Morning' : 'Pagi'), timeRange: '06:00–11:45' },
    { id: 'afternoon', label: t('ride.period_afternoon') || (lang === 'en' ? 'Afternoon' : 'Siang'), timeRange: '12:00–14:45' },
    { id: 'evening', label: t('ride.period_evening') || (lang === 'en' ? 'Evening' : 'Sore'), timeRange: '15:00–17:45' },
    { id: 'night', label: t('ride.period_night') || (lang === 'en' ? 'Night' : 'Malam'), timeRange: '18:00–05:45' },
  ], [t, lang]);

  // Group slots by period
  const slotsByPeriod = useMemo(() => {
    const groups = {
      morning: [],
      afternoon: [],
      evening: [],
      night: [],
    };
    for (const d of timeOptions) {
      const p = getSlotPeriod(d);
      if (groups[p]) groups[p].push(d);
    }
    return groups;
  }, [timeOptions]);

  // Find which period current schedTime belongs to
  const currentPeriod = useMemo(() => {
    if (!schedTime) return null;
    const match = timeOptions.find((d) => timeKey(d) === schedTime);
    return match ? getSlotPeriod(match) : null;
  }, [schedTime, timeOptions, timeKey]);

  // When opening sheet or day changing, automatically pick the most relevant tab
  useEffect(() => {
    if (!isSheetOpen) return;
    if (currentPeriod && slotsByPeriod[currentPeriod]?.length > 0) {
      setActivePeriod(currentPeriod);
    } else if (activePeriod !== 'all' && slotsByPeriod[activePeriod]?.length === 0) {
      // Find first non-empty period or fallback to 'all'
      const firstAvailable = periodDefs.find((p) => slotsByPeriod[p.id]?.length > 0);
      setActivePeriod(firstAvailable ? firstAvailable.id : 'all');
    }
  }, [isSheetOpen, schedDay, slotsByPeriod, activePeriod, currentPeriod, periodDefs]);

  const currentDayText = dayLabel(dayOptions[schedDay] || dayOptions[0], schedDay);

  const handleSelectSlot = (val) => {
    setSchedTime(val);
  };

  const handleConfirmAndClose = () => {
    setIsSheetOpen(false);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="text-[15px] font-bold tracking-tight text-ink">
        {t('ride.when_title')}
      </h2>

      {/* Day Pills Bar on Main Booking Screen */}
      <div
        role="radiogroup"
        aria-label={t('ride.when_title')}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar"
      >
        {dayOptions.map((d, i) => {
          const active = schedDay === i;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setSchedDay(i);
                setSchedTime('');
              }}
              className={cx(
                'min-h-10 shrink-0 rounded-full px-4 text-[13px] font-semibold transition-colors',
                active
                  ? 'border-2 border-brand bg-brand-soft text-brand-ink'
                  : 'border border-line bg-card text-ink hover:border-line-strong'
              )}
            >
              {dayLabel(d, i)}
            </button>
          );
        })}
      </div>

      {/* Time Picker Trigger Button */}
      {timeOptions.length > 0 ? (
        <button
          type="button"
          id="ride-time-trigger"
          aria-haspopup="dialog"
          aria-expanded={isSheetOpen}
          onClick={() => setIsSheetOpen(true)}
          className={cx(
            'flex min-h-[52px] w-full items-center justify-between gap-3 rounded-control border bg-card px-3.5 py-2.5 text-left transition-all',
            schedTime
              ? 'border-brand bg-brand-soft/20'
              : 'border-line-strong hover:border-brand'
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cx(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors',
                schedTime ? 'bg-brand text-white' : 'bg-sunken text-ink-muted'
              )}
            >
              <Clock size={18} />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                {t('ride.time_label')}
              </span>
              <span
                className={cx(
                  'truncate font-mono text-[15px]',
                  schedTime ? 'font-bold text-ink' : 'font-medium text-ink-muted'
                )}
              >
                {schedTime || t('ride.time_placeholder')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {schedTime && (
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 font-mono text-[11px] font-semibold text-brand-ink">
                {schedTime}
              </span>
            )}
            <ChevronDown size={18} className="shrink-0 text-ink-muted" />
          </div>
        </button>
      ) : (
        <div className="flex items-center gap-2.5 rounded-card border border-line bg-sunken p-3 text-[12.5px] text-ink-muted">
          <Clock size={16} className="shrink-0 text-ink-muted" />
          <span>{t('ride.no_time_today')}</span>
        </div>
      )}

      {/* Booking Schedule Hint */}
      <p className="text-[12px] leading-relaxed text-ink-muted">
        {t('ride.schedule_hint', { minutes: limits.minMinutes, days: limits.maxDays })}
      </p>

      {/* Tenun Laut Bottom Sheet Modal */}
      <Sheet
        open={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        title={t('ride.time_label')}
        description={`${currentDayText} • Kelipatan 15 menit`}
        icon={<Clock size={20} />}
        footer={
          <div className="flex w-full items-center gap-2">
            <Button
              variant="secondary"
              size="lg"
              className="w-1/3"
              onClick={() => setIsSheetOpen(false)}
            >
              {t('common.close')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="w-2/3"
              disabled={!schedTime}
              onClick={handleConfirmAndClose}
            >
              {schedTime ? `${t('common.save')} · ${schedTime}` : t('ride.time_placeholder')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Day Selector Inside Sheet for Fast Day Switching */}
          <div className="flex flex-col gap-1.5 border-b border-line pb-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              <Calendar size={13} />
              <span>{t('ride.when_title')}</span>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
              {dayOptions.map((d, i) => {
                const active = schedDay === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setSchedDay(i);
                      setSchedTime('');
                    }}
                    className={cx(
                      'min-h-9 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors',
                      active
                        ? 'border-2 border-brand bg-brand-soft text-brand-ink'
                        : 'border border-line bg-card text-ink hover:border-line-strong'
                    )}
                  >
                    {dayLabel(d, i)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time Slots Content */}
          {timeOptions.length > 0 ? (
            <div className="flex flex-col gap-3">
              {/* Period Filter Tabs */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Waktu
                </span>
                <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar">
                  {/* All option */}
                  <button
                    type="button"
                    onClick={() => setActivePeriod('all')}
                    className={cx(
                      'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold transition-all',
                      activePeriod === 'all'
                        ? 'border-2 border-brand bg-brand text-white'
                        : 'border border-line bg-sunken text-ink hover:border-line-strong hover:bg-card'
                    )}
                  >
                    <span>{t('ride.period_all') || (lang === 'en' ? 'All' : 'Semua')}</span>
                    <span
                      className={cx(
                        'rounded-full px-1.5 py-0.2 font-mono text-[10.5px]',
                        activePeriod === 'all' ? 'bg-white/20 text-white' : 'bg-card text-ink-muted'
                      )}
                    >
                      {timeOptions.length}
                    </span>
                  </button>

                  {/* Individual Period Tabs */}
                  {periodDefs.map((p) => {
                    const count = slotsByPeriod[p.id]?.length || 0;
                    const isSelected = activePeriod === p.id;
                    const isDisabled = count === 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setActivePeriod(p.id)}
                        className={cx(
                          'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold transition-all',
                          isSelected
                            ? 'border-2 border-brand bg-brand text-white'
                            : isDisabled
                              ? 'border border-line/60 bg-sunken/50 text-ink-muted/30 cursor-not-allowed'
                              : 'border border-line bg-sunken text-ink hover:border-line-strong hover:bg-card'
                        )}
                      >
                        <span>{p.label}</span>
                        <span
                          className={cx(
                            'rounded-full px-1.5 py-0.2 font-mono text-[10.5px]',
                            isSelected
                              ? 'bg-white/20 text-white'
                              : isDisabled
                                ? 'bg-transparent text-ink-muted/30'
                                : 'bg-card text-ink-muted'
                          )}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slots Grid: either filtered by activePeriod, or sections if 'all' */}
              {activePeriod === 'all' ? (
                <div className="flex flex-col gap-4 pt-1">
                  {periodDefs.map((p) => {
                    const slots = slotsByPeriod[p.id];
                    if (!slots || slots.length === 0) return null;
                    return (
                      <div key={p.id} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-ink-muted">
                          <span className="text-[13px] font-bold text-ink">{p.label}</span>
                          <span className="font-mono text-[11.5px] text-ink-muted">{p.timeRange}</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {slots.map((d) => {
                            const val = timeKey(d);
                            const isSelected = schedTime === val;
                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() => handleSelectSlot(val)}
                                className={cx(
                                  'flex min-h-11 items-center justify-center rounded-control border font-mono text-[14px] transition-all',
                                  isSelected
                                    ? 'border-2 border-brand bg-brand text-white font-bold'
                                    : 'border-line bg-card text-ink hover:border-brand hover:bg-brand-soft/20 active:scale-95'
                                )}
                              >
                                {val}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink-muted">
                    <span className="text-[13px] font-bold text-ink">
                      {periodDefs.find((p) => p.id === activePeriod)?.label}
                    </span>
                    <span className="font-mono text-[11.5px] text-ink-muted">
                      {periodDefs.find((p) => p.id === activePeriod)?.timeRange}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {slotsByPeriod[activePeriod].map((d) => {
                      const val = timeKey(d);
                      const isSelected = schedTime === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleSelectSlot(val)}
                          className={cx(
                            'flex min-h-11 items-center justify-center rounded-control border font-mono text-[14px] transition-all',
                            isSelected
                              ? 'border-2 border-brand bg-brand text-white font-bold'
                              : 'border-line bg-card text-ink hover:border-brand hover:bg-brand-soft/20 active:scale-95'
                          )}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Empty State when no slots remain for current day */
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-ink-muted">
                <Clock size={24} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-[14px] font-bold text-ink">
                  {t('ride.no_time_today')}
                </p>
                <p className="text-xs text-ink-muted">
                  {t('ride.schedule_hint', { minutes: limits.minMinutes, days: limits.maxDays })}
                </p>
              </div>
              {dayOptions.length > 1 && schedDay === 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSchedDay(1);
                    setSchedTime('');
                  }}
                >
                  {t('ride.tomorrow')}
                </Button>
              )}
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}
