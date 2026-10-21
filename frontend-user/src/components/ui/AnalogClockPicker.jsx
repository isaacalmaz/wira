import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Clock, Sun, Moon, Check } from 'lucide-react';
import Button from './Button';
import Notice from './Notice';
import { cx } from './cx';

/**
 * AnalogClockPicker
 * 
 * Tenun Laut compliant interactive radial clock picker.
 * 
 * Key Features & Visual Ergonomics:
 * 1. Synchronized Dial Geometry:
 *    - Center (CX, CY) = (128, 128), Radius R = 96px inside a 256x256 container.
 *    - Hand line connects pivot directly to target bulb center.
 *    - Selector bulb and active number share identical (targetX, targetY) coordinates,
 *      guaranteeing the selected numeral is 100% centered inside the brand bulb.
 * 2. Mobile & Touch Optimized:
 *    - Uses Pointer Events with setPointerCapture for smooth dragging without slip.
 *    - Touch-none container prevents scroll-trapping while adjusting time.
 *    - Auto-advance from hour to minute selection with tactile delay.
 * 3. Anti-Overflow Header:
 *    - Compact digital time readout in IBM Plex Mono (font-mono).
 *    - Concise AM/PM switcher ('Pagi' / 'Malam' or 'AM' / 'PM') that never clips or triggers horizontal scrollbars.
 * 4. Responsive & Accessible:
 *    - Fully responsive across phone and desktop Sheet modals.
 *    - Visual disabled states for out-of-range hours.
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
  const autoAdvanceTimer = useRef(null);

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

  // Cleanup auto-advance timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    };
  }, []);

  // Notify parent on change
  const notifyChange = useCallback((h, m) => {
    const timeStr = `${pad(h)}:${pad(m)}`;
    if (onChange) onChange(timeStr);
  }, [onChange]);

  // Mode switch handler with timer cancellation
  const switchMode = (mode) => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    setViewMode(mode);
  };

  // Handle switching period (AM <-> PM)
  const handlePeriodChange = (newPeriod) => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
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

  // Dial Geometry Constants: 256x256 container
  const CX = 128;
  const CY = 128;
  const R = 96;

  // Convert angle (degrees from 12 o'clock clockwise) to Cartesian (x, y)
  const getCoordinates = useCallback((deg, radius = R) => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: Math.round(CX + radius * Math.sin(rad)),
      y: Math.round(CY - radius * Math.cos(rad)),
    };
  }, [CX, CY, R]);

  // 12-hour and minute dial configurations
  const hourNumbers = useMemo(() => [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], []);
  const minuteNumbers = useMemo(() => [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], []);

  // Check if a specific hour is disabled
  const isHourDisabled = useCallback((displayH) => {
    const h24 = period === 'PM' ? (displayH === 12 ? 12 : displayH + 12) : (displayH === 12 ? 0 : displayH);
    const [minH] = (minTime || '00:00').split(':').map(Number);
    const [maxH] = (maxTime || '23:59').split(':').map(Number);
    return h24 < minH || h24 > maxH;
  }, [period, minTime, maxTime]);

  // Active target coordinate calculation
  const targetPos = useMemo(() => {
    const angle = viewMode === 'hour' ? (hour % 12) * 30 : minute * 6;
    return getCoordinates(angle);
  }, [viewMode, hour, minute, getCoordinates]);

  // Convert client coordinate to angle & value
  const handlePointer = useCallback((clientX, clientY, isEnd = false) => {
    if (!clockRef.current) return;
    const rect = clockRef.current.getBoundingClientRect();
    const clockCx = rect.left + rect.width / 2;
    const clockCy = rect.top + rect.height / 2;
    const dx = clientX - clockCx;
    const dy = clientY - clockCy;

    // Angle from 12 o'clock in degrees [0, 360)
    let rad = Math.atan2(dx, -dy);
    if (rad < 0) rad += 2 * Math.PI;
    const deg = (rad * 180) / Math.PI;

    if (viewMode === 'hour') {
      let rawH = Math.round(deg / 30);
      if (rawH === 0) rawH = 12;
      const h24 = period === 'PM' ? (rawH === 12 ? 12 : rawH + 12) : (rawH === 12 ? 0 : rawH);

      // Min/Max bound check
      const [minH] = (minTime || '00:00').split(':').map(Number);
      const [maxH] = (maxTime || '23:59').split(':').map(Number);
      if (h24 < minH || h24 > maxH) return;

      setHour(h24);
      notifyChange(h24, minute);

      if (isEnd) {
        if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
        autoAdvanceTimer.current = setTimeout(() => {
          setViewMode('minute');
        }, 250);
      }
    } else {
      // Minute mode
      let rawM = Math.round(deg / 6);
      if (rawM >= 60) rawM = 0;

      if (stepMinutes > 1) {
        rawM = Math.round(rawM / stepMinutes) * stepMinutes;
        if (rawM >= 60) rawM = 0;
      }

      setMinute(rawM);
      notifyChange(hour, rawM);
    }
  }, [viewMode, period, hour, minute, minTime, maxTime, stepMinutes, notifyChange]);

  const onPointerDown = (e) => {
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    handlePointer(e.clientX, e.clientY, false);
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    handlePointer(e.clientX, e.clientY, false);
  };

  const onPointerUp = (e) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    handlePointer(e.clientX, e.clientY, true);
  };

  // Check if currently selected time clashes with busy bookings
  const isClash = isSlotClashing ? isSlotClashing(currentFormatted) : false;

  // Concise period labels
  const amLabel = t ? t('asuh.period_am') || (lang === 'en' ? 'AM' : 'Pagi') : (lang === 'en' ? 'AM' : 'Pagi');
  const pmLabel = t ? t('asuh.period_pm') || (lang === 'en' ? 'PM' : 'Malam') : (lang === 'en' ? 'PM' : 'Malam');

  // Currently displayed hour number on 12-hour face
  const currentDisplayH = hour % 12 === 0 ? 12 : hour % 12;

  return (
    <div className="flex flex-col items-center gap-4 py-1 select-none w-full max-w-sm mx-auto overflow-hidden">
      
      {/* 1. Digital Display Header & Period Switcher */}
      <div className="flex items-center justify-between w-full px-1 gap-2">
        {/* Digital Time Readout */}
        <div className="flex items-center gap-1 font-mono">
          <button
            type="button"
            onClick={() => switchMode('hour')}
            className={cx(
              'px-3 py-1.5 rounded-control text-2xl font-bold transition-all',
              viewMode === 'hour'
                ? 'border-2 border-brand bg-brand-soft text-brand-ink shadow-sm'
                : 'border border-line bg-card text-ink hover:border-line-strong'
            )}
            aria-label="Pilih jam"
          >
            {pad(hour)}
          </button>
          <span className="text-xl font-bold text-ink-muted select-none">:</span>
          <button
            type="button"
            onClick={() => switchMode('minute')}
            className={cx(
              'px-3 py-1.5 rounded-control text-2xl font-bold transition-all',
              viewMode === 'minute'
                ? 'border-2 border-brand bg-brand-soft text-brand-ink shadow-sm'
                : 'border border-line bg-card text-ink hover:border-line-strong'
            )}
            aria-label="Pilih menit"
          >
            {pad(minute)}
          </button>
          <span className="text-[11px] font-bold text-ink-muted ml-0.5 uppercase tracking-wide select-none">WITA</span>
        </div>

        {/* Period Selector (Pagi vs Malam / AM vs PM) */}
        <div className="flex bg-sunken p-1 rounded-control border border-line text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => handlePeriodChange('AM')}
            className={cx(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] transition-all',
              period === 'AM'
                ? 'bg-card text-brand-ink font-bold shadow-sm border border-brand/20'
                : 'text-ink-muted hover:text-ink'
            )}
            aria-label="Pagi (AM)"
          >
            <Sun size={13} aria-hidden="true" />
            <span>{amLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => handlePeriodChange('PM')}
            className={cx(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] transition-all',
              period === 'PM'
                ? 'bg-card text-brand-ink font-bold shadow-sm border border-brand/20'
                : 'text-ink-muted hover:text-ink'
            )}
            aria-label="Malam (PM)"
          >
            <Moon size={13} aria-hidden="true" />
            <span>{pmLabel}</span>
          </button>
        </div>
      </div>

      {/* Mode Subtitle Label */}
      <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
        <Clock size={14} className="text-brand-ink" aria-hidden="true" />
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
        onPointerCancel={onPointerUp}
        className="relative w-64 h-64 rounded-full border border-line-strong bg-sunken/60 shadow-inner flex items-center justify-center cursor-pointer touch-none select-none my-1"
      >
        {/* SVG Decorative & Geometric Layer */}
        <svg viewBox="0 0 256 256" className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <filter id="clock-bulb-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.28" floodColor="rgb(var(--brand))" />
            </filter>
          </defs>

          {/* Delicate concentric track ring at R = 96 */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="3 3"
            className="text-line/60"
          />

          {/* 12 Outer Perimeter Tick Dots */}
          {Array.from({ length: 12 }).map((_, i) => {
            const rad = (i * 30 * Math.PI) / 180;
            const tickR = 114;
            const tx = Math.round(CX + tickR * Math.sin(rad));
            const ty = Math.round(CY - tickR * Math.cos(rad));
            return (
              <circle
                key={i}
                cx={tx}
                cy={ty}
                r={i % 3 === 0 ? 2 : 1.2}
                className={i % 3 === 0 ? 'fill-ink-muted/50' : 'fill-ink-muted/25'}
              />
            );
          })}

          {/* Hand Line connecting Pivot (CX, CY) directly to Bulb Center (targetPos.x, targetPos.y) */}
          <line
            x1={CX}
            y1={CY}
            x2={targetPos.x}
            y2={targetPos.y}
            stroke="rgb(var(--brand))"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{
              transition: isDragging ? 'none' : 'x2 150ms ease-out, y2 150ms ease-out',
            }}
          />

          {/* Hand Selector Bulb (Circular Knob at exact radius R = 96) */}
          <circle
            cx={targetPos.x}
            cy={targetPos.y}
            r="18"
            fill="rgb(var(--brand))"
            filter="url(#clock-bulb-shadow)"
            style={{
              transition: isDragging ? 'none' : 'cx 150ms ease-out, cy 150ms ease-out',
            }}
          />
          <circle
            cx={targetPos.x}
            cy={targetPos.y}
            r="18"
            fill="none"
            stroke="rgba(255, 255, 255, 0.25)"
            strokeWidth="1.5"
            style={{
              transition: isDragging ? 'none' : 'cx 150ms ease-out, cy 150ms ease-out',
            }}
          />

          {/* Center Pivot Point */}
          <circle cx={CX} cy={CY} r="5" fill="rgb(var(--brand))" />
          <circle cx={CX} cy={CY} r="2" fill="rgb(var(--card))" />
        </svg>

        {/* Selected Number inside Bulb (Guaranteed 100% Centered) */}
        <div
          style={{
            left: `${targetPos.x}px`,
            top: `${targetPos.y}px`,
            transition: isDragging ? 'none' : 'left 150ms ease-out, top 150ms ease-out',
          }}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center font-mono text-[13px] font-bold text-white z-20 pointer-events-none select-none"
        >
          {viewMode === 'hour' ? currentDisplayH : pad(minute)}
        </div>

        {/* Dial Face Static Numbers */}
        {viewMode === 'hour' ? (
          hourNumbers.map((num) => {
            const angle = (num % 12) * 30;
            const { x, y } = getCoordinates(angle);
            const isSelected = currentDisplayH === num;
            const disabled = isHourDisabled(num);

            return (
              <div
                key={num}
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                }}
                className={cx(
                  'absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center font-mono text-[13px] font-bold select-none pointer-events-none transition-opacity duration-150',
                  isSelected
                    ? 'opacity-0' // Active number rendered by bulb above
                    : disabled
                    ? 'text-ink-muted/30 font-medium'
                    : 'text-ink'
                )}
              >
                {num}
              </div>
            );
          })
        ) : (
          minuteNumbers.map((num) => {
            const angle = num * 6;
            const { x, y } = getCoordinates(angle);
            const isSelected = minute === num;
            const isPrimaryStep = stepMinutes > 1 ? num % stepMinutes === 0 : true;

            return (
              <div
                key={num}
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                }}
                className={cx(
                  'absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center font-mono select-none pointer-events-none transition-opacity duration-150',
                  isSelected
                    ? 'opacity-0' // Active minute rendered by bulb above
                    : isPrimaryStep
                    ? 'text-ink font-bold text-[13px]'
                    : 'text-ink-muted/50 font-medium text-[11.5px]'
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
        <Notice tone="warning" className="w-full text-xs">
          {t ? t('asuh.slot_booked') : 'Pengasuh sudah memiliki jadwal pada jam ini.'}
        </Notice>
      )}

      {/* 4. Action Confirmation Button */}
      {onConfirm && (
        <Button
          variant="primary"
          block
          size="md"
          leftIcon={<Check size={16} />}
          onClick={() => onConfirm(currentFormatted)}
          className="w-full font-bold mt-1"
        >
          {lang === 'en' ? `Choose ${currentFormatted} WITA` : `Pilih Pukul ${currentFormatted} WITA`}
        </Button>
      )}

    </div>
  );
}
