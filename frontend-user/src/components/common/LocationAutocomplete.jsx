import { useState, useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';
import { cx, Spinner } from '../ui';

/**
 * Address search backed by Nominatim.
 * `variant`: 'field' (default, matches the UI kit Input) or 'bare' (sunken,
 * borderless, for the ride search card where a pickup/destination marker
 * sits beside it). `icon` + `iconColor` are optional; pass nothing to render
 * the input alone. `label` becomes the input's accessible name.
 */
export default function LocationAutocomplete({ placeholder, icon: Icon, iconColor = 'text-ink-muted', value, onChange, onSelect, variant = 'field', label, id }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const searchLocations = async (searchText) => {
    if (!searchText || searchText.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      // Menggunakan viewbox untuk membatasi pencarian area Lombok/Mataram
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchText)}&viewbox=115.8,-8.2,116.6,-9.0&countrycodes=id&limit=5`);
      const data = await res.json();
      setSuggestions(data || []);
    } catch (e) {
      console.error('Nominatim error', e);
    }
    setIsLoading(false);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    setShowDropdown(true);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      searchLocations(val);
    }, 800); // Debounce 800ms mematuhi aturan limit Nominatim
  };

  const handleSelect = (item) => {
    const locName = item.display_name.split(',')[0]; // Ambil nama jalan/tempat depannya saja
    setQuery(locName);
    onChange(locName);
    setShowDropdown(false);

    if (onSelect) {
      onSelect({
        name: locName,
        fullAddress: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon)
      });
    }
  };

  const inputCls = variant === 'bare'
    ? 'border-transparent bg-sunken focus:bg-card'
    : 'border-line-strong bg-card';

  return (
    <div className="relative">
      <div className="relative z-10 flex items-center gap-2.5">
        {Icon && (
          <span className={cx('flex w-6 shrink-0 justify-center', iconColor)} aria-hidden="true">
            <Icon size={18} />
          </span>
        )}
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type="text"
            placeholder={placeholder}
            aria-label={label || placeholder}
            autoComplete="off"
            className={cx(
              'block min-h-11 w-full truncate rounded-control border px-3.5 py-2.5 pr-10 text-[14px] text-ink placeholder:text-ink-muted/80 transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20',
              inputCls,
            )}
            value={query}
            onChange={handleInputChange}
            onFocus={() => { if (query.length > 2) setShowDropdown(true); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)} // delay agar onClick item sempat tereksekusi
          />
          {isLoading && (
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-ink">
              <Spinner size={16} />
            </span>
          )}
        </div>
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-card border border-line bg-card py-1 shadow-pop">
          {suggestions.map((item, idx) => (
            <button
              key={idx}
              type="button"
              className="flex min-h-11 w-full items-start gap-3 border-b border-line px-3.5 py-3 text-left transition-colors last:border-0 hover:bg-sunken"
              onClick={() => handleSelect(item)}
            >
              <MapPin size={17} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[14px] font-semibold text-ink">{item.display_name.split(',')[0]}</span>
                <span className="line-clamp-2 text-xs leading-snug text-ink-muted">{item.display_name}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
