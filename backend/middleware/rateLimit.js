const rateLimit = require('express-rate-limit');

// Shared rate limiters for the handful of routes that are either
// unauthenticated (webhooks) or can trigger real side effects (payment
// creation, push notifications to third parties) and are therefore worth
// protecting from brute-force / flooding even though this backend has no
// rate limiting anywhere else yet.
//
// - webhookLimiter: Midtrans and Mutasiku both legitimately retry a webhook
//   delivery on timeout/non-2xx (Midtrans on capture+settlement duplicates,
//   Mutasiku on any non-2xx within its 30s window - see the comments in
//   routes/mutasiku.js). A payment gateway's retries can also burst from a
//   shared egress IP alongside other merchants' traffic, so this is
//   deliberately more generous than the user-facing limiter.
// - userFacingLimiter: applied to authenticated, user-initiated endpoints
//   that create a side effect (starting a Midtrans charge, sending an FCM
//   push) - 20 requests/minute/IP comfortably covers real usage (nobody
//   legitimately opens 20 top-up dialogs or fires 20 order-alerts a minute)
//   while blocking naive flooding.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan, coba lagi sebentar lagi' },
});

const userFacingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan, coba lagi sebentar lagi' },
});

module.exports = { webhookLimiter, userFacingLimiter };
