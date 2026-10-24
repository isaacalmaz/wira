import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { BellRing, ShieldCheck, KeyRound } from 'lucide-react';
import { Button, Card, Field, IconTile, Input, PageHeader, Segmented } from '../components/ui';
import toast from 'react-hot-toast';

// Backend (FCM credentials live there). Same host the partner and customer apps call.
const BACKEND_URL = 'https://api.wira.one/api';

const SettingsPage = () => {
  const [pushTesting, setPushTesting] = useState(false);

  // Active platform setting: service_dispatch_mode (public.app_settings)
  const [dispatchMode, setDispatchMode] = useState('admin_only');
  const [savingMode, setSavingMode] = useState(false);

  // Account security: password change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const fetchDispatchMode = async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'service_dispatch_mode')
          .maybeSingle();
        if (data?.value) {
          setDispatchMode(typeof data.value === 'string' ? data.value : 'admin_only');
        }
      } catch (err) {
        console.error('Error fetching service_dispatch_mode:', err);
      }
    };
    fetchDispatchMode();
  }, []);

  const handleUpdateDispatchMode = async (newMode) => {
    setSavingMode(true);
    try {
      const { error } = await supabase.rpc('admin_set_app_setting', {
        p_key: 'service_dispatch_mode',
        p_value: newMode,
      });
      if (error) throw error;
      setDispatchMode(newMode);
      toast.success(
        newMode === 'admin_only'
          ? 'Mode diubah: 100% Penugasan oleh Admin'
          : 'Mode diubah: Keduanya (Admin & Teknisi Mandiri)'
      );
    } catch (err) {
      toast.error(`Gagal menyimpan mode penugasan: ${err.message}`);
    } finally {
      setSavingMode(false);
    }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Kata sandi berhasil diperbarui.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.message || 'Gagal memperbarui kata sandi.');
    } finally {
      setSavingPassword(false);
    }
  };

  const sendTestPush = async () => {
    setPushTesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BACKEND_URL}/notifications/self-test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || `Gagal (${res.status})`);
      toast.success('Terkirim. Cek HP Anda dalam beberapa detik.');
    } catch (err) {
      toast.error(err.message || 'Gagal mengirim notifikasi uji');
    } finally {
      setPushTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengaturan"
        subtitle="Konfigurasi parameter operasional dan keamanan akun Wira Admin"
        className="!mb-0"
      />

      {/* Push check: e.g. after rotating the Firebase key (backend self-test). */}
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">Tes notifikasi</h2>
          <p className="text-[13px] text-ink-muted">Kirim notifikasi uji ke HP Anda (perangkat tempat Anda terakhir membuka Wira Admin dan mengizinkan notifikasi).</p>
        </div>
        <Button variant="secondary" leftIcon={<BellRing size={17} />} disabled={pushTesting} onClick={sendTestPush}>
          {pushTesting ? 'Mengirim...' : 'Kirim notifikasi uji'}
        </Button>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Service Dispatch Mode */}
        <Card padding="none" className="min-w-0">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <IconTile tone="brand" size="sm"><ShieldCheck size={18} /></IconTile>
            <div>
              <h2 className="text-[15px] font-bold tracking-tight text-ink">Mode Penugasan Servis</h2>
              <p className="text-xs text-ink-muted">Kontrol penugasan pesanan WiraService & WiraPool</p>
            </div>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <p className="text-[13px] leading-relaxed text-ink-muted">
              {dispatchMode === 'admin_only'
                ? 'Saat ini: 100% Ditugaskan oleh Admin. Teknisi tidak dapat klaim mandiri dari bursa; admin memilih teknisi dari halaman Pesanan.'
                : 'Saat ini: Mode Keduanya (Hybrid). Teknisi dapat mengambil pesanan terbuka secara mandiri atau ditugaskan oleh admin.'}
            </p>
            <Segmented
              value={dispatchMode}
              onChange={handleUpdateDispatchMode}
              disabled={savingMode}
              options={[
                { value: 'admin_only', label: '100% Admin' },
                { value: 'hybrid', label: 'Keduanya (Hybrid)' },
              ]}
            />
          </div>
        </Card>

        {/* Account Security */}
        <Card padding="none" className="min-w-0">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <IconTile tone="neutral" size="sm"><KeyRound size={18} /></IconTile>
            <div>
              <h2 className="text-[15px] font-bold tracking-tight text-ink">Keamanan Akun</h2>
              <p className="text-xs text-ink-muted">Perbarui kata sandi akun administrator Anda</p>
            </div>
          </div>
          <form onSubmit={handlePasswordUpdate} className="flex flex-col gap-4 p-5">
            <Field label="Kata Sandi Baru" htmlFor="set-new-password">
              <Input
                id="set-new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Minimal 6 karakter"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="Konfirmasi Kata Sandi Baru" htmlFor="set-confirm-password">
              <Input
                id="set-confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="Ulangi kata sandi baru"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" isLoading={savingPassword} className="self-start">
              Simpan Kata Sandi Baru
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;
