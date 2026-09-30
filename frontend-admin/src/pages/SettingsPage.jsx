import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Save, ShieldCheck, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Field, IconTile, Input, Notice, PageHeader, Select, Table } from '../components/ui';
import toast from 'react-hot-toast';

const SettingsPage = () => {
  const [, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // App Settings
  const [appName, setAppName] = useState('Wira Super App');
  const [tagline, setTagline] = useState('Semua Kebutuhan Pulau Lombok');
  const [defaultRegion, setDefaultRegion] = useState('Kota Mataram');
  const [csPhone, setCsPhone] = useState('081234567890');

  // Admin users - see the honest-UI note near the "Pengelola & Hak Akses
  // Admin" card below: this list is just a JSON array inside feature_flags,
  // never real Supabase Auth users or public.users rows, so it is display
  // information only now, not an editable access-control list.
  const [admins, setAdmins] = useState([
    { id: 'adm_1', name: 'Super Administrator', email: 'admin@wira.app', role: 'Superadmin', status: 'Active' }
  ]);

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
        if (Array.isArray(s.admins) && s.admins.length > 0) setAdmins(s.admins);
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

  const saveSettingsToCloud = async (overrideAdmins) => {
    setSaving(true);
    const settingsPayload = {
      appName,
      tagline,
      defaultRegion,
      csPhone,
      admins: overrideAdmins || admins
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

  // Tambah/Hapus Admin used to only write a fake entry into this JSON array
  // inside feature_flags - it never created a real Supabase Auth user or a
  // public.users row, so nothing granted here ever actually worked, yet the
  // old UI showed a green "Admin baru berhasil ditambahkan" success toast as
  // if it had. That's actively misleading: an operator could walk away
  // believing they'd granted someone real dashboard access when they had
  // not granted anything at all. Building the real version needs a
  // server-side endpoint with service-role privileges (out of scope for
  // this fix - flagged for the coordinator/backend). Until then, both
  // actions are disabled and just point at that gap honestly instead of
  // faking success.
  const notifyAuthNotConnected = () => {
    toast.error('Fitur ini belum terhubung ke sistem otentikasi - hubungi developer.');
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

      {/* Admin Management */}
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconTile tone="brand" size="sm"><ShieldCheck size={18} /></IconTile>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold tracking-tight text-ink">Pengelola &amp; Hak Akses Admin</h2>
              <p className="text-xs text-ink-muted">Daftar pengguna dengan hak akses dashboard admin</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={notifyAuthNotConnected}
            disabled
            title="Fitur ini belum terhubung ke sistem otentikasi - hubungi developer"
            leftIcon={<Plus size={15} />}
          >
            Tambah Admin
          </Button>
        </div>

        <Notice tone="warning">
          Fitur ini belum terhubung ke sistem otentikasi - hubungi developer. Daftar di bawah hanya catatan
          lokal (bukan akun login Supabase sungguhan): menambah atau menghapus baris di sini <strong>tidak</strong> membuat
          atau mencabut akses masuk dashboard admin secara nyata.
        </Notice>

        <Table>
          <thead>
            <tr>
              <th>Nama Administrator</th>
              <th>Email</th>
              <th>Peran (Role)</th>
              <th>Status</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {admins.map(a => (
              <tr key={a.id}>
                <td className="whitespace-nowrap font-semibold">{a.name}</td>
                <td className="font-mono text-[12.5px] text-ink-muted">{a.email}</td>
                <td><Badge tone="brand">{a.role}</Badge></td>
                <td>
                  <Badge tone={String(a.status).toLowerCase() === 'active' ? 'success' : 'neutral'} dot>{a.status}</Badge>
                </td>
                <td className="text-right">
                  {/* Guard fixed to compare against the real 'Superadmin' role
                      string (no space) used everywhere else in this codebase -
                      it previously compared against 'Super Admin' (with a
                      space), which never matched. The action itself stays
                      disabled either way until real admin management ships. */}
                  {a.role !== 'Superadmin' && (
                    <Button
                      size="sm"
                      variant="danger-soft"
                      onClick={notifyAuthNotConnected}
                      disabled
                      title="Fitur ini belum terhubung ke sistem otentikasi - hubungi developer"
                      aria-label="Hapus admin"
                    >
                      <Trash2 size={15} />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </div>
  );
};

export default SettingsPage;
