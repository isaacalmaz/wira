import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, Badge, Button, StarRating } from '../../components/shared/UIComponents';
import { User, ShieldCheck, Car, Settings, Star, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { fetchCounterpartyProfiles } from '../../services/profileService';

const DriverProfilePage = () => {
  const { user, logout } = useAuth();
  const [vehicle, setVehicle] = useState('Memuat data...');
  const [plate, setPlate] = useState('');
  
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(5.0);

  useEffect(() => {
    const fetchRegData = async () => {
      const { data } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').single();
      if (data && data.features) {
        const myReg = data.features.find(f => f.auth_id === user?.id && (f.role === 'driver' || f.role === 'courier'));
        if (myReg) {
          setVehicle(myReg.vehicle || 'Kendaraan Mitra');
          setPlate(myReg.plate || '');
        } else {
          setVehicle('Data kendaraan tidak ditemukan');
        }
      }
    };
    
    const fetchReviews = async () => {
      // Reads from public.reviews (migrations/0039/0041) - the single
      // canonical review/rating table, written by both RidePage.jsx's
      // immediate post-trip prompt and Aktivitas/ReviewModal.jsx, so every
      // rating a customer gives actually shows up here. The older
      // public.driver_reviews table (migrations/0034) is deprecated and
      // was confirmed to hold 0 rows when this was switched over - nothing
      // to backfill.
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          id, rating, review_text, created_at, user_id
        `)
        .eq('driver_id', user?.id)
        .order('created_at', { ascending: false });

      if (data && !error) {
        const profiles = await fetchCounterpartyProfiles(supabase, data.map((r) => r.user_id));
        data.forEach((r) => { r.customer = profiles[r.user_id] || null; });
        setReviews(data);
        if (data.length > 0) {
          const total = data.reduce((sum, r) => sum + r.rating, 0);
          setAvgRating((total / data.length).toFixed(1));
        }
      }
    };

    if (user) {
      fetchRegData();
      fetchReviews();
    }
  }, [user]);
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center overflow-hidden">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <User size={40} className="text-slate-400" />
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold capitalize">{user?.name || 'Driver Wira'}</h1>
          <p className="text-slate-500">{user?.phone || 'Belum mengatur nomor HP'}</p>
          <div className="flex items-center gap-2 mt-1">
            <StarRating rating={parseFloat(avgRating)} />
            <span className="text-sm font-medium">{avgRating} ({reviews.length} Ulasan)</span>
          </div>
        </div>
      </div>

      <Card className="p-0">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-3">
          <Car className="text-primary" />
          <div>
            <p className="font-semibold capitalize">{vehicle}</p>
            <p className="text-sm text-slate-500 uppercase">{plate || 'Menunggu verifikasi admin'}</p>
          </div>
        </div>
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-green-500" />
            <span className="font-medium">Status Akun</span>
          </div>
          <Badge variant="success">Terverifikasi</Badge>
        </div>
        <Link to="/driver/settings" className="p-4 flex items-center gap-3 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">
          <Settings className="text-slate-400" />
          <span className="font-medium">Pengaturan Akun</span>
        </Link>
      </Card>
      
      {/* SECTION ULASAN PELANGGAN */}
      <h3 className="font-bold text-lg pt-2">Ulasan Pelanggan</h3>
      {reviews.length === 0 ? (
        <div className="text-center p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
          <MessageSquare className="mx-auto text-slate-300 mb-2" size={32} />
          <p className="text-sm text-slate-500">Belum ada ulasan dari pelanggan.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.slice(0, 5).map((rev) => (
            <Card key={rev.id} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-sm">{rev.customer?.name || 'Pelanggan'}</span>
                <div className="flex items-center text-amber-400 text-xs font-bold">
                  <Star size={12} className="fill-amber-400 mr-1" />
                  {rev.rating}
                </div>
              </div>
              {rev.review_text && (
                <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg italic">
                  "{rev.review_text}"
                </p>
              )}
              <p className="text-[10px] text-slate-400 mt-2 text-right">
                {new Date(rev.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </Card>
          ))}
          {reviews.length > 5 && (
            <p className="text-center text-xs text-slate-500 pt-2">Menampilkan 5 ulasan terbaru</p>
          )}
        </div>
      )}
      
      <Button variant="outline" className="w-full text-red-500 border-red-500 hover:bg-red-500 hover:text-white" onClick={logout}>Keluar Akun</Button>
    </div>
  );
};
export default DriverProfilePage;
