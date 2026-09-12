import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const WalletContext = createContext();

export const WalletProvider = ({ children }) => {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setBalance(0);
      setTransactions([]);
      return;
    }

    const abortController = new AbortController();

    const fetchWallet = async () => {
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .abortSignal(abortController.signal);

        if (error && error.name !== 'AbortError') {
          console.error('Failed to fetch wallet:', error);
          return;
        }

        if (data) {
          const mappedTrx = data.map(t => ({
            id: t.id,
            type: t.type === 'topup' ? 'income' : 'expense',
            desc: t.description,
            date: new Date(t.created_at).toLocaleDateString('id-ID'),
            amount: t.amount,
          }));
          
          if (!abortController.signal.aborted) {
            setTransactions(mappedTrx);
            const totalIncome = data.filter(t => t.type === 'topup').reduce((sum, t) => sum + Number(t.amount), 0);
            const totalExpense = data.filter(t => t.type !== 'topup').reduce((sum, t) => sum + Number(t.amount), 0);
            setBalance(totalIncome - totalExpense);
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Error fetching wallet:', err);
        }
      }
    };

    fetchWallet();

    return () => {
      abortController.abort();
    };
  }, [user]);

  const topUp = async (amount, method = 'BCA Virtual Account') => {
    const numAmount = Number(amount);
    const newTrx = {
      id: `TOP-${Date.now().toString().slice(-6)}`,
      type: 'income',
      desc: `Top Up via ${method}`,
      date: 'Baru saja',
      amount: numAmount,
      status: 'Berhasil',
    };

    setBalance((prev) => prev + numAmount);
    setTransactions((prev) => [newTrx, ...prev]);

    try {
      const { error } = await supabase.from('transactions').insert([
        {
          user_id: user?.id || null,
          amount: numAmount,
          type: 'topup',
          status: 'success',
          description: `Top Up via ${method}`,
        },
      ]);
      
      if (error) throw error;
      toast.success('Top up berhasil');
      return true;
    } catch (err) {
      console.error('Topup failed:', err);
      // Rollback
      setBalance((prev) => prev - numAmount);
      setTransactions((prev) => prev.filter(t => t.id !== newTrx.id));
      toast.error('Top up gagal. Silakan coba lagi.');
      throw err;
    }
  };

  const transfer = async (amount, recipientPhone, recipientName = 'Pengguna Wira') => {
    const numAmount = Number(amount);
    if (balance < numAmount) {
      toast.error('Saldo WiraPay Anda tidak mencukupi');
      throw new Error('Saldo WiraPay Anda tidak mencukupi');
    }

    const newTrx = {
      id: `TRF-${Date.now().toString().slice(-6)}`,
      type: 'expense',
      desc: `Transfer ke ${recipientName} (${recipientPhone})`,
      date: 'Baru saja',
      amount: numAmount,
      status: 'Berhasil',
    };

    setBalance((prev) => prev - numAmount);
    setTransactions((prev) => [newTrx, ...prev]);

    try {
      const { error } = await supabase.from('transactions').insert([
        {
          user_id: user?.id || null,
          amount: numAmount,
          type: 'transfer',
          status: 'success',
          description: `Transfer ke ${recipientPhone}`,
        },
      ]);

      if (error) throw error;
      toast.success('Transfer berhasil');
      return true;
    } catch (err) {
      console.error('Transfer failed:', err);
      // Rollback
      setBalance((prev) => prev + numAmount);
      setTransactions((prev) => prev.filter(t => t.id !== newTrx.id));
      toast.error('Transfer gagal. Silakan coba lagi.');
      throw err;
    }
  };

  const pay = async (amount, desc = 'Pembayaran Layanan') => {
    const numAmount = Number(amount);
    if (balance < numAmount) {
      toast.error('Saldo WiraPay tidak mencukupi');
      throw new Error('Saldo WiraPay tidak mencukupi');
    }

    const newTrx = {
      id: `PAY-${Date.now().toString().slice(-6)}`,
      type: 'expense',
      desc: desc,
      date: 'Baru saja',
      amount: numAmount,
      status: 'Berhasil',
    };

    setBalance((prev) => prev - numAmount);
    setTransactions((prev) => [newTrx, ...prev]);

    try {
      const { error } = await supabase.from('transactions').insert([
        {
          user_id: user?.id || null,
          amount: numAmount,
          type: 'payment',
          status: 'success',
          description: desc,
        },
      ]);
      
      if (error) throw error;
      toast.success('Pembayaran berhasil');
      return true;
    } catch (err) {
      console.error('Payment failed:', err);
      // Rollback
      setBalance((prev) => prev + numAmount);
      setTransactions((prev) => prev.filter(t => t.id !== newTrx.id));
      toast.error('Pembayaran gagal. Silakan coba lagi.');
      throw err;
    }
  };

  return (
    <WalletContext.Provider value={{ balance, transactions, topUp, transfer, pay }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => useContext(WalletContext);
