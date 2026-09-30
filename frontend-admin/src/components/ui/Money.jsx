import { cx } from './cx';

/**
 * A rupiah amount in IBM Plex Mono with tabular digits.
 * sign: 'plus' | 'minus' | undefined. tone: 'default' | 'in' (green) | 'out' | 'pay' | 'muted'.
 * `plain` drops the "Rp" prefix (for tight lists where the column says Rp).
 */
export default function Money({ value, sign, tone = 'default', plain = false, className = '' }) {
  // Rupiah has no minor unit in practice: always show whole rupiah.
  const n = Math.round(Math.abs(Number(value) || 0)).toLocaleString('id-ID');
  const prefix = sign === 'plus' ? '+ ' : sign === 'minus' ? '− ' : '';
  const color = {
    default: '',
    in: 'text-success',
    out: '',
    pay: 'text-pay-ink',
    muted: 'text-ink-muted',
  }[tone] ?? '';
  return (
    <span className={cx('font-mono whitespace-nowrap', color, className)}>
      {prefix}{plain ? n : `Rp ${n}`}
    </span>
  );
}
