// Free-form send jobs (migrations/0128): Titip beli and Barang besar.

export async function submitBigItemQuote(supabase, orderId, total, description) {
  const { data, error } = await supabase.rpc('submit_visit_quote', {
    p_order_id: orderId, p_total: total, p_description: description,
  });
  if (error) throw error;
  return data;
}

// photos: order-photos paths under the driver's folder; bought: [{ name, qty, bought }].
export async function submitTitipReceipt(supabase, orderId, { total, photos, bought, note }) {
  const { data, error } = await supabase.rpc('submit_titip_receipt', {
    p_order_id: orderId, p_total: total, p_photos: photos, p_bought: bought, p_note: note || null,
  });
  if (error) throw error;
  return data;
}

export async function startTitipDelivery(supabase, orderId) {
  const { error } = await supabase.rpc('start_titip_delivery', { p_order_id: orderId });
  if (error) throw error;
}

// Returns { success, error? } like start_order_with_pin.
export async function finishTitipWithPin(supabase, orderId, pin) {
  const { data, error } = await supabase.rpc('finish_titip_with_pin', { p_order_id: orderId, p_pin_input: pin });
  if (error) throw error;
  return data;
}
