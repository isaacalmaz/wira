import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { Bookmark, Home, Briefcase, MapPin, ChevronDown } from 'lucide-react';

const LABEL_ICON = { rumah: Home, home: Home, kantor: Briefcase, office: Briefcase };

/**
 * A small dropdown of the logged-in customer's saved addresses
 * (public.saved_addresses, migrations/0038) - lets a checkout screen fill
 * in an address field with one tap instead of retyping/re-picking on the
 * map every time. Shared across RidePage.jsx (pickup + dropoff),
 * SendPage.jsx (sender/receiver), and RestaurantPage.jsx (delivery
 * address) rather than duplicating the fetch/render logic three times.
 *
 * Silently renders nothing (not an error state) for a logged-out user or
 * one with zero saved addresses yet - this is a convenience shortcut, not
 * a required step, and every one of these checkout flows already has its
 * own primary way to enter an address (autocomplete search / map pin).
 */
export default function SavedAddressPicker({ onSelect, className = '', requireCoords = true }) {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('saved_addresses')
      .select('id, label, address, lat, lng, is_primary')
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('SavedAddressPicker: fetch failed', error.message);
          return;
        }
        setAddresses(data || []);
      });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!isOpen) return;
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isOpen]);

  if (!user || addresses.length === 0) return null;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-bold text-primary hover:text-primary-dark"
      >
        <Bookmark size={12} /> Alamat Tersimpan <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-[500] mt-1.5 w-64 max-h-56 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5">
          {addresses.map((a) => {
            const Icon = LABEL_ICON[a.label?.toLowerCase()] || MapPin;
            const usable = !requireCoords || (a.lat != null && a.lng != null);
            return (
              <button
                key={a.id}
                type="button"
                disabled={!usable}
                onClick={() => {
                  onSelect({ address: a.address, lat: a.lat, lng: a.lng, label: a.label });
                  setIsOpen(false);
                }}
                className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                title={usable ? undefined : 'Alamat ini belum punya koordinat tersimpan'}
              >
                <Icon size={14} className="text-primary mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-800 dark:text-white truncate">{a.label}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{a.address}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
