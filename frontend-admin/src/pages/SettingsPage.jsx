import { useState } from 'react';
import { FormField, StatusBadge } from '../components/common/UIComponents';
import { mockAdmins } from '../data/mockData2';
import toast from 'react-hot-toast';

const SettingsPage = () => {
  const [appName, setAppName] = useState('Wira Super App');
  const [tagline, setTagline] = useState('Semua Kebutuhan Lombok');
  const [defaultRegion, setDefaultRegion] = useState('Mataram');

  const [admins] = useState(mockAdmins);

  const handleSaveApp = () => {
    toast.success('Pengaturan Aplikasi disimpan');
  };

  const handleSavePricing = () => {
    toast.success('Pengaturan Harga disimpan');
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pengaturan Sistem</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* App Settings */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">Pengaturan Dasar Aplikasi</h2>
          <FormField label="Nama Aplikasi" value={appName} onChange={(e) => setAppName(e.target.value)} />
          <FormField label="Tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
          <FormField 
            label="Default Region" 
            type="select" 
            value={defaultRegion} 
            onChange={(e) => setDefaultRegion(e.target.value)}
            options={[
              { value: 'Mataram', label: 'Kota Mataram' },
              { value: 'Senggigi', label: 'Senggigi' },
              { value: 'Lombok Tengah', label: 'Lombok Tengah' }
            ]} 
          />
          <button onClick={handleSaveApp} className="btn-primary mt-2">Simpan Pengaturan Dasar</button>
        </div>

        {/* Pricing Settings */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">Pengaturan Harga Dasar</h2>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="WiraRide (per km)" type="number" value="2500" onChange={()=>{}} />
            <FormField label="WiraFood (Ongkir Dasar)" type="number" value="8000" onChange={()=>{}} />
            <FormField label="WiraSend (per km)" type="number" value="3000" onChange={()=>{}} />
            <FormField label="Biaya Layanan Admin" type="number" value="2000" onChange={()=>{}} />
          </div>
          <button onClick={handleSavePricing} className="btn-primary mt-2 bg-secondary hover:bg-yellow-600 focus:ring-secondary text-white">Simpan Harga</button>
        </div>

      </div>

      {/* Admin Management */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Manajemen Admin & Peran</h2>
          <button className="btn-primary py-1.5 text-sm">Tambah Admin</button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Nama / Email</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Peran (Role)</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Status</th>
                <th className="px-6 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {admins.map(a => (
                <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 dark:text-white">{a.name}</div>
                    <div className="text-slate-500 text-xs">{a.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-cyan-100 text-cyan-800 px-2 py-1 rounded text-xs font-medium dark:bg-cyan-900/30 dark:text-cyan-400">
                      {a.role}
                    </span>
                  </td>
                  <td className="px-6 py-4"><StatusBadge status={a.status} /></td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-blue-500 text-sm font-medium hover:underline">Edit</button>
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
