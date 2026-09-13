/**
 * WiraPay Top-Up Service
 * Handles unique code generation (1-3 digits) and top-up request creation for QRIS Statis flow.
 */

/**
 * Helper to safely sanitize and parse a nominal input into an integer.
 * Handles numbers, formatted strings (e.g., '50.000', 'Rp 50.000'), and rounds floats.
 * @param {number|string} value
 * @returns {number}
 */
export function parseNominal(value) {
  if (value === null || value === undefined || value === '') {
    return NaN;
  }
  if (typeof value === 'number') {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    let clean = value.trim();
    // Remove currency prefixes like "Rp", "Rp.", "IDR"
    clean = clean.replace(/^(Rp\.?|IDR)\s*/i, '').trim();
    // Remove cents like ",00" or ".00" at the end if present
    clean = clean.replace(/[,.]00$/, '');

    // If it has dots as thousands separators (e.g. 50.000 or 1.000.000)
    if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
      clean = clean.replace(/\./g, '');
    }
    // If it has commas as thousands separators (e.g. 50,000 or 1,000,000)
    else if (/^\d{1,3}(,\d{3})+$/.test(clean)) {
      clean = clean.replace(/,/g, '');
    }
    // If it has comma as decimal (e.g. 50000,5 -> 50001)
    else if (/^\d+,\d+$/.test(clean)) {
      clean = clean.replace(',', '.');
    }

    const num = Number(clean);
    return isNaN(num) ? NaN : Math.round(num);
  }
  return NaN;
}

/**
 * Generates a random 3-digit unique code between 101 and 999.
 * Ensures the code is strictly non-zero and does not end in 000.
 * @returns {number} 3-digit integer between 101 and 999
 */
export function generateUniqueCode() {
  // Range: 101 to 999 inclusive
  return Math.floor(Math.random() * 899) + 101;
}

/**
 * Generates an available unique code (101-999) ensuring no collision
 * with any active pending requests for the same base nominal in Supabase.
 * If Supabase is inaccessible or offline, falls back safely to generateUniqueCode().
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabaseClient]
 * @param {number|string} baseAmount
 * @returns {Promise<number>}
 */
export async function getAvailableUniqueCode(supabaseClient, baseAmount) {
  const parsed = parseNominal(baseAmount);
  const roundedBase = isNaN(parsed) ? 50000 : Math.floor(parsed / 1000) * 1000;

  const usedCodes = new Set();
  if (supabaseClient) {
    try {
      // 1. Try secure privacy-preserving RPC first
      let rows = null;
      try {
        const { data: rpcData, error: rpcErr } = await supabaseClient.rpc('get_pending_topup_codes', {
          base_val: roundedBase,
        });
        if (!rpcErr && Array.isArray(rpcData)) {
          rows = rpcData;
        }
      } catch (_) {}

      // 2. Fallback to direct query if RPC is not present
      if (!rows) {
        const { data, error } = await supabaseClient
          .from('topup_requests')
          .select('amount')
          .eq('status', 'pending')
          .gte('amount', roundedBase + 101)
          .lte('amount', roundedBase + 999);

        if (!error && Array.isArray(data)) {
          rows = data;
        }
      }

      if (Array.isArray(rows)) {
        rows.forEach((row) => {
          const code = Math.round(Number(row.amount)) - roundedBase;
          if (code >= 101 && code <= 999) {
            usedCodes.add(code);
          }
        });
      }
    } catch (_) {
      // Safe fallback when sandboxed or network is unavailable
    }
  }

  // Find an unused candidate from 101 to 999
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = generateUniqueCode();
    if (!usedCodes.has(candidate)) {
      return candidate;
    }
  }

  // Systematic scan fallback to guarantee an unused code is returned
  for (let c = 101; c <= 999; c++) {
    if (!usedCodes.has(c)) {
      return c;
    }
  }

  return generateUniqueCode();
}

/**
 * Calculates the unique top-up amount by adding a 3-digit unique code.
 * Ensures amount % 1000 > 0 (does not end in 000).
 *
 * @param {number|string} baseAmount - Base nominal chosen by user (e.g., 50000)
 * @param {number} [explicitCode] - Optional explicit unique code (1-999)
 * @returns {{ baseAmount: number, uniqueCode: number, totalAmount: number }}
 */
export function calculateUniqueTopUpAmount(baseAmount, explicitCode) {
  const numBase = parseNominal(baseAmount);
  if (isNaN(numBase) || numBase <= 0) {
    throw new Error('Nominal top up tidak valid');
  }
  if (numBase < 10000) {
    throw new Error('Nominal top up tidak valid. Minimal Rp 10.000');
  }

  // Normalize base amount to thousands
  const roundedBase = Math.floor(numBase / 1000) * 1000;

  let code = explicitCode !== undefined ? parseNominal(explicitCode) : generateUniqueCode();
  if (isNaN(code) || code <= 0 || code >= 1000) {
    code = generateUniqueCode();
  }

  const totalAmount = roundedBase + code;

  // Mathematical assertion
  if (totalAmount % 1000 === 0) {
    throw new Error('Nominal unik tidak boleh berakhiran 000');
  }

  return {
    baseAmount: roundedBase,
    uniqueCode: code,
    totalAmount,
  };
}

