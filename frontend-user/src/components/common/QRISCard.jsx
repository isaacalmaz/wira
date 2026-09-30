import qrisImg from '../../assets/qris-wira.jpeg';
import { useTranslation } from '../../i18n';

/**
 * QRISCard Component
 * Displays the real, scannable Wira QRIS code (Standar Pembayaran Nasional).
 */
export default function QRISCard({ className = '' }) {
  const { t } = useTranslation();

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-md max-w-[280px] mx-auto overflow-hidden ${className}`}>
      <img
        src={qrisImg}
        alt={t('wallet.qris_alt')}
        className="w-full h-auto block"
      />
    </div>
  );
}
