import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from './AuthContext';

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

    const fetchWallet = async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data) {
        // Mapping tipe DB ke UI
        const mappedTrx = data.map(t => ({
          id: t.id,
          type: t.type === 'topup' ? 'income' : 'expense',
          desc: t.description,
          date: new Date(t.created_at).toLocaleDateString('id-ID'),
          amount: t.amount,
        }));
        setTransactions(mappedTrx);

        // Kalkulasi saldo
        const totalIncome = data.filter(t => t.type === 'topup').reduce((sum, t) => sum + Number(t.amount), 0);
        const totalExpense = data.filter(t => t.type !== 'topup').reduce((sum, t) => sum + Number(t.amount), 0);
        setBalance(totalIncome - totalExpense);
      }
    };

    fetchWallet();
  }, [user]);

  // Fungsi Top Up
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

    // Catat ke Supabase jika tersedia
    try {
      await supabase.from('transactions').insert([
        {
          user_id: (await supabase.auth.getSession()).data.session?.user?.id || null,
          amount: numAmount,
          type: 'topup',
          status: 'success',
          description: `Top Up via ${method}`,
        },
      ]);
    } catch (err) {
      console.log('Saved locally:', err);
    }

    return true;
  };

  // Fungsi Transfer Antar Pengguna
  const transfer = async (amount, recipientPhone, recipientName = 'Pengguna Wira') => {
    const numAmount = Number(amount);
    if (balance < numAmount) {
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
      await supabase.from('transactions').insert([
        {
          user_id: (await supabase.auth.getSession()).data.session?.user?.id || null,
          amount: numAmount,
          type: 'transfer',
          status: 'success',
          description: `Transfer ke ${recipientPhone}`,
        },
      ]);
    } catch (err) {
      console.log('Saved locally:', err);
    }

    return true;
  };

  // Fungsi Pembayaran Layanan (Ride, Food, Pulsa, dll)
  const pay = async (amount, desc = 'Pembayaran Layanan') => {
    const numAmount = Number(amount);
    if (balance < numAmount) {
      throw new Error('Saldo WiraPay tidak mencukupi untuk melakukan pembayaran ini');
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
      await supabase.from('transactions').insert([
        {
          user_id: (await supabase.auth.getSession()).data.session?.user?.id || null,
          amount: numAmount,
          type: 'payment',
          status: 'success',
          description: desc,
        },
      ]);
    } catch (err) {
      console.log('Saved locally:', err);
    }

    return true;
  };

  return (
    <WalletContext.Provider value={{ balance, transactions, topUp, transfer, pay }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => useContext(WalletContext);
