const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const response = require('../utils/response');
const auth = require('../middleware/auth');
const supabase = require('../config/supabase');
const { sendPushNotification } = require('../services/notificationService');
const { userFacingLimiter, webhookLimiter } = require('../middleware/rateLimit');

// Server-side sequential dispatch (migrations/0072). Replaces the loop that
// used to run only inside the customer's open browser tab
// (frontend-user/src/hooks/useOrderDispatch.js), which stopped pinging
// drivers the moment the app was closed.
//
// Two triggers call the same dispatchOrder():
//   - POST /tick            pg_cron every 15s (migrations/0073), all due orders
//   - POST /orders/:id/tick the customer's open ActiveOrderPage, one order
// dispatch_next_ping() locks the order row and logs every ping, so at most
// one driver is pinged per order per 15s no matter how many triggers fire.
// The push text is built here, never taken from the client.

const DISPATCH_CRON_SECRET = process.env.DISPATCH_CRON_SECRET || '';

async function dispatchOrder(orderId) {
  const { data: rows, error } = await supabase.rpc('dispatch_next_ping', { p_order_id: orderId });
  if (error) throw error;
  const result = rows && rows[0];
  if (!result) return { active: false, pingedCount: 0, totalCandidates: 0 };

  if (result.driver_id) {
    const { data: target, error: targetErr } = await supabase
      .from('users')
      .select('fcm_token')
      .eq('id', result.driver_id)
      .maybeSingle();
    if (targetErr) {
      console.error('dispatch: failed to load driver fcm_token', targetErr);
    } else if (target?.fcm_token) {
      // A failed push is logged but not retried for this driver - the next
      // tick moves on to the next candidate, same as the old client loop.
      await sendPushNotification(
        target.fcm_token,
        `Pesanan Baru: Wira ${String(result.service_type).toUpperCase()}`,
        'Ada pesanan menunggu di dekat Anda. Ketuk untuk melihat!',
        { orderId: String(orderId), type: 'new_order' }
      );
    }
  }

  return {
    active: true,
    pingedCount: result.pinged_count || 0,
    totalCandidates: result.total_candidates || 0,
  };
}

router.post('/tick', webhookLimiter, async (req, res) => {
  if (!DISPATCH_CRON_SECRET) {
    console.error('dispatch tick: DISPATCH_CRON_SECRET is not configured, refusing to run');
    return response.error(res, 'Dispatch belum dikonfigurasi', 503);
  }
  const given = Buffer.from(String(req.headers['x-dispatch-secret'] || ''));
  const expected = Buffer.from(DISPATCH_CRON_SECRET);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return response.error(res, 'Unauthorized', 401);
  }

  try {
    const { data: orderIds, error } = await supabase.rpc('dispatch_due_orders', { p_limit: 20 });
    if (error) throw error;

    let pinged = 0;
    for (const orderId of orderIds || []) {
      try {
        await dispatchOrder(orderId);
        pinged += 1;
      } catch (err) {
        // One bad order must not stop dispatch for the others.
        console.error('dispatch tick: order failed', { orderId, err });
      }
    }
    return response.success(res, { due: (orderIds || []).length, processed: pinged }, 'Dispatch tick selesai');
  } catch (err) {
    console.error('dispatch tick error:', err);
    return response.error(res, 'Dispatch tick gagal', 500);
  }
});

router.post('/orders/:id/tick', userFacingLimiter, auth, async (req, res) => {
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, user_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!order) return response.error(res, 'Pesanan tidak ditemukan', 404);
    if (order.user_id !== req.user.id) {
      return response.error(res, 'Anda tidak berhak atas pesanan ini', 403);
    }

    const status = await dispatchOrder(order.id);
    return response.success(res, status, 'Status dispatch');
  } catch (err) {
    console.error('dispatch order tick error:', err);
    return response.error(res, 'Gagal memproses dispatch', 500);
  }
});

module.exports = router;
