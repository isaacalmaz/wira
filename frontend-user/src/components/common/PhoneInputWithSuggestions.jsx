import { useState, useRef, useEffect } from 'react';
import { ChevronDown, User, Bookmark } from 'lucide-react';
import { Input, cx } from '../ui';
import { useTranslation } from '../../i18n';

/**
 * Phone input with an embedded dropdown inside the column for quick selection
 * of the user's personal phone number or phone numbers from saved addresses.
 */
export default function PhoneInputWithSuggestions({
  id,
  value = '',
  onChange,
  onSelectSuggestion,
  userProfile,
  savedAddresses = [],
  placeholder,
  required = false,
  className = '',
  autoComplete = 'tel',
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Filter saved addresses that have a valid phone number different from userProfile phone
  const addressPhones = (savedAddresses || []).filter(
    (a) => a.phone && a.phone.trim() && (!userProfile?.phone || a.phone.trim() !== userProfile.phone.trim())
  );

  const hasSuggestions = Boolean(userProfile?.phone || addressPhones.length > 0);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close dropdown on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelect = (phone, name) => {
    onChange(phone);
    if (onSelectSuggestion) {
      onSelectSuggestion({ phone, name });
    }
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <Input
        ref={inputRef}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (hasSuggestions && !value.trim()) {
            setIsOpen(true);
          }
        }}
        className={cx('font-mono placeholder:font-sans', hasSuggestions && 'pr-9', className)}
        required={required}
      />

      {hasSuggestions && (
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          tabIndex={-1}
          aria-expanded={isOpen}
          aria-label={t('send.suggestions_label')}
          className="absolute right-1 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-sunken hover:text-ink focus:outline-none"
        >
          <ChevronDown
            size={16}
            className={cx('transition-transform duration-200', isOpen && 'rotate-180 text-brand')}
            aria-hidden="true"
          />
        </button>
      )}

      {isOpen && hasSuggestions && (
        <div className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-control border border-line bg-card py-1 shadow-pop animate-in fade-in-50 zoom-in-95 duration-100">
          {/* User profile phone */}
          {userProfile?.phone && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(userProfile.phone, userProfile.name);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-brand-soft"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
                <User size={14} aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center justify-between text-[13px] font-semibold text-ink">
                  <span>{t('send.use_my_phone')}</span>
                  <span className="text-[11px] font-medium text-brand-ink">{t('send.my_phone')}</span>
                </span>
                <span className="font-mono text-xs text-ink-muted truncate">
                  {userProfile.phone}
                  {userProfile.name ? ` • ${userProfile.name}` : ''}
                </span>
              </span>
            </button>
          )}

          {/* Saved address phones */}
          {addressPhones.length > 0 && (
            <>
              {userProfile?.phone && <div className="my-1 border-t border-line/60" />}
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                {t('send.from_saved_address')}
              </div>
              {addressPhones.map((addr) => (
                <button
                  key={addr.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(addr.phone);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-sunken"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-muted">
                    <Bookmark size={13} aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13px] font-semibold text-ink truncate">{addr.label}</span>
                    <span className="font-mono text-xs text-ink-muted truncate">{addr.phone}</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
