const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');
const supabase = require('../config/supabase');
const { sendPushNotification } = require('../services/notificationService');
const { userFacingLimiter } = require('../middleware/rateLimit');

router.use(auth);

router.get('/', (req, res) => response.success(res, [], 'Daftar notifikasi'));
router.put('/:id/read', (req, res) => response.success(res, {}, 'Notifikasi ditandai dibaca'));
router.put('/read-all', (req, res) => response.success(res, {}, 'Semua notifikasi ditandai dibaca'));

// Sends a real FCM push to a single target user by looking up their
// fcm_token from public.users (service-role client, bypasses RLS) and
// calling the real admin.messaging().send() pipeline in notificationService.js.
//
// SECURITY: this used to only require `auth` (any logged-in user) and trust
// a fully client-supplied {userId, title, body, data} - any authenticated
// account could push arbitrary content to ANY other user (phishing/spam,
// e.g. a fake "wallet credited" push with an attacker deep-link).
//
// Real call sites (grepped across frontend-user and frontend-mitra for
// `/notifications/order-alert`) all fall into one of two shapes, and both
// always include `data.orderId` for a real `orders` row:
//   1. MerchantOrdersPage.jsx (mitra) - the merchant who owns the order
//      notifies the order's customer when it's marked ready.
//   2. RidePage/SendPage/VillaPage/PoolPage/ServicePage.jsx (customer) - the
//      customer who just placed/requeued the order notifies either the
//      order's single merchant owner (Villa), or fans out to every nearby
//      driver/technician who is ELIGIBLE to accept the job but not yet
//      assigned to it (Ride/Send/Pool/Service - `orders.driver_id` is still
//      null at this point, so they aren't "on the order" yet).
//
// So the caller must be a real party on a real order (its customer, its
// assigned driver, or its merchant's owner), and the target must either
// also be a real party on that same order, OR - for the not-yet-assigned
// broadcast case - hold the professional role that matches the order's
// service_type (checked against the same underlying tables/columns the
// `get_nearest_drivers` and `list_technicians` RPCs use), and only when the
// caller is that order's own customer. This keeps every currently-working
// flow above intact while removing the arbitrary-third-party case.
const DRIVER_SERVICE_TYPES = ['ride', 'send'];
const TECHNICIAN_SERVICE_TYPES = ['pool', 'service'];

router.post('/order-alert', userFacingLimiter, async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;
    const orderId = req.body.orderId || data?.orderId;

    if (!userId || !title || !body || !orderId) {
      return response.error(res, 'userId, title, body, dan orderId wajib diisi', 400);
    }
    if (userId === req.user.id) {
      return response.error(res, 'Tidak dapat mengirim notifikasi untuk diri sendiri', 400);
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, driver_id, merchant_id, service_type')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      console.error('order-alert: failed to load order', orderError);
      return response.error(res, 'Internal server error', 500);
    }
    if (!order) {
      return response.error(res, 'Pesanan tidak ditemukan', 404);
    }

    // Resolve the merchant owner tied to this order, if any (e.g. Villa,
    // WiraFood) - both the caller and target checks below need it.
    let merchantOwnerId = null;
    if (order.merchant_id) {
      const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('owner_id')
        .eq('id', order.merchant_id)
        .maybeSingle();
      if (merchantError) {
        console.error('order-alert: failed to load merchant', merchantError);
        return response.error(res, 'Internal server error', 500);
      }
      merchantOwnerId = merchant?.owner_id || null;
    }

    const callerId = req.user.id;
    const callerIsCustomer = order.user_id === callerId;
    const callerIsAssignedDriver = !!order.driver_id && order.driver_id === callerId;
    const callerIsMerchantOwner = !!merchantOwnerId && merchantOwnerId === callerId;

    if (!callerIsCustomer && !callerIsAssignedDriver && !callerIsMerchantOwner) {
      return response.error(res, 'Anda tidak berhak mengirim notifikasi untuk pesanan ini', 403);
    }

    const targetIsCustomer = userId === order.user_id;
    const targetIsAssignedDriver = !!order.driver_id && userId === order.driver_id;
    const targetIsMerchantOwner = !!merchantOwnerId && userId === merchantOwnerId;

    let targetIsEligibleProfessional = false;
    if (!targetIsCustomer && !targetIsAssignedDriver && !targetIsMerchantOwner && callerIsCustomer) {
      // Broadcast case: the order's own customer notifying a not-yet-assigned
      // driver/technician (Ride/Send/Pool/Service fan this out before anyone
      // has accepted the job). Only allow it when the target actually holds
      // the matching professional role for this order's service_type - this
      // is what stops an attacker from using their own order to reach an
      // arbitrary victim account.
      if (DRIVER_SERVICE_TYPES.includes(order.service_type)) {
        // Matches get_nearest_drivers (migrations/0014), which sources
        // candidates from public.drivers.
        const { data: driverRow, error: driverErr } = await supabase
          .from('drivers')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
        if (driverErr) {
          console.error('order-alert: failed to check driver eligibility', driverErr);
          return response.error(res, 'Internal server error', 500);
        }
        targetIsEligibleProfessional = !!driverRow;
      } else if (TECHNICIAN_SERVICE_TYPES.includes(order.service_type)) {
        // Matches list_technicians (migrations/0025), which sources
        // candidates via users.mitra_access containing 'technician'.
        const { data: targetProfile, error: profileErr } = await supabase
          .from('users')
          .select('mitra_access')
          .eq('id', userId)
          .maybeSingle();
        if (profileErr) {
          console.error('order-alert: failed to check technician eligibility', profileErr);
          return response.error(res, 'Internal server error', 500);
        }
        const mitraAccess = Array.isArray(targetProfile?.mitra_access) ? targetProfile.mitra_access : [];
        targetIsEligibleProfessional = mitraAccess.includes('technician');
      }
    }

    if (!targetIsCustomer && !targetIsAssignedDriver && !targetIsMerchantOwner && !targetIsEligibleProfessional) {
      return response.error(res, 'Target notifikasi tidak valid untuk pesanan ini', 403);
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('fcm_token')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('order-alert: failed to load target profile', profileError);
      return response.error(res, 'Internal server error', 500);
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
