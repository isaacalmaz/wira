// Mock Data Terpusat Lanjutan untuk Aplikasi Admin Wira

export * from './mockData';

export const mockDrivers = [
  { id: 'DRV-001', name: 'Budi Santoso', phone: '081234567891', vehicle: 'Motor - Honda Vario', plate: 'DR 1234 AB', status: 'Pending', rating: 0, trips: 0 },
  { id: 'DRV-002', name: 'Andi Wijaya', phone: '081234567892', vehicle: 'Mobil - Toyota Avanza', plate: 'DR 5678 CD', status: 'Active', rating: 4.8, trips: 145 },
  { id: 'DRV-003', name: 'Cici Paramida', phone: '081234567893', vehicle: 'Motor - Yamaha NMAX', plate: 'DR 9012 EF', status: 'Active', rating: 4.9, trips: 312 },
  { id: 'DRV-004', name: 'Dodi Hermawan', phone: '081234567894', vehicle: 'Mobil - Honda Brio', plate: 'DR 3456 GH', status: 'Inactive', rating: 4.2, trips: 56 },
  { id: 'DRV-005', name: 'Eko Prasetyo', phone: '081234567895', vehicle: 'Motor - Honda Beat', plate: 'DR 7890 IJ', status: 'Pending', rating: 0, trips: 0 },
];

export const mockMerchants = [
  { id: 'MER-001', name: 'Warung Taliwang Khas', owner: 'Pak Samsul', phone: '082345678901', restaurants: 2, status: 'Active', joinDate: '2023-01-10' },
  { id: 'MER-002', name: 'Sate Rembiga Utama', owner: 'Ibu Ningsih', phone: '082345678902', restaurants: 1, status: 'Pending', joinDate: '2023-11-02' },
  { id: 'MER-003', name: 'Kopi Kenangan Mantan', owner: 'Joko', phone: '082345678903', restaurants: 3, status: 'Active', joinDate: '2023-05-15' },
];

export const mockTechnicians = [
  { id: 'TEC-001', name: 'Agus AC', phone: '083456789012', specialization: 'AC & Pendingin', status: 'Active', rating: 4.7, totalJobs: 89 },
  { id: 'TEC-002', name: 'Bambang Listrik', phone: '083456789013', specialization: 'Instalasi Listrik', status: 'Pending', rating: 0, totalJobs: 0 },
  { id: 'TEC-003', name: 'Cecep Pipa', phone: '083456789014', specialization: 'Ledeng & Pompa Air', status: 'Active', rating: 4.9, totalJobs: 124 },
];

export const mockVillas = [
  { id: 'VIL-001', name: 'Villa Senggigi Sunset', area: 'Senggigi', price: 1500000, bedrooms: 3, rating: 4.8, bookings: 45, status: 'Active' },
  { id: 'VIL-002', name: 'Kuta Mandalika Resort', area: 'Kuta Lombok', price: 2500000, bedrooms: 4, rating: 4.9, bookings: 89, status: 'Active' },
  { id: 'VIL-003', name: 'Gili Trawangan Escape', area: 'Gili Trawangan', price: 1200000, bedrooms: 2, rating: 4.7, bookings: 34, status: 'Inactive' },
];

export const mockTransactions = [
  { id: 'TRX-1001', user: 'Ahmad Budi', type: 'Payment', amount: 25000, desc: 'Pembayaran WiraRide ORD-1001', date: '2023-11-01 14:30' },
  { id: 'TRX-1002', user: 'Siti Aminah', type: 'Topup', amount: 100000, desc: 'Topup WiraPay via BCA', date: '2023-11-01 15:00' },
  { id: 'TRX-1003', user: 'Joko Susilo', type: 'Withdrawal', amount: 500000, desc: 'Penarikan Saldo Mitra', date: '2023-11-01 16:20' },
  { id: 'TRX-1004', user: 'Budi Santoso', type: 'Refund', amount: 15000, desc: 'Refund WiraSend Batal', date: '2023-11-02 09:15' },
];

export const mockPromos = [
  { id: 'PRM-001', title: 'Diskon Pengguna Baru', code: 'WIRABARU', discount: 50, type: 'Percentage', validUntil: '2023-12-31', usage: 1245, status: 'Active' },
  { id: 'PRM-002', title: 'Potongan Ongkir Food', code: 'MAKANMURAH', discount: 10000, type: 'Fixed', validUntil: '2023-11-30', usage: 856, status: 'Active' },
  { id: 'PRM-003', title: 'Liburan Senggigi', code: 'VILLAHEMAT', discount: 20, type: 'Percentage', validUntil: '2023-11-15', usage: 12, status: 'Inactive' },
];

export const mockWhatsappLogs = [
  { id: 'WA-001', from: 'System', to: '081234567890', preview: 'Kode OTP Anda adalah 123456...', type: 'Outgoing', timestamp: '2023-11-02 10:00', status: 'Delivered' },
  { id: 'WA-002', from: '081987654321', to: 'System', preview: 'Halo, pesanan saya belum sampai...', type: 'Incoming', timestamp: '2023-11-02 10:05', status: 'Received' },
  { id: 'WA-003', from: 'System', to: '085333444555', preview: 'Pesanan WiraFood Anda sedang disiapkan...', type: 'Outgoing', timestamp: '2023-11-02 10:10', status: 'Read' },
];

export const mockAdmins = [
  { id: 'ADM-001', name: 'Admin Utama', email: 'super@wira.id', role: 'Superadmin', status: 'Active' },
  { id: 'ADM-002', name: 'Admin Operasional 1', email: 'ops1@wira.id', role: 'Admin Ops', status: 'Active' },
  { id: 'ADM-003', name: 'Admin Keuangan 1', email: 'finance1@wira.id', role: 'Admin Keuangan', status: 'Active' },
  { id: 'ADM-004', name: 'Customer Service 1', email: 'cs1@wira.id', role: 'CS', status: 'Active' },
];

export const financeStats = {
  revenueToday: 15500000,
  revenueWeek: 105000000,
  revenueMonth: 450000000,
  revenueTotal: 5450000000,
  trend30Days: Array.from({length: 30}, (_, i) => ({
    date: `H-${30-i}`,
    revenue: Math.floor(Math.random() * 20000000) + 5000000
  }))
};
