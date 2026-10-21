import { useState, useEffect } from 'react';
import { Clock, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Button, Card, Notice, Spinner } from '../components/ui';
import WiraMark from '../components/brand/WiraMark';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';

const PendingVerificationPage = () => {
  const navigate = useNavigate();
  const { user, mitraAccess, refreshProfile, logout } = useAuth();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);

  // If the user already has approved mitra access, route directly to their workspace
  useEffect(() => {
    if (mitraAccess && mitraAccess.length > 0) {
      navigate(`/${mitraAccess[0]}`, { replace: true });
    }
  }, [mitraAccess, navigate]);

  // Load existing application and subscribe to realtime updates
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return undefined;
    }

    let isMounted = true;

    const fetchApplication = async () => {
      try {
        const { data, error } = await supabase
          .from('mitra_applications')
          .select('id, auth_id, role, status, admin_notes, created_at')
          .eq('auth_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.warn('Error fetching mitra application:', error);
        } else if (isMounted && data) {
          setApplication(data);
          if (data.status === 'Active') {
            const updated = await refreshProfile();
            const targetRole = updated?.mitra_access?.[0] || data.role || 'driver';
            navigate(`/${targetRole}`, { replace: true });
          }
        }
      } catch (err) {
        console.error('Failed to load application status:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchApplication();

    // Listen for realtime application status updates
    const channel = supabase
      .channel(`mitra-app-status-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mitra_applications',
          filter: `auth_id=eq.${user.id}`,
        },
        async (payload) => {
          const app = payload.new;
          if (!app) return;
          setApplication(app);
          if (app.status === 'Active') {
            toast.success('Pendaftaran Anda telah disetujui!');
            const updated = await refreshProfile();
            const targetRole = updated?.mitra_access?.[0] || app.role || 'driver';
            navigate(`/${targetRole}`, { replace: true });
          } else if (app.status === 'Rejected') {
            toast.error(
              app.admin_notes
                ? `Pendaftaran ditolak: ${app.admin_notes}`
                : 'Pendaftaran ditolak oleh admin.'
            );
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id, refreshProfile, navigate]);

  const isRejected = application?.status === 'Rejected';

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
        <div className={`h-1.5 ${isRejected ? 'bg-danger' : 'tenun-band'}`} aria-hidden="true" />
        
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <Spinner size="md" />
            <p className="text-xs text-ink-muted">Memeriksa status pendaftaran...</p>
          </div>
        ) : isRejected ? (
          <div className="flex flex-col items-center gap-5 p-6 text-center sm:p-7">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-tile border border-danger-line bg-danger-soft text-danger">
              <XCircle size={26} aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance">
                Pendaftaran Tidak Disetujui
              </h1>
              <p className="text-sm leading-relaxed text-ink-muted">
                Admin telah meninjau pendaftaran Anda. Silakan periksa catatan di bawah ini.
              </p>
            </div>

            <Notice tone="danger" className="w-full text-left">
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-bold uppercase tracking-wider text-danger-ink">Catatan Admin</span>
                <span className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink">
                  {application.admin_notes || 'Mohon maaf, pendaftaran Anda belum memenuhi kualifikasi Wira.'}
                </span>
              </div>
            </Notice>

            <div className="flex w-full flex-col gap-2.5 pt-2">
              <Button
                variant="primary"
                size="lg"
                block
                onClick={() => navigate(application?.role && application.role !== 'courier' ? `/register?role=${application.role}` : '/register')}
              >
                Daftar Ulang
              </Button>
              <Button
                variant="secondary"
                size="lg"
                block
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
              >
                Kembali ke Login
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 p-6 text-center sm:p-7">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-tile border border-warning-line bg-warning-soft text-warning">
              <Clock size={26} aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance">
                Menunggu Verifikasi
              </h1>
              <p className="text-sm leading-relaxed text-ink-muted">
                Akun Anda sedang diverifikasi oleh admin Wira. Proses ini memakan waktu maksimal 1x24 jam kerja.
              </p>
            </div>
            <Button
              variant="secondary"
              size="lg"
              block
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              Kembali ke Login
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default PendingVerificationPage;
