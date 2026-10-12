import { Wallet } from 'lucide-react';
import { Money } from '../ui';

// The Pendapatan hero: what the partner earned (their share after Wira's
// commission), today and over the last 7 days. Always the partner's income,
// never the commission they owe; that lives in the Setor Komisi card below.
const EarningsCard = ({ today, todayCount = 0, week, weekCount = 0 }) => (
  <section className="overflow-hidden rounded-card bg-laut-700 text-white">
    <div className="h-2.5 tenun-band" aria-hidden="true" />
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/70">Pendapatan Hari Ini</p>
          <Money value={Math.round(today)} className="text-[28px] font-medium leading-none tracking-tight sm:text-[32px]" />
          <p className="text-[13px] text-white/75">
            {todayCount > 0 ? `${todayCount} order selesai · bagian Anda setelah komisi` : 'Belum ada order selesai hari ini'}
          </p>
        </div>
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border border-white/15 bg-white/10">
          <Wallet size={21} aria-hidden="true" />
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-white/15 pt-3.5">
        <div className="flex flex-col gap-0.5">
          <dt className="order-2 text-[12px] text-white/70">7 hari terakhir</dt>
          <dd className="order-1"><Money value={Math.round(week)} className="text-[15px] font-medium" /></dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="order-2 text-[12px] text-white/70">Order 7 hari</dt>
          <dd className="order-1 font-mono text-[15px] font-medium">{weekCount}</dd>
        </div>
      </dl>
    </div>
  </section>
);
export default EarningsCard;
