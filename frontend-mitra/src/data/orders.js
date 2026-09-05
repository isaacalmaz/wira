export const driverOrders = [
  { id: 'ORD-001', type: 'Ride', customer: 'Budi Santoso', phone: '08123456789', pickup: 'Epicentrum Mall Mataram', destination: 'Pantai Ampenan', amount: 25000, status: 'Active', distance: '4.2 km', coords: [-8.5833, 116.1167] },
  { id: 'ORD-002', type: 'Food', customer: 'Siti Aminah', phone: '08198765432', pickup: 'Ayam Taliwang H. Moerad', destination: 'Pagesangan', amount: 15000, status: 'Completed', distance: '2.1 km', items: ['1x Ayam Bakar', '2x Nasi Putih'] },
  { id: 'ORD-003', type: 'Send', customer: 'Wayan', phone: '08776655443', pickup: 'Cakranegara', destination: 'Selagalas', amount: 12000, status: 'Completed', distance: '3.5 km', items: ['Dokumen'] }
];

export const merchantOrders = [
  { id: 'M-ORD-101', customer: 'Andi', time: '10:30', status: 'Incoming', total: 60000, items: [{name: 'Ayam Taliwang', qty: 1}, {name: 'Es Jeruk', qty: 2}] },
  { id: 'M-ORD-102', customer: 'Rina', time: '10:15', status: 'Preparing', total: 35000, items: [{name: 'Nasi Balap', qty: 1}] },
  { id: 'M-ORD-103', customer: 'Budi', time: '09:45', status: 'Completed', total: 105000, items: [{name: 'Sate Bulayak', qty: 3}] }
];

export const techOrders = [
  { id: 'T-ORD-201', customer: 'Pak Haji', type: 'AC', desc: 'AC tidak dingin, netes air', address: 'Jl. Majapahit No. 10, Mataram', schedule: 'Hari ini, 14:00', estPrice: 150000, status: 'Incoming' },
  { id: 'T-ORD-202', customer: 'Ibu Desak', type: 'Plumbing', desc: 'Kran air patah di garasi', address: 'Kekalik', schedule: 'Hari ini, 10:00', estPrice: 50000, status: 'Working' }
];
