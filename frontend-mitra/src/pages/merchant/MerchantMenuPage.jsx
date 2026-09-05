import React, { useState } from 'react';
import { initialMenuItems, categories } from '../../data/menuItems';
import { Plus, Edit2, Trash2, GripVertical, Search } from 'lucide-react';

const MerchantMenuPage = () => {
  const [menuItems, setMenuItems] = useState(initialMenuItems);
  const [activeCategory, setActiveCategory] = useState(categories[0].id);
  const [searchTerm, setSearchTerm] = useState('');

  // Toggle status habis/tersedia
  const toggleStatus = (id) => {
    setMenuItems(menuItems.map(item => 
      item.id === id ? { ...item, isAvailable: !item.isAvailable } : item
    ));
  };

  const filteredItems = menuItems.filter(item => 
    item.categoryId === activeCategory && 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Manajemen Menu</h1>
        <button className="bg-primary text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-opacity-90">
          <Plus size={20} /> <span className="hidden sm:inline">Tambah Menu</span>
        </button>
      </div>

      {/* Kategori Tabs */}
      <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeCategory === cat.id 
                ? 'bg-secondary text-white shadow-sm' 
                : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Pencarian */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder="Cari menu..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none"
        />
      </div>

      {/* Daftar Menu */}
      <div className="space-y-4">
        {filteredItems.length > 0 ? (
          filteredItems.map(item => (
            <div key={item.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex gap-4 items-center">
              <div className="cursor-grab active:cursor-grabbing text-slate-400">
                <GripVertical size={20} />
              </div>
              
              <img src={item.image} alt={item.name} className="w-20 h-20 rounded-lg object-cover bg-slate-100" />
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-lg text-slate-800 dark:text-white truncate">{item.name}</h3>
                  <span className="font-bold text-primary whitespace-nowrap ml-2">Rp {item.price.toLocaleString('id-ID')}</span>
                </div>
                <p className="text-sm text-slate-500 line-clamp-2 mt-1">{item.description}</p>
                
                <div className="flex justify-between items-center mt-3">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => toggleStatus(item.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        item.isAvailable ? 'bg-green-500' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        item.isAvailable ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                    <span className={`text-sm font-medium ${item.isAvailable ? 'text-green-600' : 'text-slate-500'}`}>
                      {item.isAvailable ? 'Tersedia' : 'Habis'}
                    </span>
                  </div>
                  
                  <div className="flex gap-2">
                    <button className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                      <Edit2 size={18} />
                    </button>
                    <button className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-xl border border-slate-100">
            <p className="text-slate-500">Tidak ada menu di kategori ini.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MerchantMenuPage;
