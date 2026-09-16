import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const WalletContext = createContext();

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
          type: (t.type === 'topup' || t.type === 'transfer_in') ? 'income' : 'expense',
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

  const refund = async (amount, desc = 'Refund Layanan') => {
    const numAmount = Number(amount);
    try {
      const { data, error } = await supabase.rpc('wallet_refund', {
        p_amount: numAmount,
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

  return (
    <WalletContext.Provider value={{ balance, transactions, transfer, pay, refund }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => useContext(WalletContext);
