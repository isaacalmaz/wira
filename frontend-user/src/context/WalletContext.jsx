import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const WalletContext = createContext();

// transactions.type values that add money to the wallet. refund (order
// cancellations, 0040/0066) and correction_in (admin corrections, 0062) were
// previously shown as expenses.
const INCOME_TYPES = new Set(['topup', 'transfer_in', 'refund', 'correction_in']);

export const WalletProvider = ({ children }) => {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const { user } = useAuth();

  const fetchWallet = useCallback(async (signal) => {
    if (!user) return;
    try {
      const [{ data: userRow, error: userErr }, { data: txRows, error: txErr }] = await Promise.all([
        supabase.from('users').select('wallet_balance').eq('id', user.id).single().abortSignal(signal),
        supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).abortSignal(signal),
      ]);

      if (userErr && userErr.name !== 'AbortError') console.error('Failed to fetch wallet_balance:', userErr);
      if (txErr && txErr.name !== 'AbortError') console.error('Failed to fetch transactions:', txErr);
      if (signal?.aborted) return;

      if (userRow) setBalance(Number(userRow.wallet_balance) || 0);
      if (txRows) {
        setTransactions(txRows.map(t => ({
          id: t.id,
          type: INCOME_TYPES.has(t.type) ? 'income' : 'expense',
          desc: t.description,
          date: new Date(t.created_at).toLocaleDateString('id-ID'),
          amount: t.amount,
        })));
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Error fetching wallet:', err);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setBalance(0);
      setTransactions([]);
      return;
    }
    const abortController = new AbortController();
    fetchWallet(abortController.signal);
    return () => abortController.abort();
  }, [user, fetchWallet]);

  const transfer = async (amount, recipientPhone) => {
    const numAmount = Number(amount);
    try {
      const { data, error } = await supabase.rpc('wallet_transfer', {
        p_amount: numAmount,
        p_recipient_phone: recipientPhone,
      });

      if (error) {
        toast.error(error.message || 'Transfer gagal. Silakan coba lagi.');
        throw error;
      }
      if (data !== true) {
        toast.error('Saldo WiraPay Anda tidak mencukupi');
        throw new Error('Saldo WiraPay Anda tidak mencukupi');
      }

      await fetchWallet();
      toast.success('Transfer berhasil');
      return true;
    } catch (err) {
      console.error('Transfer failed:', err);
      throw err;
    }
  };

  const pay = async (amount, desc = 'Pembayaran Layanan') => {
    const numAmount = Number(amount);
    try {
      const { data, error } = await supabase.rpc('wallet_pay', {
        p_amount: numAmount,
        p_description: desc,
      });

      if (error) {
        toast.error(error.message || 'Pembayaran gagal. Silakan coba lagi.');
        throw error;
      }
      if (data !== true) {
        toast.error('Saldo WiraPay tidak mencukupi');
        throw new Error('Saldo WiraPay tidak mencukupi');
      }

      await fetchWallet();
      toast.success('Pembayaran berhasil');
      return true;
    } catch (err) {
      console.error('Payment failed:', err);
      throw err;
    }
  };

  // Takes the order id (not a raw amount) so the RPC can verify server-side
  // that this order actually belongs to the caller and is still in a
  // refundable state - see migrations/0040_wallet_refund_rpc.sql. This also
  // makes the call naturally idempotent: a second call against the same
  // order (e.g. a double-click) is rejected by the RPC instead of crediting
  // twice.
  const refund = async (orderId, desc = 'Refund Layanan') => {
    try {
      const { data, error } = await supabase.rpc('wallet_refund', {
        p_order_id: orderId,
        p_description: desc,
      });

      if (error) {
        toast.error(error.message || 'Refund gagal.');
        throw error;
      }

      await fetchWallet();
      return true;
    } catch (err) {
      console.error('Refund failed:', err);
      throw err;
    }
  };

  // Cancels an already-MATCHED ride/send order (status 'accepted' or
  // 'picking_up' - a driver has already accepted) via the
  // wallet_refund_matched_ride RPC - see
  // migrations/0047_cancel_matched_ride_refund_rpc.sql for the full
  // eligibility/refund-policy reasoning. Distinct from refund() above
  // (which only covers the pre-match 'pending' case via wallet_refund):
  // this RPC can be called by either the order's customer OR its assigned
  // driver, always credits the customer's wallet (never the caller's), and
  // flips the order to 'cancelled' itself - callers don't need a separate
  // updateOrderStatus call, even for cash orders (no RLS grant exists for a
  // customer to update their own matched order directly, so this RPC is
  // required for the cash case too, not just the WiraPay one).
  const refundMatchedRide = async (orderId, desc = 'Refund Pembatalan Perjalanan') => {
    try {
      const { data, error } = await supabase.rpc('wallet_refund_matched_ride', {
        p_order_id: orderId,
        p_description: desc,
      });

      if (error) {
        toast.error(error.message || 'Pembatalan gagal.');
        throw error;
      }

      await fetchWallet();
      return data;
    } catch (err) {
      console.error('Cancel matched ride failed:', err);
      throw err;
    }
  };

  return (
    <WalletContext.Provider value={{ balance, transactions, transfer, pay, refund, refundMatchedRide, refreshWallet: fetchWallet }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => useContext(WalletContext);
