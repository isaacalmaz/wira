import { supabase } from '../config/supabase';

// Admin decisions about partners (migrations/0101). Each needs a reason,
// notifies the partner and is written to admin_audit_log.

export async function setUserBlocked(userId, blocked, note) {
  const { data, error } = await supabase.rpc('admin_set_user_status', { p_user_id: userId, p_blocked: blocked, p_note: note });
  if (error) throw error;
  return data;
}

export async function setPartnerAccess(userId, kind, enabled, note) {
  const { data, error } = await supabase.rpc('admin_set_partner_access', { p_user_id: userId, p_kind: kind, p_enabled: enabled, p_note: note });
  if (error) throw error;
  return data;
}

export async function setMerchantActive(merchantId, active, note) {
  const { data, error } = await supabase.rpc('admin_set_merchant_active', { p_merchant_id: merchantId, p_active: active, p_note: note });
  if (error) throw error;
  return data;
}

export const KIND_LABEL = { driver: 'Driver', merchant: 'Restoran', villa: 'Villa', technician: 'Teknisi' };
