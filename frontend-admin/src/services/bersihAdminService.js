import { supabase } from '../config/supabase';

// ============================================================================
// Wira Bersih Admin Service
// Manages waste subscriptions, pickups, invoices, housekeeping, and quotes.
// ============================================================================

export async function fetchSubscriptions(statusFilter = null) {
  let query = supabase
    .from('waste_subscriptions')
    .select(`
      *,
      user:user_id(id, name, email, phone)
    `)
    .order('created_at', { ascending: false });

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateSubscription(id, { status, monthly_price, notes }) {
  const updates = {
    updated_at: new Date().toISOString(),
  };
  if (status !== undefined) updates.status = status;
  if (monthly_price !== undefined) updates.monthly_price = Number(monthly_price);
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabase
    .from('waste_subscriptions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchDailyPickups(dateStr) {
  // Returns pickups for the given date (default today)
  const targetDate = dateStr || new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('waste_pickups')
    .select(`
      *,
      subscription:subscription_id(
        id, property_name, property_type, address, lat, lng, contact_phone, contact_name, frequency, pickup_days
      )
    `)
    .eq('pickup_date', targetDate)
    .order('completed', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function togglePickupStatus(pickupId, completed) {
  const updates = {
    completed,
    completed_at: completed ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from('waste_pickups')
    .update(updates)
    .eq('id', pickupId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchInvoices(statusFilter = null, monthFilter = null) {
  let query = supabase
    .from('waste_invoices')
    .select(`
      *,
      subscription:subscription_id(id, property_name, address),
      user:user_id(id, name, email, phone)
    `)
    .order('created_at', { ascending: false });

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }
  if (monthFilter) {
    query = query.eq('month', monthFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function generateMonthlyInvoices(targetMonth) {
  const month = targetMonth || new Date().toISOString().substring(0, 7);
  const { data, error } = await supabase.rpc('generate_waste_monthly_invoices', {
    target_month: month,
  });

  if (error) throw error;
  return data;
}

export async function verifyCashSettlement(invoiceId, note = '') {
  const { data, error } = await supabase.rpc('verify_cash_collection', {
    p_invoice_id: invoiceId,
    p_admin_note: note,
  });

  if (error) throw error;
  return data;
}

export async function fetchHousekeepingOrders(statusFilter = null) {
  let query = supabase
    .from('housekeeping_orders')
    .select(`
      *,
      user:user_id(id, name, email, phone)
    `)
    .order('scheduled_date', { ascending: false });

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateHousekeepingOrder(orderId, updates) {
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('housekeeping_orders')
    .update(payload)
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchWasteQuotes(statusFilter = null) {
  let query = supabase
    .from('waste_quotes')
    .select(`
      *,
      user:user_id(id, name, email, phone)
    `)
    .order('created_at', { ascending: false });

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function respondWasteQuote(quoteId, { quoted_price, vehicle_type, notes }) {
  const payload = {
    quoted_price: Number(quoted_price),
    vehicle_type: vehicle_type || 'tossa',
    status: 'quoted',
    notes: notes || '',
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('waste_quotes')
    .update(payload)
    .eq('id', quoteId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
