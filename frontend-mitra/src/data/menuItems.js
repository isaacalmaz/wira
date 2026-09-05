// Data dummy untuk menu merchant khas Lombok
export const categories = [
  { id: 'cat1', name: 'Makanan Utama' },
  { id: 'cat2', name: 'Minuman' },
  { id: 'cat3', name: 'Camilan' },
  { id: 'cat4', name: 'Paket Hemat' }
];

export const initialMenuItems = [
  {
    id: 'm1',
    categoryId: 'cat1',
    name: 'Ayam Taliwang Pedas',
    description: 'Ayam kampung bakar khas Taliwang dengan bumbu pedas manis, disajikan dengan plecing kangkung.',
    price: 45000,
    image: 'https://images.unsplash.com/photo-1627042633145-b780d842ba45?auto=format&fit=crop&q=80&w=200&h=200',
    isAvailable: true,
  },
  {
    id: 'm2',
    categoryId: 'cat1',
    name: 'Sate Bulayak',
    description: 'Sate daging sapi bumbu khas Lombok disajikan dengan lontong bulayak (dibungkus daun aren).',
    price: 35000,
    image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80&w=200&h=200',
    isAvailable: true,
  },
  {
    id: 'm3',
    categoryId: 'cat1',
    name: 'Nasi Balap Puyung',
    description: 'Nasi putih dengan ayam suwir pedas, kedelai goreng, dan kelapa parut.',
    price: 25000,
    image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&q=80&w=200&h=200',
    isAvailable: false,
  },
  {
    id: 'm4',
    categoryId: 'cat2',
    name: 'Es Jeruk Nipis Peras',
    description: 'Es jeruk nipis segar pelepas dahaga.',
    price: 10000,
    image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=200&h=200',
    isAvailable: true,
  },
  {
    id: 'm5',
    categoryId: 'cat2',
    name: 'Es Kelapa Muda',
    description: 'Es kelapa muda asli dengan gula merah cair.',
    price: 15000,
    image: 'https://images.unsplash.com/photo-1516044734143-690a2a5370d0?auto=format&fit=crop&q=80&w=200&h=200',
    isAvailable: true,
  }
];
