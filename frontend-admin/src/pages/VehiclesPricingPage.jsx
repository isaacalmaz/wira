import { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Save, X } from 'lucide-react';
import { supabase } from '../config/supabase';
import toast from 'react-hot-toast';

const emptyDraft = { name: '', type: '', service_type: 'ride', price: 0, per_km_rate: 0, capacity: 1, duration: '', is_active: true };

const VehiclesPricingPage = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState({});
  const [showNewForm, setShowNewForm] = useState(false);
  const [newDraft, setNewDraft] = useState(emptyDraft);

  const fetchVehicles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .order('service_type', { ascending: true })
      .order('price', { ascending: true });

    if (error) {
      toast.error('Gagal memuat data kendaraan');
    } else {
      setVehicles(data || []);
      setEdits({});
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const getField = (v, field) => (edits[v.id]?.[field] !== undefined ? edits[v.id][field] : v[field]);

  const setField = (id, field, value) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const isDirty = (id) => !!edits[id];

  const handleSaveRow = async (v) => {
    const patch = edits[v.id];
    if (!patch) return;
    try {
      const { error, data } = await supabase
        .from('vehicles')
        .update(patch)
        .eq('id', v.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau data tidak ditemukan.');
      toast.success(`${v.name} berhasil diperbarui`);
      fetchVehicles();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan perubahan');
    }
  };

  const handleDelete = async (v) => {
    if (!window.confirm(`Hapus "${v.name}" dari daftar harga?`)) return;
    try {
      const { error, data } = await supabase.from('vehicles').delete().eq('id', v.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau data tidak ditemukan.');
      toast.success('Berhasil dihapus');
      fetchVehicles();
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus');
    }
  };

  const handleCreate = async () => {
    if (!newDraft.name || !newDraft.type) {
      toast.error('Nama dan tipe wajib diisi');
      return;
    }
    try {
      const { error, data } = await supabase.from('vehicles').insert([newDraft]).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak saat menambahkan.');
      toast.success('Kendaraan baru ditambahkan');
      setNewDraft(emptyDraft);
      setShowNewForm(false);
      fetchVehicles();
    } catch (err) {
      toast.error(err.message || 'Gagal menambahkan kendaraan');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Harga & Kendaraan</h1>
          <p className="text-sm text-slate-500">Kelola tarif dasar dan tarif per-km tiap jenis layanan. Perubahan berlaku langsung ke aplikasi pelanggan.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchVehicles} className="p-2 border rounded-xl hover:bg-slate-50 dark:border-slate-700">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowNewForm(v => !v)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl">
            <Plus size={20} /> Tambah
          </button>
        </div>
      </div>

      {showNewForm && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <input placeholder="Nama (mis. WiraRide Motor)" value={newDraft.name} onChange={e => setNewDraft({ ...newDraft, name: e.target.value })} className="col-span-2 px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <input placeholder="Tipe (mis. motor)" value={newDraft.type} onChange={e => setNewDraft({ ...newDraft, type: e.target.value })} className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <input placeholder="Layanan (mis. ride)" value={newDraft.service_type} onChange={e => setNewDraft({ ...newDraft, service_type: e.target.value })} className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <input type="number" placeholder="Harga dasar" value={newDraft.price} onChange={e => setNewDraft({ ...newDraft, price: Number(e.target.value) })} className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <input type="number" placeholder="Tarif/km" value={newDraft.per_km_rate} onChange={e => setNewDraft({ ...newDraft, per_km_rate: Number(e.target.value) })} className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <input type="number" placeholder="Kapasitas" value={newDraft.capacity} onChange={e => setNewDraft({ ...newDraft, capacity: Number(e.target.value) })} className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <input placeholder="Estimasi durasi (mis. 15 mnt)" value={newDraft.duration} onChange={e => setNewDraft({ ...newDraft, duration: e.target.value })} className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <div className="col-span-2 sm:col-span-4 flex gap-2 justify-end">
            <button onClick={() => { setShowNewForm(false); setNewDraft(emptyDraft); }} className="px-4 py-2 rounded-lg border dark:border-slate-700 flex items-center gap-1">
              <X size={16} /> Batal
            </button>
            <button onClick={handleCreate} className="px-4 py-2 rounded-lg bg-primary text-white flex items-center gap-1">
              <Save size={16} /> Simpan
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
              <tr>
                <th className="p-4 font-semibold">Layanan</th>
                <th className="p-4 font-semibold">Nama</th>
                <th className="p-4 font-semibold">Tipe</th>
                <th className="p-4 font-semibold">Harga Dasar</th>
                <th className="p-4 font-semibold">Tarif/km</th>
                <th className="p-4 font-semibold">Kapasitas</th>
                <th className="p-4 font-semibold">Durasi</th>
                <th className="p-4 font-semibold">Aktif</th>
                <th className="p-4 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {vehicles.map(v => (
                <tr key={v.id} className={isDirty(v.id) ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}>
                  <td className="p-4 text-slate-500">{v.service_type}</td>
                  <td className="p-4 font-bold text-slate-900 dark:text-white">{v.name}</td>
                  <td className="p-4 text-slate-500">{v.type}</td>
                  <td className="p-4">
                    <input
                      type="number"
                      value={getField(v, 'price')}
                      onChange={e => setField(v.id, 'price', Number(e.target.value))}
                      className="w-28 px-2 py-1 rounded border dark:bg-slate-900 dark:border-slate-700"
                    />
                  </td>
                  <td className="p-4">
                    <input
                      type="number"
                      value={getField(v, 'per_km_rate')}
                      onChange={e => setField(v.id, 'per_km_rate', Number(e.target.value))}
                      className="w-24 px-2 py-1 rounded border dark:bg-slate-900 dark:border-slate-700"
                    />
                  </td>
                  <td className="p-4">
                    <input
                      type="number"
                      value={getField(v, 'capacity')}
                      onChange={e => setField(v.id, 'capacity', Number(e.target.value))}
                      className="w-16 px-2 py-1 rounded border dark:bg-slate-900 dark:border-slate-700"
                    />
                  </td>
                  <td className="p-4">
                    <input
                      value={getField(v, 'duration') || ''}
                      onChange={e => setField(v.id, 'duration', e.target.value)}
                      className="w-24 px-2 py-1 rounded border dark:bg-slate-900 dark:border-slate-700"
                    />
                  </td>
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={!!getField(v, 'is_active')}
                      onChange={e => setField(v.id, 'is_active', e.target.checked)}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="p-4 flex gap-2">
                    <button
                      disabled={!isDirty(v.id)}
                      onClick={() => handleSaveRow(v)}
                      className="p-1.5 text-primary disabled:text-slate-300 disabled:cursor-not-allowed hover:bg-primary/10 rounded-lg transition"
                      title="Simpan perubahan"
                    >
                      <Save size={16} />
                    </button>
                    <button onClick={() => handleDelete(v)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition" title="Hapus">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {vehicles.length === 0 && !loading && (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-500">Belum ada data kendaraan/harga.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default VehiclesPricingPage;