/**
 * Creates a top-up request in Supabase with the unique nominal.
 * Resilient against multi-user duplicate requests and concurrent unique collision.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {Object} params
 * @param {string} params.userId - The ID of the user requesting top-up
 * @param {number} params.amount - The final unique amount to be paid
 * @param {string} [params.status='pending'] - Initial status
 * @param {string} [params.proofUrl=null] - Optional proof URL
 * @returns {Promise<Object>} Inserted topup request record
 */
export async function createTopUpRequest(supabaseClient, { userId, amount, status = 'pending', proofUrl = null }) {
  if (!supabaseClient) {
    throw new Error('Supabase client is required');
  }
  if (!userId) {
    throw new Error('User ID is required');
  }

  const numAmount = parseNominal(amount);
  if (isNaN(numAmount) || numAmount < 10000) {
    throw new Error('Nominal top up tidak valid');
  }

  // Ensure amount does not end in 000; if it does, apply collision-free unique code automatically
  let finalAmount = numAmount;
  if (finalAmount % 1000 === 0) {
    const code = await getAvailableUniqueCode(supabaseClient, finalAmount);
    const calculated = calculateUniqueTopUpAmount(finalAmount, code);
    finalAmount = calculated.totalAmount;
  }

  // Check collision for pending requests to ensure no duplicate pending nominals
  if (status === 'pending') {
    try {
      const { data: existingPending } = await supabaseClient
        .from('topup_requests')
        .select('id, user_id, amount, status')
        .eq('amount', finalAmount)
        .eq('status', 'pending');

      if (Array.isArray(existingPending) && existingPending.length > 0) {
        // If same user already has this exact pending request, return it to prevent duplicate row
        const sameUser = existingPending.find((r) => r.user_id === userId);
        if (sameUser) {
          return sameUser;
        }

        // Another user already has this pending nominal; allocate a non-colliding unique code
        const freshCode = await getAvailableUniqueCode(supabaseClient, finalAmount);
        const recalc = calculateUniqueTopUpAmount(finalAmount, freshCode);
        finalAmount = recalc.totalAmount;
      }
    } catch (_) {
      // Safe fallback if network query encounters issue
    }
  }

  // Insert with retry if concurrency race hits duplicate key (Postgres 23505)
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabaseClient
      .from('topup_requests')
      .insert([
        {
          user_id: userId,
          amount: finalAmount,
          status,
          proof_url: proofUrl,
        },
      ])
      .select();

    if (!error && Array.isArray(data) && data.length > 0) {
      return data[0];
    }

    lastError = error;
    // If unique constraint collision occurred on pending nominal, re-allocate a fresh unique code and retry
    if (error && (error.code === '23505' || String(error.message || '').toLowerCase().includes('unique'))) {
      const freshCode = await getAvailableUniqueCode(supabaseClient, finalAmount);
      const recalc = calculateUniqueTopUpAmount(finalAmount, freshCode);
      finalAmount = recalc.totalAmount;
      continue;
    }
    break;
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('Gagal menyimpan permintaan top up ke database');
}

/**
 * Cancels a pending top-up request.
 * Releases the occupied unique nominal back to the available pool.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} requestId - UUID of the top-up request to cancel
 * @param {string} [userId] - Optional user ID for ownership validation
 * @returns {Promise<boolean>}
 */
export async function cancelTopUpRequest(supabaseClient, requestId, userId) {
  if (!supabaseClient) {
    throw new Error('Supabase client is required');
  }
  if (!requestId) {
    throw new Error('Request ID is required');
  }

  // 1. Try secure RPC cancel_topup_request first
  try {
    const { data, error } = await supabaseClient.rpc('cancel_topup_request', {
      request_id: requestId,
    });
    if (!error && typeof data === 'boolean') {
      return data;
    }
  } catch (_) {
    // Fallback to direct update if RPC is not yet registered
  }

  // 2. Fallback: Direct update guarded by status = 'pending'
  try {
    let query = supabaseClient
      .from('topup_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('status', 'pending');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.select();
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.error('Failed to cancel topup request:', err);
    throw err;
  }
}

/**
 * Fetches active/pending top-up requests for a specific user.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} userId
 * @returns {Promise<Array<Object>>}
 */
export async function fetchUserTopUpRequests(supabaseClient, userId) {
  if (!supabaseClient || !userId) return [];
  try {
    const { data, error } = await supabaseClient
      .from('topup_requests')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching user topup requests:', err);
    return [];
  }
}

/**
 * Formats a nominal amount with Indonesian currency style and isolates
 * the last 3 digits for UI highlighting.
 *
 * @param {number|string} amount
 * @returns {{ prefix: string, uniqueDigits: string, fullFormatted: string, rawAmount: number }}
 */
export function formatAmountWithUniqueHighlight(amount) {
  const parsed = parseNominal(amount);
  const num = isNaN(parsed) ? 0 : Math.max(0, parsed);
  const str = num.toLocaleString('id-ID');
  if (str.length >= 3) {
    return {
      prefix: 'Rp ' + str.slice(0, -3),
      uniqueDigits: str.slice(-3),
      fullFormatted: 'Rp ' + str,
      rawAmount: num,
    };
  }
  return {
    prefix: 'Rp ',
    uniqueDigits: String(num).padStart(3, '0'),
    fullFormatted: 'Rp ' + str,
    rawAmount: num,
  };
}

export default {
  parseNominal,
  generateUniqueCode,
  getAvailableUniqueCode,
  calculateUniqueTopUpAmount,
  createTopUpRequest,
  cancelTopUpRequest,
  fetchUserTopUpRequests,
  formatAmountWithUniqueHighlight,
};

