const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabaseAdmin = require('../config/supabase');
const { webhookLimiter } = require('../middleware/rateLimit');

// Generated from Mutasiku dashboard: Integrasi > Webhooks > (webhook you add).
// Required to verify X-Webhook-Signature - without this check, anyone who
// discovers this endpoint URL could POST a fake "mutations.created" event
// with an amount matching a real pending topup_requests row and get a
// wallet credited for free.
const MUTASIKU_WEBHOOK_SECRET = process.env.MUTASIKU_WEBHOOK_SECRET || '';

// Optional: Mutasiku account UUID (from GET /api/v1/accounts) for the DANA
// account this QRIS settles to. When set, mutations reported against any
// other connected account are ignored - defense in depth in case more
// accounts get connected to the same Mutasiku workspace later.
const MUTASIKU_ACCOUNT_ID = process.env.MUTASIKU_ACCOUNT_ID || '';

// Webhook for Mutasiku mutation notifications - automatic verification for
// the manual QRIS-static top-up flow (frontend-user/src/services/topupService.js).
//
// Docs: https://docs.mutasiku.co.id/docs/webhooks
// Signature scheme: HMAC-SHA256(JSON.stringify(payload.data), webhookSecret),
// sent in the X-Webhook-Signature header.
//
// IDEMPOTENCY: Mutasiku retries a webhook delivery if the endpoint doesn't
// respond within 30s, and the docs warn the same event can be delivered more
// than once. The mutations.created payload shown in their docs does not
// include a stable event id we could key an idempotency table on, so instead
// we rely on the same guard already proven for the Midtrans webhook
// (backend/routes/midtrans.js): a single UPDATE ... WHERE status = 'pending'
// that can only ever succeed once per topup_requests row. This is backed by
// a real DB constraint too - migrations/0045 added a partial UNIQUE INDEX on
// (amount) WHERE status = 'pending' AND method != 'midtrans', so at most one
// manual-flow pending row can ever match a given amount at a time.
router.post('/webhook', webhookLimiter, async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const { type, data } = req.body || {};

    if (!MUTASIKU_WEBHOOK_SECRET) {
      console.error('Mutasiku Webhook: MUTASIKU_WEBHOOK_SECRET is not configured, refusing to process');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

    if (!signature || !data) {
      return res.status(400).json({ error: 'Payload atau signature tidak lengkap' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', MUTASIKU_WEBHOOK_SECRET)
      .update(JSON.stringify(data))
      .digest('hex');

    const sigBuf = Buffer.from(String(signature));
    const expectedBuf = Buffer.from(expectedSignature);
    const validSignature =
      sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);

    if (!validSignature) {
      console.error('Mutasiku Webhook: signature mismatch, rejecting', { type });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Always acknowledge quickly per Mutasiku's best practices once the
    // signature is valid - everything below is fast (a handful of indexed
    // queries), well under their 30s retry timeout.
    if (type !== 'mutations.created' || data.type !== 'CREDIT') {
      return res.status(200).json({ received: true, skipped: true });
    }

    if (MUTASIKU_ACCOUNT_ID && data.accountId !== MUTASIKU_ACCOUNT_ID) {
      return res.status(200).json({ received: true, skipped: true, reason: 'account_mismatch' });
    }

    const notifiedAmount = Math.round(Number(data.amount));
    if (!notifiedAmount || notifiedAmount <= 0) {
      return res.status(200).json({ received: true, skipped: true, reason: 'invalid_amount' });
    }

    // Only match a pending manual top-up that was created recently. Without
    // this, an abandoned pending request could sit around indefinitely and
    // later get matched by an unrelated incoming mutation of the same
    // nominal (e.g. two different customers both topping up Rp 50.000 hours
    // apart) - the amount-based match alone doesn't distinguish them. 2
    // hours comfortably covers a real QRIS payment (usually completed in
    // minutes) while still expiring genuinely stale/abandoned requests.
    const TOPUP_MATCH_WINDOW_MS = 2 * 60 * 60 * 1000;
    const matchWindowStart = new Date(Date.now() - TOPUP_MATCH_WINDOW_MS).toISOString();

    const { data: pendingReq, error: findErr } = await supabaseAdmin
      .from('topup_requests')
      .select('id, user_id, amount, status')
      .eq('amount', notifiedAmount)
      .eq('status', 'pending')
      .eq('method', 'manual')
      .gte('created_at', matchWindowStart)
      .maybeSingle();

    if (findErr) throw findErr;

    if (!pendingReq) {
      // No matching pending manual top-up for this nominal - could be an
      // unrelated incoming mutation to the same DANA account, or a retry
      // for an already-processed request. Either way, safe to no-op.
      return res.status(200).json({ received: true, matched: false });
    }

    // Approve + credit + ledger row in ONE DB transaction (migrations/0071),
    // same fix as routes/midtrans.js. Previously a failed credit/ledger call
    // after the status flip left the request 'approved' but uncredited, and
    // Mutasiku's retry would then find no pending row to match. Replays are
    // still safe no-ops ('already_processed').
    const { data: outcome, error: approveErr } = await supabaseAdmin.rpc('approve_topup_and_credit', {
      p_request_id: pendingReq.id,
      p_expected_amount: notifiedAmount,
      p_expected_method: 'manual',
      p_description: 'Top-Up WiraPay via QRIS (verifikasi otomatis Mutasiku)',
      p_reference_id: data.accountId ? `mutasiku:${data.accountId}:${data.createdAt || ''}` : null,
    });
    if (approveErr) throw approveErr;

    if (outcome !== 'approved') {
      return res.status(200).json({ received: true, matched: true, alreadyProcessed: true });
    }

    console.log('Mutasiku Webhook: auto-approved topup_request', {
      requestId: pendingReq.id,
      amount: pendingReq.amount,
    });

    return res.status(200).json({ received: true, matched: true, approved: true });
  } catch (error) {
    console.error('Mutasiku Webhook Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
