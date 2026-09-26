import qrisImg from '../../assets/qris-wira.jpeg';

/**
 * QRISCard Component
 * Displays the real, scannable Wira QRIS code (Standar Pembayaran Nasional).
 */
export default function QRISCard({ className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-md max-w-[280px] mx-auto overflow-hidden ${className}`}>
      <img
        src={qrisImg}
        alt="QRIS Wira - Scan untuk membayar"
        className="w-full h-auto block"
      />
    </div>
  );
}
