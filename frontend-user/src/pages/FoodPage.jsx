import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Star, Clock, UtensilsCrossed } from 'lucide-react';
import { Badge, Card, Input, PageHeader, Segmented, EmptyState } from '../components/ui';
import { supabase } from '../config/supabase';
import { useTranslation } from '../i18n';

export default function FoodPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Semua');
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);

  // These values are the merchant `category` values stored in the database,
  // so they stay as-is for filtering; only their labels are translated.
  const categories = ['Semua', 'Ayam', 'Daging', 'Seafood', 'Minuman'];

  useEffect(() => {
    const fetchRestaurants = async () => {
      setLoading(true);
      const { data } = await supabase
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
    <div className="flex flex-col gap-5">
      <PageHeader back="/" backLabel={t('common.back')} title={t('order.service_title.food')} className="mb-0" />

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} aria-hidden="true" />
          <Input
            type="search"
            aria-label={t('food.search_placeholder')}
            placeholder={t('food.search_placeholder')}
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Segmented
          scroll
          value={category}
          onChange={setCategory}
          options={categories.map((c) => ({ value: c, label: t(`food.categories.${c}`) }))}
        />
      </div>

      {loading && restaurants.length === 0 ? (
        <div className="grid gap-3 md:grid-cols-2" aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="flex gap-3.5 rounded-card border border-line bg-card p-3.5">
              <div className="h-20 w-20 shrink-0 animate-pulse rounded-control bg-sunken" />
              <div className="flex flex-1 flex-col gap-2 py-1">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-sunken" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-sunken" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-sunken" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<UtensilsCrossed size={22} />} title={t('food.empty')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map(rest => (
            <Card
              key={rest.id}
              as={Link}
              to={`/restaurant/${rest.id}`}
              padding="none"
              className="flex gap-3.5 p-3.5"
            >
              <img
                src={rest.image}
                alt={rest.name}
                className="h-20 w-20 shrink-0 rounded-control bg-sunken object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="min-w-0 truncate text-[14px] font-semibold text-ink">{rest.name}</h3>
                  {rest.is_open === false && <Badge tone="neutral" className="shrink-0">{t('restaurant.closed')}</Badge>}
                </div>
                <p className="truncate text-[12px] text-ink-muted">
                  {[rest.category, rest.address].filter(Boolean).join(' · ')}
                </p>
                <div className="mt-auto flex items-center gap-3 text-[12px] font-semibold text-ink">
                  {rest.rating != null && (
                    <span className="inline-flex items-center gap-1">
                      <Star size={13} className="fill-current" aria-hidden="true" />
                      <span className="font-mono">{rest.rating}</span>
                    </span>
                  )}
                  {rest.delivery_time && (
                    <span className="inline-flex items-center gap-1 text-ink-muted">
                      <Clock size={13} aria-hidden="true" />
                      <span className="font-mono">{rest.delivery_time}</span>
                    </span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
