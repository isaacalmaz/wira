// =========================================
// 📱 DAFTAR LAYANAN WIRA
// Tambah atau hapus layanan di sini
// =========================================

import {
  Car, UtensilsCrossed, Package, Wallet, Smartphone,
  Home, Wrench, Waves
} from 'lucide-react';

// Daftar semua layanan yang tersedia
// Ubah 'enabled' menjadi false untuk menyembunyikan layanan
const SERVICES = [
  {
    id: 'wira_ride',
    key: 'wira_ride',
    name_id: 'WiraRide',
    name_en: 'WiraRide',
    description_id: 'Pesan ojek & taksi online',
    description_en: 'Book motorcycle & car rides',
    icon: Car,
    path: '/ride',
    color: '#0891B2',       // Turquoise
    enabled: true,
  },
  {
    id: 'wira_food',
    key: 'wira_food',
    name_id: 'WiraFood',
    name_en: 'WiraFood',
    description_id: 'Pesan makanan dari restoran',
    description_en: 'Order food from restaurants',
    icon: UtensilsCrossed,
    path: '/food',
    color: '#D97706',       // Sandy gold
    enabled: true,
  },
  {
    id: 'wira_send',
    key: 'wira_send',
    name_id: 'WiraSend',
    name_en: 'WiraSend',
    description_id: 'Kirim paket & barang',
    description_en: 'Send packages & parcels',
    icon: Package,
    path: '/send',
    color: '#F97316',       // Coral
    enabled: true,
  },
  {
    id: 'wira_pay',
    key: 'wira_pay',
    name_id: 'WiraPay',
    name_en: 'WiraPay',
    description_id: 'Dompet digital',
    description_en: 'Digital wallet',
    icon: Wallet,
    path: '/wallet',
    color: '#10B981',       // Emerald
    enabled: true,
  },
  {
    id: 'wira_pulsa',
    key: 'wira_pulsa',
    name_id: 'WiraPulsa',
    name_en: 'WiraPulsa',
    description_id: 'Beli pulsa & token listrik',
    description_en: 'Buy credits & electricity tokens',
    icon: Smartphone,
    path: '/pulsa',
    color: '#6366F1',       // Indigo
    enabled: true,
  },
  {
    id: 'wira_villa',
    key: 'wira_villa',
    name_id: 'WiraVilla',
    name_en: 'WiraVilla',
    description_id: 'Sewa villa di Lombok',
    description_en: 'Rent villas in Lombok',
    icon: Home,
    path: '/villa',
    color: '#EC4899',       // Pink
    enabled: true,
  },
  {
    id: 'wira_service',
    key: 'wira_service',
    name_id: 'WiraService',
    name_en: 'WiraService',
    description_id: 'Jasa teknisi & tukang',
    description_en: 'Engineering & repair services',
    icon: Wrench,
    path: '/service',
    color: '#EF4444',       // Red
    enabled: true,
  },
  {
    id: 'wira_pool',
    key: 'wira_pool',
    name_id: 'WiraPool',
    name_en: 'WiraPool',
    description_id: 'Maintenance kolam renang',
    description_en: 'Swimming pool maintenance',
    icon: Waves,
    path: '/pool',
    color: '#3B82F6',       // Blue
    enabled: true,
  },
];

export { SERVICES };
export default SERVICES;
