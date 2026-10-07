import { useState } from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { Button, Sheet, cx } from '../ui';

/**
 * Asks for the order's 4-digit PIN and starts it through
 * start_order_with_pin - since migrations/0113 the only way to move an order
 * to 'in_trip' / 'working'. onStarted(status) runs after a correct PIN.
 */
export default function OrderPinSheet({ order, open, onClose, onStarted, description }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setPin('');
    setError('');
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (pin.length !== 4 || !order) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('start_order_with_pin', { p_order_id: order.id, p_pin_input: pin });
      if (rpcError) throw rpcError;
      if (!data?.success) {
        setError(data?.error || 'PIN salah');
        return;
      }
      toast.success('PIN benar. Perjalanan dimulai.');
      setPin('');
      onStarted(data.status || 'in_trip');
    } catch (err) {
      setError(err.message || 'PIN belum bisa dicek. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      dismissible={!busy}
      size="sm"
      icon={<Lock size={22} />}
      title="Masukkan PIN Pesanan"
      description={description}
      footer={(
        <>
          <Button variant="secondary" size="lg" onClick={close} disabled={busy}>Batal</Button>
          <Button type="submit" form="driver-pin-form" size="lg" isLoading={busy} disabled={pin.length !== 4}>
            {busy ? 'Memverifikasi...' : 'Konfirmasi'}
          </Button>
        </>
      )}
    >
      <form id="driver-pin-form" onSubmit={submit} className="flex flex-col gap-2">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoFocus
          autoComplete="one-time-code"
          aria-label="PIN Pesanan"
          aria-invalid={!!error}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="----"
          className={cx(
            'block w-full rounded-control border-2 bg-card py-3 pl-[0.5em] text-center font-mono text-[32px] font-medium tracking-[0.5em] text-ink placeholder:text-ink-muted/50 focus:ring-2',
            error ? 'border-danger focus:border-danger focus:ring-danger/20' : 'border-line-strong focus:border-brand focus:ring-brand/20',
          )}
        />
        {error && <p className="text-center text-sm text-danger-ink">{error}</p>}
      </form>
    </Sheet>
  );
}
