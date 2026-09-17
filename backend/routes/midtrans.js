const express = require('express');
const router = express.Router();
const midtransClient = require('midtrans-client');
const { supabaseAdmin } = require('../database/supabase');

// Initialize Snap Client
// The server key should ideally come from env vars. We'll use a placeholder/env.
const snap = new midtransClient.Snap({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-YOUR_SERVER_KEY',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-YOUR_CLIENT_KEY'
});

// 1. Endpoint to generate Snap Token for Top-Up
router.post('/charge', async (req, res) => {
  try {
    const { user_id, amount, customer_name, customer_email, customer_phone } = req.body;

    if (!user_id || !amount) {
      return res.status(400).json({ error: 'User ID and amount are required' });
    }

    // Create a pending transaction record in Supabase
    // We insert into topup_requests so we can track it
    const { data: requestRecord, error: dbError } = await supabaseAdmin
      .from('topup_requests')
      .insert({
        user_id,
        amount,
        method: 'midtrans',
        status: 'pending'
      })
      .select('id')
      .single();

    if (dbError) throw dbError;

    // Build Midtrans parameter
    const parameter = {
      transaction_details: {
        order_id: `WIRA-TOPUP-${requestRecord.id}-${Date.now()}`,
        gross_amount: amount
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
    
    // We optionally save the token to the DB if we want, but returning it is enough
    res.json({
      token: transaction.token,
      redirect_url: transaction.redirect_url,
      order_id: parameter.transaction_details.order_id
    });

  } catch (error) {
    console.error('Midtrans Charge Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Webhook for Midtrans Notification (Callback)
router.post('/webhook', async (req, res) => {
  try {
    const statusResponse = await snap.transaction.notification(req.body);
    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    // Extract the original topup_request ID (format: WIRA-TOPUP-<id>-<timestamp>)
    const parts = orderId.split('-');
    const requestId = parts[2]; // assuming the ID is a UUID without hyphens? Oh wait UUID has hyphens!
    // Better logic: order_id was `WIRA-TOPUP-${id}-${Date.now()}`.
    // So ID is everything between `WIRA-TOPUP-` and `-${Date.now()}`
    const match = orderId.match(/WIRA-TOPUP-(.+)-\d+$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }
    const dbRequestId = match[1];

    if (transactionStatus == 'capture' || transactionStatus == 'settlement') {
      if (fraudStatus == 'challenge') {
        // Handle challenge
      } else if (fraudStatus == 'accept' || transactionStatus == 'settlement') {
        // Payment successful -> Top Up the Wallet
        
        // Check if already processed
        const { data: currentReq } = await supabaseAdmin
          .from('topup_requests')
          .select('*')
          .eq('id', dbRequestId)
          .single();
          
        if (currentReq && currentReq.status === 'pending') {
          // Update status to approved
          await supabaseAdmin
            .from('topup_requests')
            .update({ status: 'approved' })
            .eq('id', dbRequestId);
            
          // Add balance (We'll use RPC or manual select+update)
          const { data: user } = await supabaseAdmin
            .from('users')
            .select('wallet_balance')
            .eq('id', currentReq.user_id)
            .single();
            
          const newBalance = (user?.wallet_balance || 0) + currentReq.amount;
          
          await supabaseAdmin
            .from('users')
            .update({ wallet_balance: newBalance })
            .eq('id', currentReq.user_id);
            
          // Insert into transactions
          await supabaseAdmin
            .from('transactions')
            .insert({
              user_id: currentReq.user_id,
              type: 'topup',
              amount: currentReq.amount,
              description: 'Top-Up WiraPay via Midtrans',
              reference_id: orderId
            });
        }
      }
    } else if (transactionStatus == 'cancel' || transactionStatus == 'deny' || transactionStatus == 'expire') {
      // Mark as failed
      await supabaseAdmin
        .from('topup_requests')
        .update({ status: 'rejected' })
        .eq('id', dbRequestId);
    } else if (transactionStatus == 'pending') {
      // Still pending, do nothing
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Midtrans Webhook Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
