import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Landmark } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Button, Field, Input, Sheet } from '../ui';

const STORAGE_KEY = 'wira.titipTransferAccount';

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function buildText({ store, amount, bank, number, holder }) {
  return [
    `Halo Kak, saya driver Wira untuk titip beli di ${store || 'toko'}.`,
    `Supaya belanjaan bisa langsung saya bayar di kasir, boleh transfer dulu uang belanjanya Rp ${Number(amount || 0).toLocaleString('id-ID')} ke:`,
    `${bank} ${number}`,
    `a.n. ${holder}`,
    'Kabari di chat ini setelah transfer ya. Sisa uang saya kembalikan tunai sesuai struk, dan saat barang tiba Kakak cukup bayar ongkir. Terima kasih 🙏',
  ].join('\n');
}

/**
 * Titip beli (owner's decision 2026-10-14): a driver without cash to pay at
 * the store can ask the customer, in the order chat, to transfer the
 * shopping money to the driver's own account first. Prefilled from the last
 * account used here or in a payout request; the driver checks the text and
 * sends it.
 */
export default function TitipTransferTemplate({ order, userId, onSend }) {
  const [open, setOpen] = useState(false);
  const [bank, setBank] = useState('');
  const [number, setNumber] = useState('');
  const [holder, setHolder] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const titip = order.metadata?.titip || {};

  useEffect(() => {
    if (!open) return;
    setAmount(String(Number(titip.budget) || ''));
    const saved = readSaved();
    if (saved) {
      setBank(saved.bank || '');
      setNumber(saved.number || '');
      setHolder(saved.holder || '');
      return;
    }
    supabase.from('payout_requests').select('payout_method, payout_destination, payout_account_name')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => {
        const last = data?.[0];
        if (!last) return;
        setNumber(last.payout_destination || '');
        setHolder(last.payout_account_name || '');
      });
  }, [open, titip.budget, userId]);

  const amountNum = Number(String(amount).replace(/\D/g, '')) || 0;
  const ready = bank.trim() && number.trim().length >= 5 && holder.trim() && amountNum > 0;
  const text = ready ? buildText({ store: titip.store, amount: amountNum, bank: bank.trim(), number: number.trim(), holder: holder.trim() }) : '';

  const send = async () => {
    if (!ready) { toast.error('Lengkapi bank/e-wallet, nomor, nama, dan jumlah'); return; }
    if (amountNum > Number(titip.budget || 0)) { toast.error('Jumlah tidak boleh di atas batas belanja pelanggan'); return; }
    setSending(true);
    try {
      await onSend(text);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ bank: bank.trim(), number: number.trim(), holder: holder.trim() }));
      } catch { /* private mode: nothing to remember */ }
      setOpen(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="bg-ground px-3 pb-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong bg-card px-3.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand"
        >
          <Landmark size={14} className="text-brand-ink" aria-hidden="true" />
          Template: minta transfer uang belanja
        </button>
      </div>

      <Sheet
        open={open}
        onClose={() => !sending && setOpen(false)}
        title="Minta transfer uang belanja"
        description="Kalau tidak ada uang tunai untuk menalangi, minta pelanggan transfer dulu ke rekening Anda. Pesan ini dikirim ke chat pesanan."
        footer={(
          <>
            <Button variant="secondary" size="lg" onClick={() => setOpen(false)} disabled={sending}>Batal</Button>
            <Button size="lg" onClick={send} isLoading={sending} disabled={!ready}>Kirim ke pelanggan</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3.5">
          <Field label="Bank / e-wallet" htmlFor="tt-bank" required>
            <Input id="tt-bank" value={bank} onChange={(e) => setBank(e.target.value.slice(0, 30))} placeholder="Contoh: BRI, DANA" />
          </Field>
          <Field label="Nomor rekening / e-wallet" htmlFor="tt-number" required>
            <Input id="tt-number" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/[^\d\s-]/g, '').slice(0, 30))} className="font-mono" />
          </Field>
          <Field label="Atas nama" htmlFor="tt-holder" required>
            <Input id="tt-holder" value={holder} onChange={(e) => setHolder(e.target.value.slice(0, 60))} />
          </Field>
          <Field label="Jumlah (Rp)" htmlFor="tt-amount" required hint="Biasanya sebesar batas belanja pelanggan.">
            <Input
              id="tt-amount"
              inputMode="numeric"
              value={amountNum ? amountNum.toLocaleString('id-ID') : ''}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 9))}
              className="font-mono"
            />
          </Field>
          {text && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-ink">Pratinjau pesan</span>
              <p className="whitespace-pre-wrap rounded-card border border-line bg-ground px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">{text}</p>
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}
