import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Star, Clock } from 'lucide-react';
import Card from '../components/common/Card';
import { formatRupiah } from '../utils/formatRupiah';
import { supabase } from '../config/supabase';

export default function FoodPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Semua');
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const categories = ['Semua', 'Ayam', 'Daging', 'Seafood', 'Minuman'];

  useEffect(() => {
    const fetchRestaurants = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('merchants')
        .select('*')
        .eq('service_type', 'food')
        .order('created_at', { ascending: false });
        
      if (data) {
        setRestaurants(data);
      }
      setLoading(false);
    };

    fetchRestaurants();
  }, []);

  const filtered = restaurants.filter(r => 
    (category === 'Semua' || r.category === category) &&
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="relative">
        <input 
          type="text" 
          placeholder="Cari restoran atau makanan..." 
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary dark:text-white"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Search className="absolute left-3 top-3 text-slate-400" size={20} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map(c => (
          <button 
            key={c}
            onClick={() => setCategory(c)}
            className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition ${category === c ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map(rest => (
          <Link key={rest.id} to={`/restaurant/${rest.id}`} className="block group">
            <Card className="flex gap-4 p-4 cursor-pointer group-hover:border-primary transition-all group-hover:shadow-md">
              <img src={rest.image} alt={rest.name} className="w-24 h-24 rounded-2xl object-cover bg-slate-200 shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base dark:text-white group-hover:text-primary transition-colors truncate">{rest.name}</h3>
                <p className="text-xs text-slate-500 mb-2">{rest.category} • {rest.address}</p>
                <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1 text-amber-500"><Star size={14} fill="currentColor" /> {rest.rating}</span>
                  <span className="flex items-center gap-1"><Clock size={14} /> {rest.deliveryTime}</span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
