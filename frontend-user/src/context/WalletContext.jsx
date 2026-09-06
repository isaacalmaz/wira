import React, { createContext, useContext, useState, useEffect } from 'react';
import { getStorage, setStorage } from '../utils/localStorage';
import { supabase } from '../config/supabase';

const WalletContext = createContext();

const DEFAULT_TRANSACTIONS = [
  { id: 'TRX-101', type: 'income', desc: 'Bonus Pengguna Baru Wira', date: 'Hari ini, 08:00', amount: 50000, status: 'Berhasil' },
  { id: 'TRX-102', type: 'income', desc: 'Top Up Bank BCA', date: 'Kemarin, 14:30', amount: 100000, status: 'Berhasil' },
];

export const WalletProvider = ({ children }) => {
  const [balance, setBalance] = useState(() => getStorage('wira_wallet_balance', 150000));
  const [transactions, setTransactions] = useState(() => getStorage('wira_wallet_transactions', DEFAULT_TRANSACTIONS));

  // Simpan ke localStorage setiap kali saldo atau transaksi berubah
  useEffect(() => {
    setStorage('wira_wallet_balance', balance);
  }, [balance]);

  useEffect(() => {
    setStorage('wira_wallet_transactions', transactions);
  }, [transactions]);

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
