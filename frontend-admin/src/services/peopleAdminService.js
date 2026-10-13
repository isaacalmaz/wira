import { supabase } from '../config/supabase';

// Admin "people" views (migrations/0122): partners per kind with 30-day
// numbers, customers, account search. Read-only; admin panel roles only.

export async function fetchPartnerList(kind) {
  const { data, error } = await supabase.rpc('admin_partner_list', { p_kind: kind });
  if (error) throw error;
  return data || [];
}

export async function fetchCustomerList() {
  const { data, error } = await supabase.rpc('admin_customer_list');
  if (error) throw error;
  return data || [];
}

export async function searchAccounts(q) {
  const { data, error } = await supabase.rpc('admin_search_accounts', { p_q: q });
  if (error) throw error;
  return data || [];
}

export const KIND_META = {
  driver: { label: 'Driver', path: '/drivers' },
  merchant: { label: 'Restoran', path: '/merchants' },
  villa: { label: 'Villa', path: '/villas' },
  technician: { label: 'Teknisi', path: '/technicians' },
  nanny: { label: 'Pengasuh', path: '/nannies' },
};

// Application role -> kind (old 'courier' registrations are drivers; a
// 'merchant' application for a villa is a villa).
export const applicationKind = (a) => {
  if (a.role === 'courier') return 'driver';
  if (a.role === 'merchant' && ['villa', 'WiraVilla'].includes(a.service_type)) return 'villa';
  return a.role;
};

/** Debt state of one partner, the same rule as the partner's own Pendapatan card. */
export function debtState(p) {
  if (p.status !== 'Aktif') return { tone: 'danger', label: p.status === 'Diblokir' ? 'Ditangguhkan' : p.status };
  if (p.order_locked) return { tone: 'danger', label: 'Order terkunci (komisi)' };
  if (Number(p.commission_owed) >= Number(p.debt_limit || 200000) * 0.7) return { tone: 'warning', label: 'Mendekati batas' };
  return { tone: 'success', label: p.online ? 'Aktif · online' : 'Aktif' };
}
