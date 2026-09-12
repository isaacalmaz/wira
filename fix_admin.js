const fs = require('fs');
const path = 'frontend-admin/src/pages/FeatureFlagsPage.jsx';
let content = fs.readFileSync(path, 'utf8');

// Add states
content = content.replace(
  "const [saving, setSaving] = useState(false);",
  `const [saving, setSaving] = useState(false);\n  const [showAddZone, setShowAddZone] = useState(false);\n  const [newZone, setNewZone] = useState({ name: '', status_text: '' });\n\n  const handleAddZone = () => {\n    if (!newZone.name) return toast.error('Nama wilayah harus diisi');\n    const id = newZone.name.toLowerCase().replace(/[^a-z0-9]/g, '_');\n    if (zones.some(z => z.id === id)) return toast.error('Wilayah sudah ada');\n    const zoneToAdd = {\n      id,\n      name: newZone.name,\n      status_text: newZone.status_text || 'Zona Baru',\n      services: { ride: false, food: false, send: false, villa: false, service: false, pay: false, pulsa: false, pool: false }\n    };\n    setZones([...zones, zoneToAdd]);\n    setShowAddZone(false);\n    setNewZone({ name: '', status_text: '' });\n    toast.success('Wilayah ditambahkan. Klik Simpan Perubahan untuk mengunci ke database.');\n  };`
);

// Add Add button UI and Modal
const newHeader = `
      <div className="mt-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Manajemen Wilayah Operasional</h2>
          <button onClick={() => setShowAddZone(true)} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors">
            + Tambah Wilayah
          </button>
        </div>
        
        {showAddZone && (
          <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 border border-emerald-200 dark:border-emerald-800 rounded-lg flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-slate-500 mb-1">Nama Wilayah</label>
              <input type="text" value={newZone.name} onChange={e => setNewZone({...newZone, name: e.target.value})} placeholder="Contoh: Kuta Mandalika" className="w-full px-3 py-2 border rounded bg-white dark:bg-slate-900 dark:border-slate-700" />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-slate-500 mb-1">Status / Label</label>
              <input type="text" value={newZone.status_text} onChange={e => setNewZone({...newZone, status_text: e.target.value})} placeholder="Contoh: Zona Wisata" className="w-full px-3 py-2 border rounded bg-white dark:bg-slate-900 dark:border-slate-700" />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button onClick={handleAddZone} className="px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 whitespace-nowrap">Tambah</button>
              <button onClick={() => setShowAddZone(false)} className="px-4 py-2 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 whitespace-nowrap">Batal</button>
            </div>
          </div>
        )}
`;

content = content.replace(
  `<div className="mt-8">\n        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Manajemen Wilayah Operasional</h2>`,
  newHeader.trim()
);

fs.writeFileSync(path, content);
console.log('Admin UI patched!');
