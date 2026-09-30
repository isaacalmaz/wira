import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import { useNavigate } from 'react-router-dom';
import WiraMap from '../components/common/WiraMap';
import LocationAutocomplete from '../components/common/LocationAutocomplete';
import { toast } from 'react-hot-toast';
import { MapPin, Plus, Trash2, Home, Briefcase, Star, LocateFixed } from 'lucide-react';
import { Button, Card, EmptyState, Field, IconTile, Input, PageHeader, Sheet, Spinner } from '../components/ui';
import { APP_CONFIG } from '../config/app';
import { useTranslation } from '../i18n';

const DEFAULT_COORDS = { lat: APP_CONFIG.defaultLocation.lat, lng: APP_CONFIG.defaultLocation.lng };

export default function SavedAddressesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    label: '',
    note: '',
    address: '',
    lat: DEFAULT_COORDS.lat,
    lng: DEFAULT_COORDS.lng
  });
  // Tracks whether lat/lng below have actually been set from a real user
  // action (memilih saran alamat, menggeser pin di peta, atau "Gunakan
  // Lokasi Saat Ini") - sebelumnya lat/lng SELALU diinisialisasi ke
  // DEFAULT_COORDS dan tidak pernah diperbarui dari input pengguna, jadi
  // setiap alamat tersimpan mendapat koordinat yang sama persis terlepas
  // dari alamat aslinya. Dipakai untuk memperingatkan pengguna sebelum
  // menyimpan koordinat default yang belum tentu benar.
  const [hasPickedLocation, setHasPickedLocation] = useState(false);

  const fetchAddresses = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('saved_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setAddresses(data || []);
    } catch (err) {
      console.error("Error fetching addresses:", err);
      toast.error(t('addresses.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddresses();
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.label || !formData.address) {
      toast.error(t('addresses.required'));
      return;
    }
    if (!hasPickedLocation) {
      toast.error(t('addresses.need_point'));
      return;
    }

    try {
      const { data, error } = await supabase
        .from('saved_addresses')
        .insert([{
          user_id: user.id,
          label: formData.label,
          address: formData.address,
          lat: formData.lat,
          lng: formData.lng,
          note: formData.note.trim() || null,
        }])
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Blocked by RLS');

      toast.success(t('addresses.saved'));
      setIsModalOpen(false);
      setFormData({ label: '', address: '', note: '', lat: DEFAULT_COORDS.lat, lng: DEFAULT_COORDS.lng });
      setHasPickedLocation(false);
      fetchAddresses();
    } catch (err) {
      console.error('Error saving address:', err);
      toast.error(t('addresses.save_failed'));
    }
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      toast.error(t('location.unsupported'));
      return;
    }
    const toastId = toast.loading(t('location.searching'));
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latLng = { lat: position.coords.latitude, lng: position.coords.longitude };
        setFormData(prev => ({ ...prev, lat: latLng.lat, lng: latLng.lng }));
        setHasPickedLocation(true);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latLng.lat}&lon=${latLng.lng}`);
          const data = await res.json();
          if (data && data.display_name) {
            setFormData(prev => ({ ...prev, address: data.display_name }));
          }
        } catch (e) {
          console.error(e);
        }
        toast.success(t('location.found'), { id: toastId });
      },
      (error) => {
        console.error('GPS Error:', error);
        let errorMsg = t('location.failed');
        if (error.code === 1) errorMsg = t('location.denied');
        else if (error.code === 2) errorMsg = t('location.unavailable');
        else if (error.code === 3) errorMsg = t('location.timeout');
        toast.error(errorMsg, { id: toastId, duration: 6000 });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  const handleMarkerDrag = async (idx, latLng) => {
    setFormData(prev => ({ ...prev, lat: latLng.lat, lng: latLng.lng }));
    setHasPickedLocation(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latLng.lat}&lon=${latLng.lng}`);
      const data = await res.json();
      if (data && data.display_name) {
        setFormData(prev => ({ ...prev, address: data.display_name }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    try {
      const { error, data } = await supabase
        .from('saved_addresses')
        .delete()
        .eq('id', id)
        .select();
      
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(t('addresses.delete_denied'));
      toast.success(t('addresses.deleted'));
      fetchAddresses();
    } catch (err) {
      console.error('Error deleting:', err);
      toast.error(err.message === t('addresses.delete_denied') ? err.message : t('addresses.delete_failed'));
    }
  };

  const getIcon = (label) => {
    const l = label.toLowerCase();
    if (l.includes('rumah')) return <Home size={18} aria-hidden="true" />;
    if (l.includes('kantor') || l.includes('kerja')) return <Briefcase size={18} aria-hidden="true" />;
    return <Star size={18} aria-hidden="true" />;
  };

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader title={t('addresses.title')} back backLabel={t('common.back')} className="!mb-0" />

      <Button
        block
        leftIcon={<Plus size={18} aria-hidden="true" />}
        onClick={() => {
          setFormData({ label: '', address: '', note: '', lat: DEFAULT_COORDS.lat, lng: DEFAULT_COORDS.lng });
          setHasPickedLocation(false);
          setIsModalOpen(true);
        }}
      >
        {t('addresses.add')}
      </Button>

      {loading ? (
        <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-ink-muted">
          <Spinner size={18} className="text-brand-ink" /> {t('addresses.loading')}
        </div>
      ) : addresses.length === 0 ? (
        <EmptyState
          icon={<MapPin size={24} />}
          title={t('addresses.empty_title')}
          description={t('addresses.empty_desc')}
        />
      ) : (
        <Card padding="none" className="divide-y divide-line overflow-hidden">
          {addresses.map((addr) => (
            <div key={addr.id} className="flex items-start gap-3 py-3 pl-4 pr-2">
              <IconTile size="sm" tone="brand" className="mt-0.5">
                {getIcon(addr.label)}
              </IconTile>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
                <h3 className="break-words text-[14px] font-semibold text-ink">{addr.label}</h3>
                <p className="line-clamp-2 text-[13px] leading-relaxed text-ink-muted">{addr.address}</p>
                {addr.note && <p className="text-[12.5px] text-ink-muted">{t('address_note.landmark')}: {addr.note}</p>}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(addr.id)}
                title={t('addresses.delete_label')}
                aria-label={t('addresses.delete_label')}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-danger transition-colors hover:bg-danger-soft"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </Card>
      )}

      {/* Add Address Sheet */}
      <Sheet
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t('addresses.modal_title')}
        closeLabel={t('common.close')}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="saved-address-form">
              {t('common.save')}
            </Button>
          </>
        )}
      >
        <form id="saved-address-form" onSubmit={handleSave} className="flex flex-col gap-4">
          <Field label={t('addresses.label_field')} htmlFor="address-label">
            <Input
              id="address-label"
              type="text"
              value={formData.label}
              onChange={(e) => setFormData({...formData, label: e.target.value})}
              required
            />
          </Field>
          <div className="relative z-10 flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink">{t('addresses.address_field')}</span>
            <LocationAutocomplete
              placeholder={t('location.search_placeholder')}
              icon={MapPin}
              iconColor="text-danger"
              value={formData.address}
              onChange={(val) => setFormData(prev => ({ ...prev, address: val }))}
              onSelect={(loc) => {
                setFormData(prev => ({ ...prev, address: loc.fullAddress, lat: loc.lat, lng: loc.lng }));
                setHasPickedLocation(true);
              }}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleLocateMe}
                className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-[13px] font-semibold text-brand-ink hover:bg-brand-soft"
              >
                <LocateFixed size={15} aria-hidden="true" /> {t('common.use_current_location')}
              </button>
            </div>
          </div>
          <Field label={t('address_note.label')} htmlFor="address-note" hint={t('address_note.hint')}>
            <Input
              id="address-note"
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder={t('address_note.placeholder')}
              maxLength={140}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <p className="text-[13px] font-semibold text-ink">
              {t('addresses.map_label')} {hasPickedLocation && <span className="font-normal text-success-ink">{t('addresses.map_picked')}</span>}
            </p>
            <div className="h-40 overflow-hidden rounded-control border border-line">
              <WiraMap
                center={{ lat: formData.lat, lng: formData.lng }}
                zoom={16}
                markers={[{ lat: formData.lat, lng: formData.lng, type: 'dropoff', label: formData.label || t('addresses.title') }]}
                onMarkerDragEnd={handleMarkerDrag}
              />
            </div>
            <p className="text-xs text-ink-muted">{t('common.map_pin_hint')}</p>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
