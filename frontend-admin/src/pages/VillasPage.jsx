import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, RefreshCw } from 'lucide-react';
import { supabase } from '../config/supabase';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../components/common/UIComponents';
import { Button, Input, PageHeader, Table } from '../components/ui';

const VillasPage = () => {
  const [villas, setVillas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchVillas = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('merchants')
      .select('*')
      .eq('service_type', 'villa')
      .order('created_at', { ascending: false });
    
    setVillas(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchVillas();
  }, []);

  const handleDelete = async (id) => {
    // Confirmation now happens in the ConfirmModal below (deleteTarget).
    try {
      const { error, data } = await supabase.from('merchants').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau data tidak ditemukan.');
      toast.success('Vila berhasil dihapus');
      fetchVillas();
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus vila');
    }
  };

  const filtered = villas.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="!mb-0"
        title="Manajemen Vila"
        subtitle="Kelola properti WiraVilla."
        actions={(
          <>
            <Button variant="secondary" onClick={fetchVillas} aria-label="Muat ulang" className="px-3">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </Button>
            <Button leftIcon={<Plus size={18} />} onClick={() => toast('Fitur tambah vila dalam pengembangan')}>
              Tambah Vila
            </Button>
          </>
        )}
      />

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} aria-hidden="true" />
          <Input type="text" aria-label="Cari nama vila" placeholder="Cari nama vila..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
        </div>
        <Table>
          <thead>
            <tr>
              <th>Nama Vila</th>
              <th>Alamat</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(v => (
              <tr key={v.id}>
                <td className="whitespace-nowrap font-semibold">{v.name}</td>
                <td className="text-ink-muted">{v.address}</td>
                <td className="text-right">
                  <Button size="sm" variant="danger-soft" leftIcon={<Trash2 size={15} />} onClick={() => setDeleteTarget(v)}>
                    Hapus
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan="3" className="py-10 text-center text-ink-muted">
                  {loading ? 'Memuat...' : 'Tidak ada vila.'}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        tone="danger"
        title="Hapus Vila"
        message={deleteTarget ? `Hapus vila "${deleteTarget.name}"?` : ''}
        confirmLabel="Hapus"
        onConfirm={() => { const id = deleteTarget.id; setDeleteTarget(null); handleDelete(id); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
export default VillasPage;
