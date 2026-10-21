import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Clock, Sun, Moon, Check } from 'lucide-react';
import { Button, cx } from './index';

/**
 * AnalogClockPicker
 * 
 * Tenun Laut compliant interactive radial clock picker.
 * Solves:
 * - Natural analog clock face with fluid hour & minute hands
 * - Touch & drag friendly on mobile with pointer events
 * - Clear 12-hour face with Pagi (AM) vs Siang/Malam (PM) toggle
 * - Tabular IBM Plex Mono digital time readout with mode switching
 * - Visual disabled state for out-of-range hours/minutes
 * - Auto-advance from hour selection to minute selection
 */
export default function AnalogClockPicker({
  value = '09:00',
  onChange,
  onConfirm,
  minTime = '06:00',
  maxTime = '21:00',
  stepMinutes = 15,
  isSlotClashing,
  t,
  lang = 'id',
}) {
  // Parse initial value (HH:mm)
  const [initH, initM] = useMemo(() => {
    const parts = (value || '09:00').split(':');
    const h = parseInt(parts[0], 10) || 9;
    const m = parseInt(parts[1], 10) || 0;
    return [h, m];
  }, [value]);

  const [hour, setHour] = useState(initH);
  const [minute, setMinute] = useState(initM);
  const [viewMode, setViewMode] = useState('hour'); // 'hour' | 'minute'
  const [isDragging, setIsDragging] = useState(false);
  const clockRef = useRef(null);

  // Period: 'AM' (00-11) or 'PM' (12-23)
  const period = hour >= 12 ? 'PM' : 'AM';

  // Format 2-digit
  const pad = (n) => String(n).padStart(2, '0');
  const currentFormatted = `${pad(hour)}:${pad(minute)}`;

  // Sync internal state if value prop changes externally
  useEffect(() => {
    const parts = (value || '09:00').split(':');
    const h = parseInt(parts[0], 10) || 9;
    const m = parseInt(parts[1], 10) || 0;
    setHour(h);
    setMinute(m);
  }, [value]);

  // Notify parent on change
  const notifyChange = useCallback((h, m) => {
    const timeStr = `${pad(h)}:${pad(m)}`;
    if (onChange) onChange(timeStr);
  }, [onChange]);

  // Handle switching period (AM <-> PM)
  const handlePeriodChange = (newPeriod) => {
    let nextH = hour;
    if (newPeriod === 'PM' && hour < 12) {
      nextH = hour + 12;
    } else if (newPeriod === 'AM' && hour >= 12) {
      nextH = hour - 12;
    }

    // Min/Max bounds check
    const [minH] = (minTime || '00:00').split(':').map(Number);
    const [maxH] = (maxTime || '23:59').split(':').map(Number);
    if (nextH < minH) nextH = minH;
    if (nextH > maxH) nextH = maxH;

    setHour(nextH);
    notifyChange(nextH, minute);
  };

  // Convert client coordinate to angle & value
  const handlePointerEvent = useCallback((e, isEnd = false) => {
    if (!clockRef.current) return;
    const rect = clockRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    // Angle from 12 o'clock in radians
    let rad = Math.atan2(dx, -dy);
    if (rad < 0) rad += 2 * Math.PI;
    const deg = (rad * 180) / Math.PI;

    if (viewMode === 'hour') {
      let rawH = Math.round(deg / 30);
      if (rawH === 0) rawH = 12;
      const h24 = period === 'PM' ? (rawH === 12 ? 12 : rawH + 12) : (rawH === 12 ? 0 : rawH);

      // Check min/max
      const [minH] = (minTime || '00:00').split(':').map(Number);
      const [maxH] = (maxTime || '23:59').split(':').map(Number);
      if (h24 < minH || h24 > maxH) return;

      setHour(h24);
      notifyChange(h24, minute);

      if (isEnd) {
        // Auto transition to minute selection
        setTimeout(() => setViewMode('minute'), 200);
      }
    } else {
      // Minute mode
      let rawM = Math.round(deg / 6);
      if (rawM === 60) rawM = 0;

      if (stepMinutes > 1) {
        rawM = Math.round(rawM / stepMinutes) * stepMinutes;
        if (rawM === 60) rawM = 0;
      }

      setMinute(rawM);
      notifyChange(hour, rawM);
    }
  }, [viewMode, period, hour, minute, minTime, maxTime, stepMinutes, notifyChange]);

  const onPointerDown = (e) => {
    setIsDragging(true);
    handlePointerEvent(e, false);
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    handlePointerEvent(e, false);
  };

  const onPointerUp = (e) => {
    if (!isDragging) return;
    setIsDragging(false);
    handlePointerEvent(e, true);
  };

  // 12-hour face positions (1 to 12)
  const hourNumbers = useMemo(() => [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], []);
  const minuteNumbers = useMemo(() => [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], []);

  // Compute hand angle
  const handAngle = useMemo(() => {
    if (viewMode === 'hour') {
      const displayH = hour % 12;
      return displayH * 30;
    }
    return minute * 6;
  }, [viewMode, hour, minute]);

  // Check if a specific hour is disabled
  const isHourDisabled = (displayH) => {
    const h24 = period === 'PM' ? (displayH === 12 ? 12 : displayH + 12) : (displayH === 12 ? 0 : displayH);
    const [minH] = (minTime || '00:00').split(':').map(Number);
    const [maxH] = (maxTime || '23:59').split(':').map(Number);
    return h24 < minH || h24 > maxH;
  };

  // Check if currently selected time clashes with busy bookings
  const isClash = isSlotClashing ? isSlotClashing(currentFormatted) : false;

  return (
    <div className="flex flex-col items-center gap-4 py-2 select-none w-full max-w-sm mx-auto">
      
      {/* 1. Digital Display Header & Period Switcher */}
      <div className="flex items-center justify-between w-full px-2 gap-3">
        {/* Digital Time Readout */}
        <div className="flex items-center gap-1.5 font-mono">
          <button
            type="button"
            onClick={() => setViewMode('hour')}
            className={cx(
              'px-3.5 py-1.5 rounded-control text-2xl font-bold transition-all',
              viewMode === 'hour'
                ? 'border-2 border-brand bg-brand-soft text-brand-ink shadow-sm'
                : 'border border-line bg-card text-ink hover:border-line-strong'
            )}
          >
            {pad(hour)}
          </button>
          <span className="text-xl font-bold text-ink-muted">:</span>
          <button
            type="button"
            onClick={() => setViewMode('minute')}
            className={cx(
              'px-3.5 py-1.5 rounded-control text-2xl font-bold transition-all',
              viewMode === 'minute'
                ? 'border-2 border-brand bg-brand-soft text-brand-ink shadow-sm'
                : 'border border-line bg-card text-ink hover:border-line-strong'
            )}
          >
            {pad(minute)}
          </button>
          <span className="text-xs font-semibold text-ink-muted ml-1 uppercase">WITA</span>
        </div>

        {/* Period Selector (Pagi vs Siang/Malam) */}
        <div className="flex bg-sunken p-1 rounded-control border border-line text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => handlePeriodChange('AM')}
            className={cx(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] transition-all',
              period === 'AM'
                ? 'bg-card text-brand-ink font-bold shadow-sm'
                : 'text-ink-muted hover:text-ink'
            )}
          >
            <Sun size={13} aria-hidden="true" />
            <span>{t ? t('asuh.period_morning') || 'Pagi' : 'Pagi'}</span>
          </button>
          <button
            type="button"
            onClick={() => handlePeriodChange('PM')}
            className={cx(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] transition-all',
              period === 'PM'
                ? 'bg-card text-brand-ink font-bold shadow-sm'
                : 'text-ink-muted hover:text-ink'
            )}
          >
            <Moon size={13} aria-hidden="true" />
            <span>{t ? t('asuh.period_afternoon') || 'Siang/Malam' : 'Siang/Malam'}</span>
          </button>
        </div>
      </div>

      {/* Mode Subtitle Label */}
      <div className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
        <Clock size={14} className="text-brand-ink" />
        <span>
          {viewMode === 'hour'
            ? (lang === 'en' ? 'Tap or drag to pick hour' : 'Sentuh atau putar untuk memilih jam')
            : (lang === 'en' ? 'Tap or drag to pick minutes' : 'Sentuh atau putar untuk memilih menit')}
        </span>
      </div>

      {/* 2. Interactive Analog Clock Face */}
      <div
        ref={clockRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative w-64 h-64 rounded-full border border-line-strong bg-sunken/80 shadow-inner flex items-center justify-center cursor-pointer touch-none"
      >
        {/* Subtle center crosshair / ring decoration */}
        <div className="absolute w-48 h-48 rounded-full border border-line/40 pointer-events-none" />

        {/* Center Pivot Point */}
        <div className="absolute w-3.5 h-3.5 rounded-full bg-brand shadow-sm z-20 pointer-events-none" />

        {/* Clock Hand Pointer */}
        <div
          className="absolute top-1/2 left-1/2 origin-top -translate-x-1/2 z-10 pointer-events-none transition-transform duration-100 ease-out"
          style={{
            height: '92px',
            transform: `rotate(${handAngle + 180}deg)`,
          }}
        >
          {/* Hand Line */}
          <div className="w-0.5 h-full bg-brand mx-auto" />
          
          {/* Hand Tip Selector Knob */}
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-brand text-white font-mono font-bold flex items-center justify-center text-sm shadow-md" />
        </div>

        {/* Render Numbers on Dial */}
        {viewMode === 'hour' ? (
          hourNumbers.map((num) => {
            const angle = num * 30; // 30 deg per hour
            const rad = (angle * Math.PI) / 180;
            const r = 94; // radius
            const x = Math.round(r * Math.sin(rad));
            const y = Math.round(-r * Math.cos(rad));
            const isSelected = (hour % 12 === 0 ? 12 : hour % 12) === num;
            const disabled = isHourDisabled(num);

            return (
              <div
                key={num}
                style={{
                  transform: `translate(${x}px, ${y}px)`,
                }}
                className={cx(
                  'absolute w-8 h-8 rounded-full flex items-center justify-center font-mono text-[13px] font-bold transition-colors pointer-events-none',
                  isSelected
                    ? 'text-white z-20'
                    : disabled
                    ? 'text-ink-muted/30'
                    : 'text-ink'
                )}
              >
                {num}
              </div>
            );
          })
        ) : (
          minuteNumbers.map((num) => {
            const angle = num * 6; // 6 deg per minute
            const rad = (angle * Math.PI) / 180;
            const r = 94;
            const x = Math.round(r * Math.sin(rad));
            const y = Math.round(-r * Math.cos(rad));
            const isSelected = minute === num;

            return (
              <div
                key={num}
                style={{
                  transform: `translate(${x}px, ${y}px)`,
                }}
                className={cx(
                  'absolute w-8 h-8 rounded-full flex items-center justify-center font-mono text-[12.5px] font-bold transition-colors pointer-events-none',
                  isSelected
                    ? 'text-white z-20'
                    : 'text-ink'
                )}
              >
                {pad(num)}
              </div>
            );
          })
        )}
      </div>

      {/* 3. Clash Warning Notice (Jika jadwal sudah terisi) */}
      {isClash && (
        <div className="w-full rounded-control border border-warning-line bg-warning-soft p-2.5 text-xs text-warning-ink font-medium text-center">
          ⚠️ {t ? t('asuh.slot_booked') : 'Pengasuh sudah memiliki jadwal pada jam ini.'}
        </div>
      )}

      {/* 4. Action Confirmation Button */}
      {onConfirm && (
        <Button
          variant="primary"
          block
          size="md"
          leftIcon={<Check size={16} />}
          onClick={() => onConfirm(currentFormatted)}
          className="mt-1 font-bold"
        >
          {lang === 'en' ? `Choose ${currentFormatted} WITA` : `Pilih Pukul ${currentFormatted} WITA`}
        </Button>
      )}

    </div>
  );
}
