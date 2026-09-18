const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');
const supabase = require('../config/supabase');
const { sendPushNotification } = require('../services/notificationService');

router.use(auth);

router.get('/', (req, res) => response.success(res, [], 'Daftar notifikasi'));
router.put('/:id/read', (req, res) => response.success(res, {}, 'Notifikasi ditandai dibaca'));
router.put('/read-all', (req, res) => response.success(res, {}, 'Semua notifikasi ditandai dibaca'));

// Sends a real FCM push to a single target user by looking up their
// fcm_token from public.users (service-role client, bypasses RLS) and
// calling the real admin.messaging().send() pipeline in notificationService.js.
//
// This is the first real, end-to-end-wired push notification trigger in this
// codebase - everything else here was previously unreachable plumbing (see
// notification.js's manual /send route, never mounted in server.js). Called
// today by frontend-mitra's MerchantOrdersPage.jsx the moment a merchant
// marks a WiraFood order 'ready', to notify the customer. Deliberately
// generic (target userId + title/body/data) so other order-status hooks can
// reuse it later without another new endpoint.
router.post('/order-alert', async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;
    if (!userId || !title || !body) {
      return response.error(res, 'userId, title, dan body wajib diisi', 400);
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('fcm_token')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      return response.error(res, 'Gagal mengambil data pengguna', 500, profileError.message);
    }
    if (!profile?.fcm_token) {
      return response.error(res, 'Pengguna tidak memiliki fcm_token terdaftar', 404);
    }

    const sent = await sendPushNotification(profile.fcm_token, title, body, data || {});
    if (!sent) {
      return response.error(res, 'Gagal mengirim notifikasi push (lihat log server)', 502);
    }
    return response.success(res, {}, 'Notifikasi terkirim');
  } catch (err) {
    console.error('order-alert error:', err);
    return response.error(res, 'Terjadi kesalahan saat mengirim notifikasi', 500);
  }
});

module.exports = router;
