import { Wallet, TrendingUp, Banknote } from 'lucide-react';
import { Money } from '../ui';

// Previously rendered a "Target Harian" (Daily Target) progress bar driven by
// a `progress` prop, but every caller passed a fake binary value
// (`value > 0 ? 100 : 0`) because there's no real daily-target feature
// anywhere in the system - it misrepresented itself as a real KPI on 5+
// screens (Driver/Merchant/Technician earnings & home pages). Removed rather
// than faked further; this now shows only real, available numbers (today's
// and this week's actual earnings).
// `cashDeduction` (optional): what Tunai orders took back out of the saldo
// (migrations/0075) over the same orders `week` covers; today/week are the
// net saldo change and can be negative.
// Signed rupiah in mono: negatives read "− Rp 10.000", same meaning as
// formatSignedRupiah's "-Rp 10.000".
const Signed = ({ value, className = '' }) => (
  <Money value={value} sign={Number(value) < 0 ? 'minus' : undefined} className={className} />
);

const EarningsCard = ({ today, week, cashDeduction = 0 }) => {
  return (
    <section className="overflow-hidden rounded-card bg-laut-700 text-white">
      <div className="h-2.5 tenun-band" aria-hidden="true" />
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/70">Pendapatan Hari Ini</p>
            <Signed value={today} className="text-[26px] font-medium leading-none tracking-tight sm:text-[30px]" />
          </div>
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border border-white/15 bg-white/10">
            <Wallet size={21} aria-hidden="true" />
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/15 pt-3.5 text-[13px] text-white/80">
          <TrendingUp size={16} className="shrink-0 text-laut-300" aria-hidden="true" />
          <span>Minggu ini:</span>
          <Signed value={week} className="font-medium text-white" />
        </div>

        {cashDeduction > 0 && (
          <div className="flex flex-col gap-2 rounded-control border border-white/10 bg-white/[0.07] p-3 text-[13px]">
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-start gap-2">
                <Banknote size={16} className="mt-0.5 shrink-0 text-emas-200" aria-hidden="true" />
                <span>Komisi tunai (dipotong dari saldo)</span>
              </span>
              <Signed value={-cashDeduction} className="shrink-0 font-medium text-emas-200" />
            </div>
            <p className="text-xs leading-relaxed text-white/70">Order Tunai: uang dari pelanggan sudah Anda terima langsung, jadi komisi Wira (dan bagian resto untuk WiraFood yang Anda antar) dipotong dari saldo. Sudah termasuk dalam angka di atas.</p>
          </div>
        )}
      </div>
    </section>
  );
};
export default EarningsCard;
