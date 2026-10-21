import { Car, Store, Building2, Wrench, Baby } from 'lucide-react';

export const ROLE_CONFIG = {
  driver: {
    id: 'driver',
    label: 'Driver',
    sub: 'Ojek & Mobil',
    description: 'Antar penumpang, paket, dan makanan di sekitar Anda',
    path: '/driver',
    icon: Car,
  },
  merchant: {
    id: 'merchant',
    label: 'Restoran',
    sub: 'WiraFood',
    description: 'Kelola menu restoran dan pesanan makanan',
    path: '/merchant',
    icon: Store,
  },
  villa: {
    id: 'villa',
    label: 'Villa',
    sub: 'WiraVilla',
    description: 'Kelola reservasi penginapan dan unit properti',
    path: '/villa',
    icon: Building2,
  },
  technician: {
    id: 'technician',
    label: 'Teknisi',
    sub: 'Servis & Tukang',
    description: 'Layanan jasa perbaikan AC, listrik, dan servis',
    path: '/technician',
    icon: Wrench,
  },
  nanny: {
    id: 'nanny',
    label: 'Wira Asuh',
    sub: 'Pengasuh Anak',
    description: 'Layanan pendampingan dan pengasuhan anak',
    path: '/nanny',
    icon: Baby,
  },
};

export const MITRA_ROLES = Object.keys(ROLE_CONFIG);
export const ROLE_STORAGE_KEY = 'wira_partner_active_mode';

export const getStoredActiveMode = (fallback = null) => {
  try {
    const val = localStorage.getItem(ROLE_STORAGE_KEY);
    if (val && MITRA_ROLES.includes(val)) {
      return val;
    }
  } catch {
    // LocalStorage may fail in restricted environments
  }
  return fallback;
};

export const setStoredActiveMode = (role) => {
  try {
    if (MITRA_ROLES.includes(role)) {
      localStorage.setItem(ROLE_STORAGE_KEY, role);
    }
  } catch {
    // Ignore storage errors
  }
};

export const clearStoredActiveMode = () => {
  try {
    localStorage.removeItem(ROLE_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
};
