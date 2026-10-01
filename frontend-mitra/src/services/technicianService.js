// Technician (WiraService / WiraPool) data access. The rules live in the
// database (migrations/0089): which open jobs a technician may see and take
// (skill match, the customer's chosen technician first for 10 minutes,
// blocked accounts excluded), the PIN needed to start work, and when a job
// may be given back.

export const VISIT_SERVICE_TYPES = ['service', 'pool'];
export const ACTIVE_VISIT_STATUSES = ['accepted', 'on_the_way', 'working'];

/** Lombok-time label for a visit, e.g. "Kam, 3 Okt · 10.00". */
export const formatVisitTime = (date, withDay = true) => {
  if (!date) return null;
  const opts = { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit' };
  const time = date.toLocaleTimeString('id-ID', opts);
  if (!withDay) return time;
  const day = date.toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar', weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${time}`;
};

/**
 * What a technician needs to know about a visit, read from the order. The
 * time comes from orders.scheduled_at; older orders only had it inside the
 * details text the customer app writes:
 *   service: "[Teknisi: … • ]Jadwal: 2026-10-03 pukul 09:00 • Lokasi: … [• Keluhan: …]"
 *   pool:    "Ukuran: … • Lokasi: … • Kunjungan: 2026-10-03[ pukul 09:00]"
 */
export function visitInfo(order) {
  const details = order?.details || '';
  let when = order?.scheduled_at ? new Date(order.scheduled_at) : null;
  if (!when) {
    const m = details.match(/(?:Jadwal|Kunjungan): (\d{4}-\d{2}-\d{2})(?: pukul (\d{1,2})[:.](\d{2}))?/);
    if (m) when = new Date(`${m[1]}T${(m[2] || '08').padStart(2, '0')}:${m[3] || '00'}:00+08:00`);
  }
  const location = details.match(/Lokasi: (.+?)(?: • (?:Kunjungan|Keluhan):|$)/s)?.[1] || null;
  const complaint = details.match(/Keluhan: (.+)$/s)?.[1] || null;
  const size = details.match(/Ukuran: (.+?) •/)?.[1] || null;
  return { when, location, complaint, size };
}

/** The active skill list (admin-managed table service_skills). */
export async function fetchSkills(supabase) {
  const { data, error } = await supabase
    .from('service_skills')
    .select('code, name, skill_group, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

/** The technician's own profile row (skills, accepting switch). */
export async function fetchMyTechnicianProfile(supabase, userId) {
  const { data, error } = await supabase
    .from('technician_profiles')
    .select('user_id, skills, is_accepting')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setAccepting(supabase, userId, isAccepting) {
  const { data, error } = await supabase
    .from('technician_profiles')
    .update({ is_accepting: isAccepting })
    .eq('user_id', userId)
    .select('is_accepting');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Profil teknisi tidak ditemukan.');
  return data[0].is_accepting;
}

/** Open visits this technician can take now, chosen-for-me first. */
export async function fetchOpenJobs(supabase) {
  const { data, error } = await supabase.rpc('get_open_technician_jobs');
  if (error) throw error;
  return data || [];
}

/** This technician's own visits, newest first. */
export async function fetchMyJobs(supabase, userId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('driver_id', userId)
    .in('service_type', VISIT_SERVICE_TYPES)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

/** Take an open visit (conditional update: still pending and unassigned). */
export async function takeJob(supabase, orderId, userId) {
  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'accepted', driver_id: userId })
    .eq('id', orderId)
    .eq('status', 'pending')
    .is('driver_id', null)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Pekerjaan ini sudah diambil teknisi lain atau dibatalkan.');
  return data[0];
}

/** Take every open visit of a monthly pool package (migrations/0090). */
export async function takePackage(supabase, packageId) {
  const { data, error } = await supabase.rpc('take_package_visits', { p_package_id: packageId });
  if (error) throw error;
  return data;
}

/**
 * Open jobs for display: one card per monthly package (its earliest visit,
 * with the number of open visits), other jobs as they are.
 */
export function groupOpenJobs(jobs) {
  const seen = new Map();
  const out = [];
  for (const job of jobs) {
    if (!job.package_id) { out.push({ job, packageCount: 0 }); continue; }
    if (seen.has(job.package_id)) { seen.get(job.package_id).packageCount += 1; continue; }
    const entry = { job, packageCount: 1 };
    seen.set(job.package_id, entry);
    out.push(entry);
  }
  return out;
}

/** Ask the customer for an extra charge on site (migrations/0090). */
export async function requestAdjustment(supabase, orderId, kind, amount, description) {
  const { error } = await supabase.rpc('request_order_adjustment', {
    p_order_id: orderId, p_kind: kind, p_amount: amount, p_description: description,
  });
  if (error) throw error;
}

export async function cancelAdjustment(supabase, adjustmentId) {
  const { error } = await supabase.rpc('cancel_order_adjustment', { p_adjustment_id: adjustmentId });
  if (error) throw error;
}

/** Customer declined after the check: finish at the check fee (needs their PIN). */
export async function finishAsCheck(supabase, orderId, pin) {
  const { data, error } = await supabase.rpc('finish_visit_as_check', { p_order_id: orderId, p_pin_input: pin });
  if (error) throw error;
  return data;
}

/** Give an accepted / en-route visit back to the queue. */
export async function releaseJob(supabase, orderId) {
  const { error } = await supabase.rpc('wallet_refund_matched_ride', {
    p_order_id: orderId,
    p_description: 'Teknisi melepas pekerjaan',
  });
  if (error) throw error;
}

/**
 * Calls onChange (debounced) whenever an order this technician can see
 * changes: new open jobs, jobs taken by someone else, their own jobs. RLS
 * decides what reaches this client, so no filter is needed here.
 */
export function subscribeToVisitChanges(supabase, userId, onChange) {
  let timer = null;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 400);
  };
  const channel = supabase
    .channel(`technician-visits-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
      const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
      if (!row?.service_type || VISIT_SERVICE_TYPES.includes(row.service_type)) fire();
    })
    .subscribe();
  // Realtime can miss events on a flaky connection; refresh now and then.
  const poll = setInterval(onChange, 60000);
  return () => {
    clearTimeout(timer);
    clearInterval(poll);
    supabase.removeChannel(channel);
  };
}
