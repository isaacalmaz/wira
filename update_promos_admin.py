import re

with open('frontend-admin/src/pages/PromosPage.jsx', 'r') as f:
    content = f.read()

# Replace fetchPromos
fetch_promos_logic = """  const fetchPromos = async () => {
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
  };"""

content = re.sub(
    r'const fetchPromos = async \(\) => \{.*?(?=\s+const handleSave)', 
    fetch_promos_logic + "\n\n", 
    content, 
    flags=re.DOTALL
)

# Replace handleSave
handle_save_logic = """  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.code) {
      toast.error('Gelar dan Kode Wajib diisi');
      return;
    }

    try {
      if (selectedPromo) {
        const { error } = await supabase
          .from('promos')
          .update({
            title: formData.title,
            code: formData.code.toUpperCase(),
            type: formData.type,
            discount: parseInt(formData.discount),
            validUntil: formData.validUntil,
            status: formData.status
          })
          .eq('id', selectedPromo.id);
        if (error) throw error;
        toast.success('Promo berhasil diperbarui');
      } else {
        const { error } = await supabase
          .from('promos')
          .insert([{
            title: formData.title,
            code: formData.code.toUpperCase(),
            type: formData.type,
            discount: parseInt(formData.discount),
            validUntil: formData.validUntil,
            status: formData.status,
            service_type: 'ride'
          }]);
        if (error) throw error;
        toast.success('Promo baru berhasil ditambahkan');
      }
      
      setIsModalOpen(false);
      fetchPromos();
    } catch (err) {
      console.error('Error saving promo:', err);
      toast.error('Gagal menyimpan promo');
    }
  };"""

content = re.sub(
    r'const handleSave = async \(e\) => \{.*?(?=\s+const handleDelete)', 
    handle_save_logic + "\n\n", 
    content, 
    flags=re.DOTALL
)

# Replace handleDelete
handle_delete_logic = """  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from('promos')
        .delete()
        .eq('id', selectedPromo.id);
      
      if (error) throw error;
      toast.success('Promo dihapus');
      setIsDeleteOpen(false);
      fetchPromos();
    } catch (err) {
      console.error('Error deleting:', err);
      toast.error('Gagal menghapus promo');
    }
  };"""

content = re.sub(
    r'const handleDelete = async \(\) => \{.*?(?=\s+const handleToggleStatus)', 
    handle_delete_logic + "\n\n", 
    content, 
    flags=re.DOTALL
)

# Replace handleToggleStatus
handle_toggle_logic = """  const handleToggleStatus = async (promo) => {
    try {
      const newStatus = promo.status === 'Active' ? 'Inactive' : 'Active';
      const { error } = await supabase
        .from('promos')
        .update({ status: newStatus })
        .eq('id', promo.id);
      
      if (error) throw error;
      toast.success(`Promo ${newStatus === 'Active' ? 'diaktifkan' : 'dinonaktifkan'}`);
      fetchPromos();
    } catch (err) {
      console.error('Error toggle:', err);
      toast.error('Gagal merubah status');
    }
  };"""

content = re.sub(
    r'const handleToggleStatus = async \(promo\) => \{.*?(?=\s+const filteredPromos)', 
    handle_toggle_logic + "\n\n", 
    content, 
    flags=re.DOTALL
)

with open('frontend-admin/src/pages/PromosPage.jsx', 'w') as f:
    f.write(content)
