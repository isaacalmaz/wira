import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { Bookmark, Home, Briefcase, MapPin, ChevronDown } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { cx } from '../ui';

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
  const { t } = useTranslation();
  const [addresses, setAddresses] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('saved_addresses')
      .select('id, label, address, lat, lng, is_primary, note')
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
    <div className={cx('relative', className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="-mx-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-1.5 text-[12.5px] font-semibold text-brand-ink transition-colors hover:bg-brand-soft"
      >
        <Bookmark size={14} aria-hidden="true" />
        <span>{t('common.saved_addresses')}</span>
        <ChevronDown size={14} aria-hidden="true" className={cx('transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-[500] mt-1 max-h-60 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-card border border-line bg-card py-1 shadow-pop">
          {addresses.map((a) => {
            const Icon = LABEL_ICON[a.label?.toLowerCase()] || MapPin;
            const usable = !requireCoords || (a.lat != null && a.lng != null);
            return (
              <button
                key={a.id}
                type="button"
                disabled={!usable}
                onClick={() => {
                  onSelect({ address: a.address, lat: a.lat, lng: a.lng, label: a.label, note: a.note || '' });
                  setIsOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-45"
                title={usable ? undefined : t('common.saved_address_no_coords')}
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-brand-line bg-brand-soft text-brand-ink">
                  <Icon size={15} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[13.5px] font-semibold text-ink">{a.label}</span>
                  <span className="truncate text-xs text-ink-muted">{a.address}</span>
                  {a.note && <span className="truncate text-xs text-ink-muted">{t('address_note.landmark')}: {a.note}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
