import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Settings, Save, ShieldCheck, Plus, Trash2, AlertTriangle } from 'lucide-react';
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
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="text-primary" size={24} /> Pengaturan Sistem
          </h1>
          <p className="text-sm text-slate-500">Konfigurasi parameter operasional dan tarif platform Wira</p>
        </div>
        <button 
          onClick={() => saveSettingsToCloud()}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          <Save size={18} /> {saving ? 'Menyimpan...' : 'Simpan Semua Perubahan'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* App Settings */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
            Pengaturan Dasar Aplikasi
          </h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Aplikasi</label>
            <input 
              type="text" 
              value={appName} 
              onChange={(e) => setAppName(e.target.value)} 
              className="input-field w-full" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tagline Slogan</label>
            <input 
              type="text" 
              value={tagline} 
              onChange={(e) => setTagline(e.target.value)} 
              className="input-field w-full" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nomor WhatsApp Customer Service (CS)</label>
            <input 
              type="text" 
              value={csPhone} 
              onChange={(e) => setCsPhone(e.target.value)} 
              className="input-field w-full" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Wilayah Operasional Utama</label>
            <select 
              value={defaultRegion} 
              onChange={(e) => setDefaultRegion(e.target.value)}
              className="input-field w-full"
            >
              <option value="Kota Mataram">Kota Mataram</option>
              <option value="Lombok Barat (Senggigi)">Lombok Barat (Senggigi)</option>
              <option value="Lombok Tengah (Mandalika/Kuta)">Lombok Tengah (Mandalika/Kuta)</option>
              <option value="Lombok Timur">Lombok Timur</option>
              <option value="Lombok Utara (Gili)">Lombok Utara (Gili)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Admin Management */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck size={20} className="text-primary" /> Pengelola & Hak Akses Admin
            </h2>
            <p className="text-xs text-slate-500">Daftar pengguna dengan hak akses dashboard admin</p>
          </div>
          <button
            onClick={notifyAuthNotConnected}
            disabled
            title="Fitur ini belum terhubung ke sistem otentikasi - hubungi developer"
            className="py-1.5 px-3 text-sm flex items-center gap-1.5 rounded-lg bg-slate-200 text-slate-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400"
          >
            <Plus size={16} /> Tambah Admin
          </button>
        </div>

        <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Fitur ini belum terhubung ke sistem otentikasi - hubungi developer. Daftar di bawah hanya catatan
            lokal (bukan akun login Supabase sungguhan): menambah atau menghapus baris di sini <strong>tidak</strong> membuat
            atau mencabut akses masuk dashboard admin secara nyata.
          </span>
        </div>

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Nama Administrator</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Email</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Peran (Role)</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Status</th>
                <th className="px-6 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {admins.map(a => (
                <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{a.name}</td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-300">{a.email}</td>
                  <td className="px-6 py-4">
                    <span className="bg-cyan-100 text-cyan-800 px-2.5 py-1 rounded-full text-xs font-semibold dark:bg-cyan-900/30 dark:text-cyan-400">
                      {a.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      {a.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {/* Guard fixed to compare against the real 'Superadmin' role
                        string (no space) used everywhere else in this codebase -
                        it previously compared against 'Super Admin' (with a
                        space), which never matched. The action itself stays
                        disabled either way until real admin management ships. */}
                    {a.role !== 'Superadmin' && (
                      <button
                        onClick={notifyAuthNotConnected}
                        disabled
                        className="text-slate-400 p-1 rounded cursor-not-allowed"
                        title="Fitur ini belum terhubung ke sistem otentikasi - hubungi developer"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
