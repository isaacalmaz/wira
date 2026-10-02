const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const response = require('../utils/response');
const supabase = require('../config/supabase');
const { sendPushNotification } = require('../services/notificationService');
const { webhookLimiter } = require('../middleware/rateLimit');

// Turns new rows in public.notifications into phone pushes
// (migrations/0094). pg_cron calls POST /tick every 20 seconds while there
// are unsent notifications, with the same shared secret as the dispatch
// tick. claim_notification_pushes() marks each row sent before returning it,
// so overlapping ticks never push the same notification twice. Rows older
// than an hour are marked but not pushed.

const CRON_SECRET = process.env.DISPATCH_CRON_SECRET || '';

router.post('/tick', webhookLimiter, async (req, res) => {
  if (!CRON_SECRET) {
    console.error('push tick: DISPATCH_CRON_SECRET is not configured, refusing to run');
    return response.error(res, 'Push belum dikonfigurasi', 503);
  }
  const given = Buffer.from(String(req.headers['x-dispatch-secret'] || ''));
  const expected = Buffer.from(CRON_SECRET);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return response.error(res, 'Unauthorized', 401);
  }

  try {
    const { data: rows, error } = await supabase.rpc('claim_notification_pushes', { p_limit: 50 });
    if (error) throw error;

    let sent = 0;
    for (const n of rows || []) {
      try {
        const ok = await sendPushNotification(n.fcm_token, n.title, n.description || '', {
          type: 'notification',
          notificationId: String(n.id),
          // The row's own link when it has one (admin alerts, 0096);
          // otherwise customers open their notifications page, partners
          // their home.
          url: n.link || (n.is_partner ? '/' : '/notifications'),
        });
        if (ok) sent += 1;
      } catch (err) {
        console.error('push tick: send failed', { id: n.id, err });
      }
    }
    return response.success(res, { claimed: (rows || []).length, sent });
  } catch (err) {
    console.error('push tick failed', err);
    return response.error(res, 'Push gagal', 500);
  }
});

module.exports = router;
