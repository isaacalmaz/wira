import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Edit, Trash2, Tag, RefreshCw, Check, Ticket } from 'lucide-react';
import { supabase } from '../config/supabase';
import { ConfirmModal } from '../components/common/UIComponents';
import toast from 'react-hot-toast';
import { Badge, Button, Field, IconTile, Input, Money, PageHeader, Select, Sheet, Stat, Table } from '../components/ui';

const PromosPage = () => {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState(null);

  const emptyFormData = {
    title: '',
    description: '',
    code: '',
    service_type: '',
    type: 'Percentage',
    discount: '20',
    validUntil: '',
    status: 'Active',
    usage_limit: '',
    per_user_limit: ''
  };
  const [formData, setFormData] = useState(emptyFormData);

  const fetchPromos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('promos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPromos(data || []);
    } catch (err) {
      console.error('Error fetching promos:', err);
      toast.error('Gagal memuat promo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromos();
  }, []);

  const handleOpenAdd = () => {
    setSelectedPromo(null);
    setFormData(emptyFormData);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (promo) => {
    setSelectedPromo(promo);
    setFormData({
      title: promo.title || '',
      description: promo.description || '',
      code: promo.code || '',
      service_type: promo.service_type || '',
      type: promo.type || 'Percentage',
      discount: String(promo.discount ?? 0),
      validUntil: promo.validUntil || '',
      status: promo.status || 'Active',
      usage_limit: promo.usage_limit != null ? String(promo.usage_limit) : '',
      per_user_limit: promo.per_user_limit != null ? String(promo.per_user_limit) : ''
    });
    setIsModalOpen(true);
  };

  const handleSavePromo = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.code.trim()) {
      toast.error('Judul dan Kode promo wajib diisi');
      return;
    }
    const discount = Number(formData.discount);
    if (!Number.isFinite(discount) || discount <= 0) {
      toast.error('Isi besar diskon lebih dari 0');
      return;
    }
    if (formData.type === 'Percentage' && discount > 100) {
      toast.error('Diskon persentase maksimal 100%');
      return;
    }

    const payload = {
      title: formData.title.trim(),
      description: formData.description?.trim() || null,
      code: formData.code.toUpperCase().replace(/\s+/g, ''),
      service_type: formData.service_type?.trim() || null,
      type: formData.type,
      discount: Number(formData.discount) || 0,
      validUntil: formData.validUntil || null,
      status: formData.status,
      usage_limit: formData.usage_limit === '' ? null : Number(formData.usage_limit),
      // Enforced in the database at order creation (migrations/0076).
      per_user_limit: formData.per_user_limit === '' ? null : Number(formData.per_user_limit),
    };

    try {
      if (selectedPromo) {
        const { data, error } = await supabase
          .from('promos')
          .update(payload)
          .eq('id', selectedPromo.id)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Akses ditolak atau promo tidak ditemukan.');
        toast.success('Promo berhasil diperbarui');
      } else {
        const { data, error } = await supabase
          .from('promos')
          .insert([{ ...payload, usage: 0 }])
          .select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Akses ditolak saat membuat promo.');
        toast.success('Promo baru berhasil dibuat');
      }
      setIsModalOpen(false);
      fetchPromos();
    } catch (err) {
      console.error('Error saving promo:', err);
      toast.error(err.message || 'Gagal menyimpan promo');
    }
  };

  const toggleStatus = async (promo) => {
    try {
      const newStatus = promo.status === 'Active' ? 'Inactive' : 'Active';
      const { data, error } = await supabase
        .from('promos')
        .update({ status: newStatus })
        .eq('id', promo.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak.');
      setPromos(prev => prev.map(p => (p.id === promo.id ? { ...p, status: newStatus } : p)));
      toast.success('Status promo diubah');
    } catch (err) {
      console.error('Error toggling promo status:', err);
      toast.error(err.message || 'Gagal mengubah status promo');
    }
  };

  const handleDelete = async () => {
    try {
      const { data, error } = await supabase
        .from('promos')
        .delete()
        .eq('id', selectedPromo.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau promo tidak ditemukan.');
      setPromos(prev => prev.filter(p => p.id !== selectedPromo.id));
      toast.success('Promo berhasil dihapus');
    } catch (err) {
      console.error('Error deleting promo:', err);
      toast.error(err.message || 'Gagal menghapus promo');
    } finally {
      setIsDeleteOpen(false);
    }
  };

  const filtered = promos.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stable close handler: Sheet re-runs its focus effect when onClose changes,
  // which would pull focus back to the first field on every keystroke.
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  const activeCount = promos.filter(p => p.status === 'Active').length;
  const totalUsage = promos.reduce((sum, p) => sum + (Number(p.usage) || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="!mb-0"
        title="Promo & kupon"
        subtitle="Kelola voucher diskon dan penawaran khusus pengguna"
        actions={(
          <>
            <Button variant="secondary" onClick={fetchPromos} aria-label="Muat Ulang" title="Muat Ulang" className="px-3">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </Button>
            <Button onClick={handleOpenAdd} leftIcon={<Plus size={18} />}>Tambah Promo</Button>
          </>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total Promo" value={loading ? '–' : promos.length} icon={<Tag size={18} />} />
        <Stat label="Promo Aktif" value={loading ? '–' : activeCount} icon={<Check size={18} />} tone="success" />
        <Stat label="Total Pemakaian" value={loading ? '–' : totalUsage.toLocaleString('id-ID')} icon={<Ticket size={18} />} tone="neutral" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} aria-hidden="true" />
          <Input
            type="text"
            aria-label="Cari nama atau kode promo"
            placeholder="Cari nama atau kode promo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Table>
          <thead>
            <tr>
              <th>Nama Promo</th>
              <th>Kode Voucher</th>
              <th className="text-right">Potongan Diskon</th>
              <th>Berlaku s/d</th>
              <th className="text-right">Penggunaan</th>
              <th>Status</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="7" className="py-12">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <IconTile tone="neutral" size="lg"><Tag size={24} /></IconTile>
                    <p className="text-[15px] font-bold text-ink">Belum ada promo aktif</p>
                    <p className="text-[13px] text-ink-muted">Klik tombol "Tambah Promo" untuk membuat voucher diskon baru</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr key={p.id}>
                  <td className="font-semibold">{p.title}</td>
                  <td>
                    <span className="inline-block whitespace-nowrap rounded-[8px] border border-line bg-sunken px-2 py-0.5 font-mono text-[12.5px] font-medium tracking-wider text-ink">
                      {p.code}
                    </span>
                  </td>
                  <td className="text-right">
                    {p.type === 'Percentage'
                      ? <span className="font-mono font-medium">{`${p.discount}%`}</span>
                      : <Money value={p.discount} className="font-medium" />}
                  </td>
                  <td className="whitespace-nowrap font-mono text-[13px] text-ink-muted">{p.validUntil || '-'}</td>
                  <td className="whitespace-nowrap text-right">
                    <span className="font-mono">{p.usage || 0}{p.usage_limit != null ? ` / ${p.usage_limit}` : ''}</span>x dipakai
                    {p.per_user_limit != null && (
                      <div className="text-xs text-ink-muted">maks. <span className="font-mono">{p.per_user_limit}</span>x per pengguna</div>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={p.status === 'Active'}
                        onChange={() => toggleStatus(p)}
                        label={`Status promo ${p.code}`}
                        title="Klik untuk ubah status"
                      />
                      <Badge tone={p.status === 'Active' ? 'success' : 'neutral'} dot>
                        {p.status === 'Active' ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" leftIcon={<Edit size={15} />} onClick={() => handleOpenEdit(p)} title="Ubah">
                        Edit
                      </Button>
                      <Button size="sm" variant="danger-soft" leftIcon={<Trash2 size={15} />} onClick={() => { setSelectedPromo(p); setIsDeleteOpen(true); }} title="Hapus">
                        Hapus
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>

      {/* Modal Add/Edit Promo */}
      <Sheet
        open={isModalOpen}
        onClose={closeModal}
        title={selectedPromo ? 'Edit Promo' : 'Buat Promo Baru'}
        icon={<Tag size={20} />}
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={closeModal}>
              Batal
            </Button>
            <Button type="submit" form="promo-form" leftIcon={<Check size={18} />}>
              Simpan Promo
            </Button>
          </>
        )}
      >
        <form id="promo-form" onSubmit={handleSavePromo} className="flex flex-col gap-4">
          <Field label="Nama Promo" htmlFor="promo-title">
            <Input
              id="promo-title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Contoh: Diskon Pengguna Baru Wira"
              required
            />
          </Field>

          <Field label="Kode Voucher" htmlFor="promo-code">
            <Input
              id="promo-code"
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="Contoh: WIRABARU"
              className="uppercase font-mono"
              required
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tipe Potongan" htmlFor="promo-type">
              <Select
                id="promo-type"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="Percentage">Persentase (%)</option>
                <option value="Fixed">Nominal Tetap (Rp)</option>
              </Select>
            </Field>
            <Field label={formData.type === 'Percentage' ? 'Diskon (%)' : 'Diskon (Rp)'} htmlFor="promo-discount">
              <Input
                id="promo-discount"
                type="number"
                value={formData.discount}
                onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                placeholder={formData.type === 'Percentage' ? '20' : '10000'}
                className="font-mono"
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Berlaku Sampai" htmlFor="promo-valid">
              <Input
                id="promo-valid"
                type="date"
                value={formData.validUntil}
                onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                className="font-mono"
                required
              />
            </Field>
            <Field label="Status" htmlFor="promo-status">
              <Select
                id="promo-status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="Active">Aktif</option>
                <option value="Inactive">Nonaktif</option>
              </Select>
            </Field>
          </div>

          <Field label="Layanan (opsional)" htmlFor="promo-service">
            <Select
              id="promo-service"
              value={formData.service_type}
              onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}
            >
              <option value="">Semua Layanan</option>
              <option value="ride">WiraRide</option>
              <option value="food">WiraFood</option>
              <option value="send">WiraSend</option>
              <option value="villa">WiraVilla</option>
              <option value="service">WiraService</option>
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Batas Pemakaian" hint="Kosongkan = tanpa batas" htmlFor="promo-usage-limit">
              <Input
                id="promo-usage-limit"
                type="number"
                min="1"
                value={formData.usage_limit}
                onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                placeholder="Tanpa batas"
                className="font-mono"
              />
            </Field>
            <Field label="Batas per Pengguna" hint="Kosongkan = tanpa batas" htmlFor="promo-per-user-limit">
              <Input
                id="promo-per-user-limit"
                type="number"
                min="1"
                value={formData.per_user_limit}
                onChange={(e) => setFormData({ ...formData, per_user_limit: e.target.value })}
                placeholder="Tanpa batas"
                className="font-mono"
              />
            </Field>
          </div>
        </form>
      </Sheet>

      <ConfirmModal
        isOpen={isDeleteOpen}
        tone="danger"
        confirmLabel="Hapus"
        title="Hapus Promo"
        message={`Apakah Anda yakin ingin menghapus promo "${selectedPromo?.code}"?`}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
};

// On/off switch: 44px touch area around a compact track.
function Switch({ checked, onChange, label, title, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onChange}
      className="group inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span className={`relative inline-flex h-6 w-10 items-center rounded-full border transition-colors ${checked ? 'border-brand bg-brand' : 'border-line-strong bg-sunken'} group-focus-visible:ring-2 group-focus-visible:ring-brand/30`}>
        <span className={`absolute left-0.5 h-[18px] w-[18px] rounded-full bg-card shadow-[0_1px_2px_rgba(6,47,60,0.25)] transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
    </button>
  );
}

export default PromosPage;
