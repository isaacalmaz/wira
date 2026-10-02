import { useEffect, useState } from 'react';
import { supabase } from '../../config/supabase';
import { ChevronRight, Ticket, Bike, UtensilsCrossed, House, Package, Wrench, Bus, Sparkles } from 'lucide-react';
import { cx } from '../ui';

const SERVICE_ICONS = {
  ride: Bike,
  food: UtensilsCrossed,
  villa: House,
  send: Package,
  service: Wrench,
  pool: Bus,
};

const SERVICE_COLORS = {
  ride: 'from-blue-500 to-cyan-500',
  food: 'from-orange-500 to-amber-500',
  villa: 'from-emerald-500 to-teal-500',
  send: 'from-violet-500 to-purple-500',
  service: 'from-slate-700 to-slate-900',
  pool: 'from-rose-500 to-pink-500',
};

export default function PromoCarousel() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPromos() {
      const { data } = await supabase
        .from('promos')
        .select('*')
        .eq('status', 'Active')
        .gte('validUntil', new Date().toISOString().split('T')[0])
        .order('created_at', { ascending: false })
        .limit(5);
      
      setPromos(data || []);
      setLoading(false);
    }
    fetchPromos();
  }, []);

  if (loading) return null;

  return (
    <section className="mb-4 overflow-hidden">
      <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide px-4 gap-3 pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        
        {promos.length === 0 ? (
          // Placeholder Banner
          <div className="relative flex-none snap-start w-full h-[120px] rounded-2xl p-5 overflow-hidden text-white shadow-sm flex flex-col justify-center bg-gradient-to-r from-laut-600 to-laut-400">
            <Sparkles size={80} className="absolute -bottom-2 -right-2 text-white opacity-10 rotate-12" aria-hidden="true" />
            <div className="relative z-10 flex flex-col items-center text-center gap-1.5">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/20 backdrop-blur-md mb-1">
                <Ticket size={20} className="text-white" />
              </div>
              <h3 className="text-[15px] font-extrabold leading-tight shadow-black/10 text-shadow-sm">
                Nantikan Promo Terbaru Kami!
              </h3>
            </div>
          </div>
        ) : (
          // Real Promos
          promos.map((promo) => {
            const Icon = SERVICE_ICONS[promo.service_type?.toLowerCase()] || Ticket;
            const bgGradient = SERVICE_COLORS[promo.service_type?.toLowerCase()] || 'from-brand to-brand-strong';
            
            return (
              <div 
                key={promo.id} 
                className={cx(
                  "relative flex-none snap-start w-[260px] sm:w-[280px] h-[140px] rounded-2xl p-4 overflow-hidden text-white shadow-sm flex flex-col justify-between bg-gradient-to-br",
                  bgGradient
                )}
              >
                <Icon size={120} className="absolute -bottom-6 -right-6 text-white opacity-20 rotate-12" aria-hidden="true" />
                
                <div className="relative z-10">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-md px-2.5 py-1 mb-2 text-[11px] font-bold uppercase tracking-wider shadow-sm">
                    <Icon size={12} />
                    {promo.service_type || 'PROMO'}
                  </div>
                  <h3 className="text-[18px] font-extrabold leading-tight text-balance shadow-black/10 text-shadow-sm">
                    {promo.title}
                  </h3>
                </div>

                <div className="relative z-10 flex items-center justify-between mt-2">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium opacity-90">Gunakan kode:</span>
                    <span className="font-mono text-[14px] font-bold tracking-widest">{promo.code}</span>
                  </div>
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-white text-ink shadow-sm">
                    <ChevronRight size={18} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}} />
    </section>
  );
}
