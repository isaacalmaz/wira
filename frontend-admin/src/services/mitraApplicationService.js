import { supabase } from '../config/supabase';

// Mitra applications live in public.mitra_applications (migrations/0084),
// readable/writable by admins only. They used to be one JSON list in the
// public feature_flags row region='mitra_registrations'.

// Pending applications for the given roles (all roles when omitted).
export async function fetchPendingApplications(roles, columns = '*') {
  let query = supabase
    .from('mitra_applications')
    .select(columns)
    .eq('status', 'Pending')
    .order('created_at', { ascending: false });
  if (roles) query = query.in('role', roles);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Marks an application Active (accepted) or Rejected.
export async function setApplicationStatus(id, accept, notes = '') {
  const patch = { status: accept ? 'Active' : 'Rejected', reviewed_at: new Date().toISOString() };
  if (notes) patch.admin_notes = notes;
  const { data, error } = await supabase.from('mitra_applications').update(patch).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Akses ditolak saat menyimpan status pendaftaran.');
}

// Calls onChange whenever an application is added or updated.
export function subscribeToApplications(channelName, onChange) {
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mitra_applications' }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
