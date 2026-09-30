import qrisImg from '../../assets/qris-wira.jpeg';
import { useTranslation } from '../../i18n';

/**
 * QRISCard Component
 * Displays the real, scannable Wira QRIS code (Standar Pembayaran Nasional).
 * The code always sits on white, in both themes, so every scanner can read it.
 */
export default function QRISCard({ className = '' }) {
  const { t } = useTranslation();

  return (
    <div className={`mx-auto w-full max-w-[260px] overflow-hidden rounded-card border border-line bg-white p-2 ${className}`}>
      <img
        src={qrisImg}
        alt={t('wallet.qris_alt')}
        className="block h-auto w-full rounded-[10px]"
      />
    </div>
  );
}
