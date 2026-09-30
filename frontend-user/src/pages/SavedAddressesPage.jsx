import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import { useNavigate } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import WiraMap from '../components/common/WiraMap';
import LocationAutocomplete from '../components/common/LocationAutocomplete';
import { toast } from 'react-hot-toast';
import { ArrowLeft, MapPin, Plus, Trash2, Home, Briefcase, Star, LocateFixed } from 'lucide-react';
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
      const { error } = await supabase
        .from('saved_addresses')
        .insert([{
          user_id: user.id,
          label: formData.label,
          address: formData.address,
          lat: formData.lat,
          lng: formData.lng
        }]);

      if (error) throw error;

      toast.success(t('addresses.saved'));
      setIsModalOpen(false);
      setFormData({ label: '', address: '', lat: DEFAULT_COORDS.lat, lng: DEFAULT_COORDS.lng });
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
    if (l.includes('rumah')) return <Home size={20} className="text-blue-500" />;
    if (l.includes('kantor') || l.includes('kerja')) return <Briefcase size={20} className="text-orange-500" />;
    return <Star size={20} className="text-amber-400" />;
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} title={t('common.back')} aria-label={t('common.back')} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
          <ArrowLeft size={20} className="dark:text-white" />
        </button>
        <h1 className="text-xl font-bold dark:text-white">{t('addresses.title')}</h1>
      </div>

      <Button
        onClick={() => {
          setFormData({ label: '', address: '', lat: DEFAULT_COORDS.lat, lng: DEFAULT_COORDS.lng });
          setHasPickedLocation(false);
          setIsModalOpen(true);
        }}
        className="w-full mb-4 flex items-center justify-center gap-2"
      >
        <Plus size={18} /> {t('addresses.add')}
      </Button>

      {loading ? (
        <div className="text-center p-8 text-slate-400">{t('addresses.loading')}</div>
      ) : addresses.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-2 border-slate-200 bg-transparent shadow-none">
          <MapPin size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">{t('addresses.empty_title')}</h3>
          <p className="text-sm text-slate-500">{t('addresses.empty_desc')}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => (
            <Card key={addr.id} className="p-4 flex items-start gap-4 hover:border-primary transition border-2 border-transparent">
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full">
                {getIcon(addr.label)}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-800 dark:text-white">{addr.label}</h3>
                <p className="text-sm text-slate-500 line-clamp-2">{addr.address}</p>
              </div>
              <button onClick={() => handleDelete(addr.id)} title={t('addresses.delete_label')} aria-label={t('addresses.delete_label')} className="p-2 text-red-500 hover:bg-red-50 rounded-full transition">
                <Trash2 size={18} />
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Add Address Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4 dark:text-white">{t('addresses.modal_title')}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-slate-300">{t('addresses.label_field')}</label>
                <input 
                  type="text" 
                  value={formData.label}
                  onChange={(e) => setFormData({...formData, label: e.target.value})}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-xl dark:text-white"
                  required
                />
              </div>
              <div className="relative z-10">
                <label className="block text-sm font-medium mb-1 dark:text-slate-300">{t('addresses.address_field')}</label>
                <LocationAutocomplete
                  placeholder={t('location.search_placeholder')}
                  icon={MapPin}
                  iconColor="text-red-500"
                  value={formData.address}
                  onChange={(val) => setFormData(prev => ({ ...prev, address: val }))}
                  onSelect={(loc) => {
                    setFormData(prev => ({ ...prev, address: loc.fullAddress, lat: loc.lat, lng: loc.lng }));
                    setHasPickedLocation(true);
                  }}
                />
              </div>
              <div className="flex items-center justify-end -mt-1">
                <button
                  type="button"
                  onClick={handleLocateMe}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-primary hover:text-primary-dark"
                >
                  <LocateFixed size={12} /> {t('common.use_current_location')}
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-slate-300">
                  {t('addresses.map_label')} {hasPickedLocation && <span className="text-green-600 font-normal">{t('addresses.map_picked')}</span>}
                </label>
                <div className="h-40 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  <WiraMap
                    center={{ lat: formData.lat, lng: formData.lng }}
                    zoom={16}
                    markers={[{ lat: formData.lat, lng: formData.lng, type: 'dropoff', label: formData.label || t('addresses.title') }]}
                    onMarkerDragEnd={handleMarkerDrag}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{t('common.map_pin_hint')}</p>
              </div>
              <div className="flex gap-3 mt-6">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" className="flex-1">
                  {t('common.save')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
