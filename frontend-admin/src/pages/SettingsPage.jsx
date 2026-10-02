import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Save } from 'lucide-react';
import StaffSection from '../components/common/StaffSection';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import toast from 'react-hot-toast';

const SettingsPage = () => {
  const [, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      console.warn('Sync error, saving locally:', err);
      localStorage.setItem('wira_platform_settings', JSON.stringify(settingsPayload));
      toast.success('Pengaturan disimpan secara lokal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengaturan Sistem"
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
      <StaffSection />
    </div>
  );
};

export default SettingsPage;
