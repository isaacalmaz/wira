import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import WiraMark from '../../components/brand/WiraMark';
import { Card } from '../../components/ui';

// Public page (no login) — its URL is the privacy policy link for the
// Google Play listings of both Wira and Wira Mitra.
const CONTACT_EMAIL = 'wiraapp123@gmail.com';

const CONTENT = {
  id: {
    title: 'Kebijakan Privasi',
    updated: 'Diperbarui 7 Oktober 2026',
    intro:
      'Kebijakan ini menjelaskan data apa yang dikumpulkan oleh aplikasi Wira (pelanggan) dan Wira Mitra (pengemudi, merchant, pemilik villa, dan teknisi), untuk apa data itu dipakai, dan pilihan yang Anda miliki.',
    sections: [
      ['Data yang kami kumpulkan', [
        'Data akun: nama, nomor telepon, email, dan foto profil.',
        'Lokasi: lokasi perangkat saat Anda memesan (titik jemput dan tujuan) dan, bagi mitra, lokasi selama aplikasi dibuka dan sedang menerima atau menjalankan pesanan, agar pesanan bisa dicocokkan dan dilacak.',
        'Data pesanan: layanan yang dipesan, alamat, waktu, harga, metode pembayaran, ulasan, dan percakapan chat dengan mitra atau pelanggan.',
        'Data pendaftaran mitra: foto KTP, swafoto, SIM/STNK, data kendaraan, data usaha atau villa, dan nomor rekening/e-wallet untuk pencairan.',
        'Foto yang Anda unggah: foto menu, villa, lampiran chat, dan bukti pembayaran. Kamera dan galeri hanya diakses saat Anda memilih untuk mengunggah.',
        'WiraAsuh (pengasuhan anak): nama panggilan dan usia anak, serta catatan yang Anda isi untuk pengasuh, termasuk alergi, obat, dan jadwal anak. Data ini diisi oleh orang tua, hanya dilihat oleh pengasuh yang ditugaskan dan admin Wira, dan hanya dipakai untuk menjalankan sesi pengasuhan tersebut.',
        'Data perangkat: token notifikasi, versi aplikasi, dan catatan error untuk perbaikan aplikasi.',
      ]],
      ['Untuk apa data dipakai', [
        'Menjalankan layanan: mencocokkan pesanan dengan mitra terdekat, menampilkan rute, dan menghitung harga.',
        'Mengirim notifikasi tentang pesanan, pembaruan aplikasi, dan pengumuman penting.',
        'Memverifikasi identitas mitra demi keamanan pelanggan.',
        'Memproses pembayaran, komisi, dan pencairan dana mitra.',
        'Menangani keluhan, mencegah penipuan, dan memenuhi kewajiban hukum.',
      ]],
      ['Berbagi data', [
        'Pelanggan dan mitra saling melihat nama, foto, nomor kendaraan, dan lokasi selama pesanan berlangsung.',
        'Penyedia layanan teknis yang kami pakai untuk menjalankan aplikasi: Supabase (database dan penyimpanan), Google Maps (peta dan rute), Firebase Cloud Messaging (notifikasi), dan Vercel (hosting website).',
        'Instansi berwenang jika diwajibkan oleh hukum.',
        'Kami tidak menjual data pribadi Anda dan tidak membagikannya untuk iklan.',
      ]],
      ['Penyimpanan dan keamanan', [
        'Data dikirim melalui koneksi terenkripsi (HTTPS) dan akses dibatasi sesuai peran akun.',
        'Data disimpan selama akun Anda aktif. Riwayat transaksi dapat disimpan lebih lama bila diwajibkan untuk keperluan pembukuan atau hukum.',
      ]],
      ['Hak dan pilihan Anda', [
        'Mengubah data profil kapan saja dari menu Profil.',
        'Mematikan izin lokasi, kamera, atau notifikasi dari pengaturan perangkat. Sebagian fitur mungkin tidak berjalan tanpa izin tersebut.',
        `Menghapus akun beserta datanya kapan saja dari menu Profil/Pengaturan di aplikasi atau di wira.one/hapus-akun. Salinan data bisa diminta lewat email ke ${CONTACT_EMAIL} dari email atau nomor yang terdaftar, kami proses dalam 14 hari kerja.`,
      ]],
      ['Anak-anak', [
        'Akun Wira hanya untuk pengguna berusia 18 tahun ke atas, dan anak tidak membuat akun sendiri. Data anak di WiraAsuh hanya diberikan oleh orang tua atau walinya. Mitra wajib berusia minimal 17 tahun dan memiliki KTP.',
      ]],
      ['Perubahan kebijakan', [
        'Jika kebijakan ini berubah, tanggal di atas akan diperbarui dan perubahan penting akan diumumkan di aplikasi.',
      ]],
    ],
    contact: 'Pertanyaan tentang privasi? Hubungi kami di',
    back: 'Kembali ke Wira',
  },
  en: {
    title: 'Privacy Policy',
    updated: 'Effective 7 October 2026',
    intro:
      'This policy explains what data the Wira (customer) and Wira Mitra (drivers, merchants, villa hosts and technicians) apps collect, how it is used, and the choices you have.',
    sections: [
      ['Data we collect', [
        'Account data: name, phone number, email and profile photo.',
        'Location: your device location when you place an order (pickup and destination) and, for partners, location while the app is open and receiving or carrying out orders, so orders can be matched and tracked.',
        'Order data: services ordered, addresses, times, prices, payment method, reviews and chat messages with partners or customers.',
        'Partner registration data: ID card photo, selfie, driving licence/vehicle registration, vehicle details, business or villa details, and bank/e-wallet details for payouts.',
        'Photos you upload: menu, villa, chat attachments and payment receipts. The camera and gallery are only accessed when you choose to upload.',
        'WiraAsuh (childcare): your child\u2019s nickname and age, and the notes you write for the nanny, including allergies, medication and routines. A parent enters this; only the assigned nanny and Wira admins can see it, and it is used only to run that babysitting session.',
        'Device data: notification token, app version and error logs used to fix problems.',
      ]],
      ['How we use data', [
        'To run the service: match orders with nearby partners, show routes and calculate prices.',
        'To send notifications about orders, app updates and important announcements.',
        'To verify partner identity for customer safety.',
        'To process payments, commissions and partner payouts.',
        'To handle complaints, prevent fraud and meet legal obligations.',
      ]],
      ['Sharing', [
        'Customers and partners see each other’s name, photo, vehicle plate and location while an order is active.',
        'Technical providers that run the app: Supabase (database and storage), Google Maps (maps and routes), Firebase Cloud Messaging (notifications) and Vercel (website hosting).',
        'Authorities when required by law.',
        'We do not sell your personal data or share it for advertising.',
      ]],
      ['Storage and security', [
        'Data travels over encrypted connections (HTTPS) and access is limited by account role.',
        'Data is kept while your account is active. Transaction history may be kept longer where accounting or legal rules require it.',
      ]],
      ['Your rights and choices', [
        'Edit your profile at any time from the Profile menu.',
        'Turn off location, camera or notification permissions in your device settings. Some features may not work without them.',
        `Delete your account and its data at any time from Profile/Settings in the app or at wira.one/hapus-akun. Request a copy of your data by emailing ${CONTACT_EMAIL} from your registered email or number; we handle requests within 14 working days.`,
      ]],
      ['Children', [
        'Wira accounts are for people aged 18 and over; children never create an account. Children\u2019s details in WiraAsuh are provided only by a parent or guardian. Partners must be at least 17 and hold an Indonesian ID card.',
      ]],
      ['Changes', [
        'If this policy changes, the date above will be updated and important changes will be announced in the app.',
      ]],
    ],
    contact: 'Questions about privacy? Contact us at',
    back: 'Back to Wira',
  },
};

export default function PrivacyPage() {
  const { lang } = useTranslation();
  const c = CONTENT[lang] || CONTENT.id;

  return (
    <div className="min-h-[100dvh] bg-ground px-4 pb-16 pt-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Link to="/" className="self-start" aria-label={c.back}>
          <WiraMark />
        </Link>

        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-ink text-balance">{c.title}</h1>
          <p className="text-sm text-ink-muted">{c.updated}</p>
        </header>

        <Card padding="lg">
          <article className="flex flex-col gap-6 text-sm leading-relaxed text-ink">
            <p>{c.intro}</p>
            {c.sections.map(([heading, items]) => (
              <section key={heading} className="flex flex-col gap-2">
                <h2 className="text-[15px] font-bold tracking-tight text-ink text-balance">{heading}</h2>
                <ul className="flex list-disc flex-col gap-1.5 pl-5">
                  {items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            ))}
            <p>
              {c.contact}{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-brand-ink underline">{CONTACT_EMAIL}</a>.
            </p>
          </article>
        </Card>

        <Link to="/" className="self-start text-sm font-medium text-brand-ink">{c.back}</Link>
      </div>
    </div>
  );
}
