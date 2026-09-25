const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const midtransClient = require('midtrans-client');
const supabaseAdmin = require('../config/supabase');
const auth = require('../middleware/auth');
const { webhookLimiter, userFacingLimiter } = require('../middleware/rateLimit');

// The server key should ideally come from env vars. We'll use a placeholder/env.
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-YOUR_SERVER_KEY';
const MIDTRANS_CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-YOUR_CLIENT_KEY';
// Real deploy-time toggle instead of a permanent hardcode - defaults to
// sandbox (false) so nothing breaks if the env var is unset.
const MIDTRANS_IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === 'true';

// Initialize Snap Client
const snap = new midtransClient.Snap({
  isProduction: MIDTRANS_IS_PRODUCTION,
  serverKey: MIDTRANS_SERVER_KEY,
  clientKey: MIDTRANS_CLIENT_KEY
});

// 1. Endpoint to generate Snap Token for Top-Up
// Requires a valid Supabase session (same `auth` middleware every other
// authenticated route in this backend uses) so the topup_requests row is
// always created for the actual logged-in user, never an arbitrary
// client-supplied user_id.
router.post('/charge', userFacingLimiter, auth, async (req, res) => {
  try {
    const { amount, customer_name, customer_email, customer_phone } = req.body;
    const authenticatedUserId = req.user.id;

    // Defense in depth: if the client did send a user_id, it must match the
    // authenticated session. Previously this endpoint trusted req.body.user_id
    // blindly, letting any caller create topup_requests rows (and, via the
    // webhook, wallet credits) for an arbitrary victim account.
    if (req.body.user_id && req.body.user_id !== authenticatedUserId) {
      return res.status(403).json({ error: 'user_id tidak sesuai dengan sesi yang login' });
    }
    const user_id = authenticatedUserId;

    // Amount must be a finite, positive, whole-Rupiah number within a
    // sane ceiling. `amount` flows straight into both the topup_requests
    // insert and the Midtrans gross_amount, so anything non-numeric,
    // fractional (Midtrans/IDR has no sub-unit in this app's flow), zero,
    // negative, or absurdly large (NaN/Infinity injection, fat-finger, or
    // an attempt to abuse downstream numeric handling) must be rejected
    // before it ever reaches the DB or the Midtrans API.
    const numericAmount = Number(amount);
    const MAX_TOPUP_AMOUNT = 1_000_000_000; // IDR - well above any real top-up
    if (
      amount === undefined ||
      amount === null ||
      amount === '' ||
      !Number.isFinite(numericAmount) ||
      !Number.isInteger(numericAmount) ||
      numericAmount <= 0 ||
      numericAmount > MAX_TOPUP_AMOUNT
    ) {
      return res.status(400).json({ error: 'Amount tidak valid. Harus berupa angka bulat positif (maks. Rp 1.000.000.000)' });
    }

    // Create a pending transaction record in Supabase
    // We insert into topup_requests so we can track it. method: 'midtrans'
    // tells the DB trigger (migrations/0045) to NOT randomize this amount
    // with a manual-flow "unique code" - Midtrans requests are already
    // unambiguously identified by their own order_id, and mutating the
    // amount here would make what we charge Midtrans diverge from what we
    // credit the wallet.
    const { data: requestRecord, error: dbError } = await supabaseAdmin
      .from('topup_requests')
      .insert({
        user_id,
        amount: numericAmount,
        method: 'midtrans',
        status: 'pending'
      })
      .select('id, amount')
      .single();

    if (dbError) throw dbError;

    // Build Midtrans parameter - use the amount actually stored on the row
    // (post-trigger) so what we charge Midtrans always matches what we'll
    // credit the wallet for this exact row.
    const parameter = {
      transaction_details: {
        order_id: `WIRA-TOPUP-${requestRecord.id}-${Date.now()}`,
        gross_amount: requestRecord.amount
      },
      customer_details: {
        first_name: customer_name || 'Wira',
        last_name: 'User',
        email: customer_email || 'user@wira.com',
        phone: customer_phone || '08123456789'
      },
      callbacks: {
        finish: 'https://wira-frontend-user.vercel.app/wallet'
      }
    };

    const transaction = await snap.createTransaction(parameter);

    res.json({
      token: transaction.token,
      redirect_url: transaction.redirect_url,
      order_id: parameter.transaction_details.order_id
    });

  } catch (error) {
    console.error('Midtrans Charge Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Webhook for Midtrans Notification (Callback)
//
// SECURITY: midtrans-client's snap.transaction.notification() does NOT
// verify the `signature_key` field itself - it just re-shapes the payload.
// Anyone who knows (or guesses) an order_id could previously POST a fake
// "settlement" notification straight to this endpoint and get a wallet
// credited for free. We now verify the signature ourselves per Midtrans's
// documented scheme (SHA512(order_id + status_code + gross_amount +
// server_key)) and reject anything that doesn't match, before touching the
// database at all.
//
// IDEMPOTENCY: Midtrans redelivers notifications (retries on timeout/non-2xx,
// and duplicate 'capture' + 'settlement' events for the same order_id are
// normal for credit-card transactions). The old code did a SELECT to check
// `status === 'pending'` and then a separate UPDATE - two concurrent/replayed
// deliveries could both pass the SELECT check before either UPDATE lands,
// double-crediting the wallet. We instead do a single UPDATE ... WHERE
// status = 'pending' and only credit the wallet if that UPDATE actually
// affected a row (mirrors this codebase's established RLS-affected-row-count
// discipline, applied here to prevent double-processing instead of RLS).
router.post('/webhook', webhookLimiter, async (req, res) => {
  try {
    const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = req.body;

    if (!order_id || !status_code || !gross_amount || !signature_key) {
      return res.status(400).json({ error: 'Payload notifikasi tidak lengkap' });
    }

    const expectedSignature = crypto
      .createHash('sha512')
      .update(`${order_id}${status_code}${gross_amount}${MIDTRANS_SERVER_KEY}`)
      .digest('hex');

    // Constant-time comparison (mirrors routes/mutasiku.js's webhook check) -
    // a plain `!==` string comparison short-circuits on the first differing
    // byte, which is a (small, but real) timing side-channel against a
    // secret-derived value.
    const signatureBuf = Buffer.from(String(signature_key));
    const expectedBuf = Buffer.from(expectedSignature);
    const validSignature =
      signatureBuf.length === expectedBuf.length && crypto.timingSafeEqual(signatureBuf, expectedBuf);

    if (!validSignature) {
      console.error('Midtrans Webhook: signature mismatch, rejecting', { order_id });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const orderId = order_id;
    const transactionStatus = transaction_status;
    const fraudStatus = fraud_status;

    // Extract the original topup_request ID (format: WIRA-TOPUP-<id>-<timestamp>)
    const match = orderId.match(/^WIRA-TOPUP-(.+)-\d+$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }
    const dbRequestId = match[1];

    if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
      if (fraudStatus === 'challenge') {
        // Held for manual fraud review by Midtrans - do not credit yet.
        return res.status(200).send('OK');
      }

      // Sanity-check the notified amount against what we actually stored
      // for this request before crediting anything. The signature already
      // ties order_id+gross_amount+status_code together, so this is
      // defense-in-depth against a malformed/mismatched payload rather than
      // the primary security control.
      const { data: pendingReq, error: fetchErr } = await supabaseAdmin
        .from('topup_requests')
        .select('id, amount, status, user_id')
        .eq('id', dbRequestId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!pendingReq) {
        console.error('Midtrans Webhook: topup_requests row not found', { dbRequestId, orderId });
        return res.status(404).json({ error: 'Top up request not found' });
      }

      const notifiedAmount = Math.round(Number(gross_amount));
      const storedAmount = Math.round(Number(pendingReq.amount));
      if (notifiedAmount !== storedAmount) {
        console.error('Midtrans Webhook: amount mismatch, refusing to credit', {
          dbRequestId, notifiedAmount, storedAmount,
        });
        return res.status(400).json({ error: 'Amount mismatch' });
      }

      // Approve + credit + ledger row in ONE DB transaction
      // (migrations/0071). Previously these were three separate calls: if
      // the credit or ledger insert failed after the status flip committed,
      // the gateway's retry saw a non-pending row and skipped it, so the
      // customer paid but was never credited. Replays still no-op: the RPC
      // returns 'already_processed' once the row is no longer pending.
      const { data: outcome, error: approveErr } = await supabaseAdmin.rpc('approve_topup_and_credit', {
        p_request_id: dbRequestId,
        p_expected_amount: notifiedAmount,
        p_expected_method: 'midtrans',
        p_description: 'Top-Up WiraPay via Midtrans',
        p_reference_id: orderId,
      });
      if (approveErr) throw approveErr;
      if (outcome === 'not_found') {
        return res.status(404).json({ error: 'Top up request not found' });
      }
      // 'approved' or 'already_processed' - both acknowledged with 200.

    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
      // Same idempotency discipline - only flip it if it's still pending.
      await supabaseAdmin
        .from('topup_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', dbRequestId)
        .eq('status', 'pending');
    }
    // 'pending' transaction_status: still pending, nothing to do.

    res.status(200).send('OK');
  } catch (error) {
    console.error('Midtrans Webhook Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
