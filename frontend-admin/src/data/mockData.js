// Mock Data Terpusat untuk Aplikasi Admin Wira

export const dashboardStats = {
  totalUsers: 12456,
  ordersToday: 234,
  revenueToday: 15500000,
  activeDrivers: 45,
  revenueChart: [
    { name: 'Sen', total: 4000000 },
    { name: 'Sel', total: 3000000 },
    { name: 'Rab', total: 5000000 },
    { name: 'Kam', total: 2780000 },
    { name: 'Jum', total: 6890000 },
    { name: 'Sab', total: 8390000 },
    { name: 'Min', total: 9490000 },
  ],
  ordersByType: [
    { name: 'WiraRide', value: 400 },
    { name: 'WiraFood', value: 300 },
    { name: 'WiraSend', value: 300 },
    { name: 'Lainnya', value: 200 },
  ]
};

export const featureFlagsData = [
  { id: 'ride', name: 'WiraRide', status: true, regions: ['Semua'] },
  { id: 'food', name: 'WiraFood', status: true, regions: ['Mataram', 'Senggigi'] },
  { id: 'send', name: 'WiraSend', status: true, regions: ['Semua'] },
  { id: 'pay', name: 'WiraPay', status: false, regions: [] },
  { id: 'pulsa', name: 'WiraPulsa', status: true, regions: ['Semua'] },
  { id: 'villa', name: 'WiraVilla', status: true, regions: ['Senggigi', 'Lombok Tengah'] },
  { id: 'service', name: 'WiraService', status: false, regions: ['Mataram'] },
  { id: 'pool', name: 'WiraPool', status: false, regions: [] },
];

export const mockUsers = [
  { id: 'U001', name: 'Ahmad Budi', phone: '081234567890', email: 'ahmad@gmail.com', role: 'Pelanggan', joinDate: '2023-01-15', status: 'Aktif', balance: 50000 },
  { id: 'U002', name: 'Siti Aminah', phone: '081987654321', email: 'siti@yahoo.com', role: 'Pelanggan', joinDate: '2023-02-20', status: 'Aktif', balance: 120000 },
  { id: 'U003', name: 'Joko Susilo', phone: '085333444555', email: 'joko@gmail.com', role: 'Mitra Pengemudi', joinDate: '2023-03-10', status: 'Suspend', balance: 0 },
];

export const mockOrders = [
  { id: 'ORD-1001', user: 'Ahmad Budi', type: 'WiraRide', status: 'completed', total: 25000, date: '2023-11-01 14:30' },
  { id: 'ORD-1002', user: 'Siti Aminah', type: 'WiraFood', status: 'active', total: 75000, date: '2023-11-01 15:45' },
  { id: 'ORD-1003', user: 'Budi Santoso', type: 'WiraSend', status: 'pending', total: 15000, date: '2023-11-01 16:00' },
  { id: 'ORD-1004', user: 'Rina Melati', type: 'WiraVilla', status: 'cancelled', total: 1500000, date: '2023-11-01 10:00' },
];
