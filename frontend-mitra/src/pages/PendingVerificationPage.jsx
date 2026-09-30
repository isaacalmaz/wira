import { Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '../components/ui';
import WiraMark from '../components/brand/WiraMark';

const PendingVerificationPage = () => {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-7 bg-ground px-4 py-10">
      <div className="flex items-center gap-2.5" aria-hidden="true">
        <WiraMark size={34} />
        <span className="flex items-baseline gap-1.5 leading-none">
          <span className="text-[24px] font-extrabold tracking-[-0.035em] text-brand-ink">wira</span>
          <span className="text-[18px] font-medium tracking-[-0.02em] text-ink-muted">mitra</span>
        </span>
      </div>

      <Card padding="none" className="w-full max-w-[420px] overflow-hidden">
        <div className="h-1.5 tenun-band" aria-hidden="true" />
        <div className="flex flex-col items-center gap-5 p-6 text-center sm:p-7">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-tile border border-warning-line bg-warning-soft text-warning">
            <Clock size={26} aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance">Menunggu Verifikasi</h1>
            <p className="text-sm leading-relaxed text-ink-muted">Akun Anda sedang diverifikasi oleh admin Wira. Proses ini memakan waktu maksimal 1x24 jam kerja.</p>
          </div>
          <Button variant="secondary" size="lg" block onClick={() => navigate('/login')}>Kembali ke Login</Button>
        </div>
      </Card>
    </div>
  );
};
export default PendingVerificationPage;
