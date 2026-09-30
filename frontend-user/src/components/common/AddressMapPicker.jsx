import { useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import LocationAutocomplete from './LocationAutocomplete';
import SavedAddressPicker from './SavedAddressPicker';
import WiraMap from './WiraMap';
import { APP_CONFIG } from '../../config/app';
import { useTranslation } from '../../i18n';

const DEFAULT_CENTER = { lat: APP_CONFIG.defaultLocation.lat, lng: APP_CONFIG.defaultLocation.lng };

const reverseGeocode = async ({ lat, lng }) => {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
  const data = await res.json();
  return data?.display_name || null;
};

/**
 * Pick an address three ways: search (autocomplete), "use my location", or
 * by dragging the pin on a map. Search and drag keep the text and the point
 * in sync. `coords` stays null until the customer actually picks a point,
 * so callers can tell a real pin from the default map centre.
 */
export default function AddressMapPicker({
  id, label, placeholder, address, onAddressChange, coords, onCoordsChange,
  onNoteChange, markerType = 'dropoff', pinLabel,
}) {
  const { t } = useTranslation();
  const [locating, setLocating] = useState(false);

  const setPoint = async (latLng, { fillAddress = true } = {}) => {
    onCoordsChange(latLng);
    if (!fillAddress) return;
    try {
      const name = await reverseGeocode(latLng);
      if (name) onAddressChange(name);
    } catch (e) {
      console.error('Reverse geocode failed:', e);
    }
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      toast.error(t('location.unsupported'));
      return;
    }
    setLocating(true);
    const toastId = toast.loading(t('location.searching'));
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await setPoint({ lat: position.coords.latitude, lng: position.coords.longitude });
        toast.success(t('location.found'), { id: toastId });
        setLocating(false);
      },
      (error) => {
        let msg = t('location.failed');
        if (error.code === 1) msg = t('location.denied');
        else if (error.code === 2) msg = t('location.unavailable');
        else if (error.code === 3) msg = t('location.timeout');
        toast.error(msg, { id: toastId, duration: 6000 });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  const pin = coords || DEFAULT_CENTER;

  return (
    <div className="flex flex-col gap-2.5">
      {label && (
        <label htmlFor={id} className="-mb-1 text-[13px] font-semibold text-ink">
          {label}<span className="text-danger"> *</span>
        </label>
      )}
      <div className="relative z-10">
        <LocationAutocomplete
          id={id}
          placeholder={placeholder}
          icon={MapPin}
          iconColor={markerType === 'pickup' ? 'text-brand-ink' : 'text-danger'}
          value={address}
          onChange={onAddressChange}
          onSelect={(loc) => {
            onAddressChange(loc.fullAddress);
            onCoordsChange({ lat: loc.lat, lng: loc.lng });
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <SavedAddressPicker
          requireCoords={false}
          onSelect={({ address: a, lat, lng, note }) => {
            onAddressChange(a);
            if (lat != null && lng != null) onCoordsChange({ lat, lng });
            onNoteChange?.(note || '');
          }}
        />
        <button
          type="button"
          onClick={locateMe}
          disabled={locating}
          className="inline-flex min-h-11 items-center gap-1.5 text-[12.5px] font-semibold text-brand-ink hover:underline disabled:opacity-60"
        >
          <LocateFixed size={15} aria-hidden="true" /> {t('common.use_current_location')}
        </button>
      </div>

      <div className="h-44 overflow-hidden rounded-card border border-line">
        <WiraMap
          center={pin}
          zoom={coords ? 17 : 13}
          markers={[{ ...pin, type: markerType, label: pinLabel }]}
          onMarkerDragEnd={(_idx, latLng) => setPoint(latLng)}
        />
      </div>
      <p className="text-xs text-ink-muted">{t('common.map_pin_hint')}</p>
    </div>
  );
}
