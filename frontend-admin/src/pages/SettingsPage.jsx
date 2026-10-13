import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Save, BellRing } from 'lucide-react';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import toast from 'react-hot-toast';

// Backend (FCM credentials live there). Same host the partner and customer apps call.
const BACKEND_URL = 'https://api.wira.one/api';

const SettingsPage = () => {
  const [, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushTesting, setPushTesting] = useState(false);

  // App Settings
  const [appName, setAppName] = useState('Wira Super App');
  const [tagline, setTagline] = useState('Semua Kebutuhan Pulau Lombok');
  const [defaultRegion, setDefaultRegion] = useState('Kota Mataram');
  const [csPhone, setCsPhone] = useState('081234567890');

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .eq('region', 'platform_settings')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data && data.features) {
        const s = data.features;
        if (s.appName) setAppName(s.appName);
        if (s.tagline) setTagline(s.tagline);
        if (s.defaultRegion) setDefaultRegion(s.defaultRegion);
        if (s.csPhone) setCsPhone(s.csPhone);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const saveSettingsToCloud = async () => {
    setSaving(true);
    const settingsPayload = {
      appName,
      tagline,
      defaultRegion,
      csPhone,
    };

    try {
      const { error } = await supabase
        .from('feature_flags')
        .upsert({
          region: 'platform_settings',
          features: settingsPayload,
          updated_at: new Date().toISOString()
        }, { onConflict: 'region' });

      if (error) throw error;
      toast.success('Pengaturan sistem berhasil disimpan ke cloud');
    } catch (err) {
      // Never report a failed save as saved: the apps read the cloud copy only.
      console.warn('Settings save failed:', err);
      toast.error('Pengaturan belum tersimpan. Periksa koneksi, lalu klik Simpan lagi.');
    } finally {
      setSaving(false);
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
        subtitle="Konfigurasi parameter operasional dan tarif platform Wira"
        className="!mb-0"
        actions={(
          <Button
            onClick={() => saveSettingsToCloud()}
            disabled={saving}
            leftIcon={<Save size={17} />}
          >
            {saving ? 'Menyimpan...' : 'Simpan Semua Perubahan'}
          </Button>
        )}
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
        {/* App Settings */}
        <Card padding="none" className="min-w-0">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">Pengaturan Dasar Aplikasi</h2>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <Field label="Nama Aplikasi" htmlFor="set-app-name">
              <Input
                id="set-app-name"
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="!text-sm"
              />
            </Field>
            <Field label="Tagline Slogan" htmlFor="set-tagline">
              <Input
                id="set-tagline"
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="!text-sm"
              />
            </Field>
            <Field label="Nomor WhatsApp Customer Service (CS)" htmlFor="set-cs-phone">
              <Input
                id="set-cs-phone"
                type="text"
                value={csPhone}
                onChange={(e) => setCsPhone(e.target.value)}
                className="font-mono !text-sm"
              />
            </Field>
            <Field label="Wilayah Operasional Utama" htmlFor="set-region">
              <Select
                id="set-region"
                value={defaultRegion}
                onChange={(e) => setDefaultRegion(e.target.value)}
                className="!text-sm"
              >
                <option value="Kota Mataram">Kota Mataram</option>
                <option value="Lombok Barat (Senggigi)">Lombok Barat (Senggigi)</option>
                <option value="Lombok Tengah (Mandalika/Kuta)">Lombok Tengah (Mandalika/Kuta)</option>
                <option value="Lombok Timur">Lombok Timur</option>
                <option value="Lombok Utara (Gili)">Lombok Utara (Gili)</option>
              </Select>
            </Field>
          </div>
        </Card>
      </div>

      {/* Staff: real accounts and roles (migrations/0102) */}
    </div>
  );
};

export default SettingsPage;
