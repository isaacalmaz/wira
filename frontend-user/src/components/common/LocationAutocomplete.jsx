import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Search } from 'lucide-react';

export default function LocationAutocomplete({ placeholder, icon: Icon, iconColor, value, onChange, onSelect }) {
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

  return (
    <div className="relative">
      <div className="flex items-center gap-2.5 relative z-10">
        <div className={`w-6 flex justify-center ${iconColor}`}>
          <Icon size={18} />
        </div>
        <div className="relative flex-1">
          <input
            type="text"
            placeholder={placeholder}
            className="w-full bg-slate-50 dark:bg-slate-800 border-0 rounded-xl p-2 text-xs sm:text-sm focus:ring-2 focus:ring-primary dark:text-white pr-8"
            value={query}
            onChange={handleInputChange}
            onFocus={() => { if (query.length > 2) setShowDropdown(true); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)} // delay agar onClick item sempat tereksekusi
          />
          {isLoading && (
            <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-slate-300 border-t-primary rounded-full animate-spin"></div>
          )}
        </div>
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute top-full left-8 right-0 mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 max-h-48 overflow-y-auto z-50">
          {suggestions.map((item, idx) => (
            <div
              key={idx}
              className="p-3 border-b border-slate-50 dark:border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer flex gap-2 items-start"
              onClick={() => handleSelect(item)}
            >
              <Search size={14} className="text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{item.display_name.split(',')[0]}</p>
                <p className="text-[10px] text-slate-500 line-clamp-1">{item.display_name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
