import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { FormField } from '../components/common/UIComponents';
import { Settings, Save, ShieldCheck, Plus, Trash2, X, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const SettingsPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // App Settings
  const [appName, setAppName] = useState('Wira Super App');
  const [tagline, setTagline] = useState('Semua Kebutuhan Pulau Lombok');
  const [defaultRegion, setDefaultRegion] = useState('Kota Mataram');
  const [csPhone, setCsPhone] = useState('081234567890');

  // Pricing Settings
  const [wiraRidePrice, setWiraRidePrice] = useState('2500');
  const [wiraFoodPrice, setWiraFoodPrice] = useState('8000');
  const [wiraSendPrice, setWiraSendPrice] = useState('3000');
  const [adminFee, setAdminFee] = useState('2000');

  // Admin users
  const [admins, setAdmins] = useState([
    { id: 'adm_1', name: 'Super Administrator', email: 'admin@wira.app', role: 'Super Admin', status: 'Active' }
  ]);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ name: '', email: '', role: 'Admin Operasional' });

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
        if (s.wiraRidePrice) setWiraRidePrice(String(s.wiraRidePrice));
        if (s.wiraFoodPrice) setWiraFoodPrice(String(s.wiraFoodPrice));
        if (s.wiraSendPrice) setWiraSendPrice(String(s.wiraSendPrice));
        if (s.adminFee) setAdminFee(String(s.adminFee));
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
      wiraRidePrice: Number(wiraRidePrice) || 2500,
      wiraFoodPrice: Number(wiraFoodPrice) || 8000,
      wiraSendPrice: Number(wiraSendPrice) || 3000,
      adminFee: Number(adminFee) || 2000,
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

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    if (!newAdmin.name || !newAdmin.email) {
      toast.error('Nama dan Email wajib diisi');
      return;
    }

    const updatedAdmins = [
      ...admins,
      {
        id: 'adm_' + Date.now(),
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role,
        status: 'Active'
      }
    ];

    setAdmins(updatedAdmins);
    setIsAddAdminOpen(false);
    setNewAdmin({ name: '', email: '', role: 'Admin Operasional' });
    await saveSettingsToCloud(updatedAdmins);
    toast.success('Admin baru berhasil ditambahkan');
  };

  const handleDeleteAdmin = async (id) => {
    if (admins.length <= 1) {
      toast.error('Minimal harus ada 1 Super Administrator');
      return;
    }
    const updated = admins.filter(a => a.id !== id);
    setAdmins(updated);
    await saveSettingsToCloud(updated);
    toast.success('Admin berhasil dihapus');
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

        {/* Pricing Settings */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
            Tarif Dasar Layanan
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">WiraRide (per km)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">Rp</span>
                <input 
                  type="number" 
                  value={wiraRidePrice} 
                  onChange={(e) => setWiraRidePrice(e.target.value)}
                  className="input-field pl-9 w-full" 
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">WiraFood (Ongkir)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">Rp</span>
                <input 
                  type="number" 
                  value={wiraFoodPrice} 
                  onChange={(e) => setWiraFoodPrice(e.target.value)}
                  className="input-field pl-9 w-full" 
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">WiraSend (per km)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">Rp</span>
                <input 
                  type="number" 
                  value={wiraSendPrice} 
                  onChange={(e) => setWiraSendPrice(e.target.value)}
                  className="input-field pl-9 w-full" 
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Biaya Layanan Admin</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">Rp</span>
                <input 
                  type="number" 
                  value={adminFee} 
                  onChange={(e) => setAdminFee(e.target.value)}
                  className="input-field pl-9 w-full" 
                />
              </div>
            </div>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-xs text-blue-700 dark:text-blue-300">
            ℹ️ Tarif dasar di atas digunakan secara otomatis oleh kalkulator rute dan checkout pada aplikasi pengguna.
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
          <button onClick={() => setIsAddAdminOpen(true)} className="btn-primary py-1.5 px-3 text-sm flex items-center gap-1.5">
            <Plus size={16} /> Tambah Admin
          </button>
        </div>
        
        <div className="overflow-x-auto">
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
                    {a.role !== 'Super Admin' && (
                      <button 
                        onClick={() => handleDeleteAdmin(a.id)} 
                        className="text-red-500 hover:text-red-700 p-1 rounded"
                        title="Hapus Admin"
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

      {/* Modal Add Admin */}
      {isAddAdminOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Tambah Administrator Baru</h3>
              <button onClick={() => setIsAddAdminOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddAdmin} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Lengkap</label>
                <input 
                  type="text" 
                  value={newAdmin.name} 
                  onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                  placeholder="Contoh: Budi Santoso" 
                  className="input-field w-full" 
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                <input 
                  type="email" 
                  value={newAdmin.email} 
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  placeholder="admin@wira.app" 
                  className="input-field w-full" 
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Peran (Role)</label>
                <select 
                  value={newAdmin.role} 
                  onChange={(e) => setNewAdmin({ ...newAdmin, role: e.target.value })}
                  className="input-field w-full"
                >
                  <option value="Admin Operasional">Admin Operasional</option>
                  <option value="Admin Keuangan">Admin Keuangan</option>
                  <option value="Customer Service">Customer Service</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button type="button" onClick={() => setIsAddAdminOpen(false)} className="btn-secondary">
                  Batal
                </button>
                <button type="submit" className="btn-primary">
                  Simpan Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
