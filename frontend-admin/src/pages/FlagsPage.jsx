import { PageHeader } from '../components/ui';
import PartnerFlagsList from '../components/common/PartnerFlagsList';

/**
 * "Penanda Mitra" (migrations/0125): payment answers from customers and
 * patterns worth a look. Admins decide what to do; nothing is automatic.
 */
export default function FlagsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="Penanda mitra"
        subtitle="Jawaban pelanggan soal pembayaran tunai, teknisi yang pekerjaan lainnya sering berakhir di biaya cek, dan pelanggan yang sering tidak di lokasi. Hubungi pihak terkait sebelum memberi peringatan; laporan bisa saja keliru."
        className="mb-0"
      />
      <PartnerFlagsList />
    </div>
  );
}
