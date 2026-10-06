import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Hourglass } from 'lucide-react';
import { Button, Card } from '../components/ui';
import WiraMark from '../components/brand/WiraMark';
import { supabase } from '../config/supabase';

// Signed in, but no mitra access yet - typically a Wira customer account.
// Applying goes through the same /register form as new partners (it reuses
// the signed-in account), so there is only one application form to maintain.

const ROLE_LABEL = { driver: 'Driver', courier: 'Driver', merchant: 'Restoran', villa: 'Villa', technician: 'Teknisi' };

const Brand = () => (
  <div className="flex items-center gap-2.5" aria-hidden="true">
    <WiraMark size={34} />
    <span className="flex items-baseline gap-1.5 leading-none">
      <span className="text-[24px] font-extrabold tracking-[-0.035em] text-brand-ink">wira</span>
      <span className="text-[18px] font-medium tracking-[-0.02em] text-ink-muted">mitra</span>
    </span>
  </div>
);

const UnauthorizedPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [latest, setLatest] = useState(undefined); // undefined = loading

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase
      .from('mitra_applications')
      .select('role, status, admin_notes')
      .eq('auth_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setLatest(data || null); });
    return () => { cancelled = true; };
  }, [user?.id]);

  const blocked = user?.status === 'Diblokir';
  const pending = latest?.status === 'Pending';
  const rejected = latest?.status === 'Rejected';

  let title = 'Belum Terdaftar sebagai Mitra';
  let body = 'Akun Anda belum terdaftar sebagai Mitra Wira (Driver, Restoran, Villa, atau Teknisi). Anda bisa mendaftar memakai akun ini, tanpa membuat akun baru.';
  if (blocked) {
    title = 'Akses Ditolak';
    body = 'Akun ini sedang dinonaktifkan oleh admin. Hubungi tim Wira untuk informasi lebih lanjut.';
  } else if (pending) {
    title = 'Pendaftaran Sedang Ditinjau';
    body = `Pendaftaran ${ROLE_LABEL[latest.role] || 'mitra'} Anda sudah kami terima. Admin akan meninjaunya, dan Anda akan mendapat notifikasi begitu disetujui.`;
  } else if (rejected) {
    title = 'Pendaftaran Belum Disetujui';
    body = latest.admin_notes
      ? `Catatan admin: ${latest.admin_notes}. Perbaiki data lalu kirim ulang pendaftaran.`
      : 'Pendaftaran Anda belum disetujui. Perbaiki data lalu kirim ulang pendaftaran.';
  }

  const applyTo = latest?.role && latest.role !== 'courier' ? `/register?role=${latest.role}` : '/register';

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-7 bg-ground px-4 py-10">
      <Brand />
      <Card padding="none" className="w-full max-w-[420px] overflow-hidden">
        <div className="flex flex-col items-center gap-5 p-6 text-center sm:p-7">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-tile border border-line bg-sunken text-ink-muted">
            {pending ? <Hourglass size={26} aria-hidden="true" /> : <LogOut size={26} aria-hidden="true" />}
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance">{title}</h1>
            <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
          </div>

          <div className="flex w-full flex-col gap-2.5 border-t border-line pt-5">
            {!blocked && !pending && latest !== undefined && (
              <Button size="lg" block onClick={() => navigate(applyTo)}>
                {rejected ? 'Kirim Ulang Pendaftaran' : 'Daftar Menjadi Mitra'}
              </Button>
            )}
            <Button variant="secondary" size="lg" block onClick={logout}>
              Ganti Akun
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
export default UnauthorizedPage;
