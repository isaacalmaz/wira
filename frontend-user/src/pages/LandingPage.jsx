import { Link } from 'react-router-dom';
import { Car, UtensilsCrossed, Package, Home, Wrench, Waves, Baby, KeyRound, ReceiptText, LifeBuoy } from 'lucide-react';

// Front page for visitors who are not signed in (Layout shows it at "/" on
// the web; the Android app goes straight to /login). Indonesian only.

const MITRA_URL = 'https://mitra.wira.one/gabung';

function Logo({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <rect width="100" height="100" rx="22" fill="#0B4F5E" stroke="#1C6676" strokeWidth="2" />
      <path d="M16 38 C26 38 28.5 70 36.5 70 C44 70 44.5 47 50 47 C55.5 47 56 70 63.5 70 C71.5 70 74 38 84 38" fill="none" stroke="#F7F6F3" strokeWidth="10.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="78" cy="20" r="7" fill="#D9A845" />
    </svg>
  );
}

const SERVICES = [
  { icon: Car, name: 'WiraRide', desc: 'Ojek motor dan mobil, harga terlihat sebelum Anda pesan.' },
  { icon: UtensilsCrossed, name: 'WiraFood', desc: 'Pesan dari warung dan resto sekitar, diantar sampai depan pintu.' },
  { icon: Package, name: 'WiraSend', desc: 'Kirim dokumen dan paket dalam kota.' },
  { icon: Home, name: 'WiraVilla', desc: 'Lihat tanggal kosong dan pesan villa langsung.' },
  { icon: Wrench, name: 'WiraService', desc: 'Teknisi AC, listrik, pipa dan tukang datang sesuai jadwal.' },
  { icon: Waves, name: 'WiraPool', desc: 'Perawatan kolam renang sekali datang atau rutin.' },
  { icon: Baby, name: 'WiraAsuh', desc: 'Pengasuh anak datang ke rumah atau villa Anda.' },
];

const STEPS = [
  { title: 'Pilih layanan', desc: 'Tentukan lokasi, jadwal dan detail pesanan. Harganya langsung terlihat.' },
  { title: 'Mitra menerima', desc: 'Mitra terdekat menerima pesanan. Pantau dan chat langsung di aplikasi.' },
  { title: 'Bayar dan beri ulasan', desc: 'Bayar tunai atau QRIS, lalu beri bintang setelah selesai.' },
];

const TRUST = [
  { icon: KeyRound, title: 'PIN saat mulai', desc: 'Perjalanan dan pekerjaan baru dimulai setelah Anda menyebutkan PIN kepada mitra.' },
  { icon: ReceiptText, title: 'Harga jelas di depan', desc: 'Tarif dan ongkos kirim tampil sebelum Anda menekan tombol pesan.' },
  { icon: LifeBuoy, title: 'Bantuan dari tim lokal', desc: 'Ada kendala? Hubungi Pusat Bantuan di aplikasi atau email halo@wira.one.' },
];

const PARTNERS = ['Driver & kurir', 'Warung & restoran', 'Pemilik villa', 'Teknisi', 'Pengasuh anak'];

const goldBtn = 'inline-flex min-h-12 items-center justify-center rounded-[14px] bg-emas-400 px-6 text-[15px] font-bold text-[#1E1A10] transition-[filter] hover:brightness-105 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-emas-400';
const ghostBtn = 'inline-flex min-h-10 items-center justify-center rounded-[12px] border border-white/35 px-4 text-[14px] font-bold text-[#F7F6F3] transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-emas-400';
const eyebrow = 'text-[12px] font-bold uppercase tracking-[0.12em] text-emas-600 dark:text-emas-400';

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-ground text-ink">
      {/* Header + hero share the sea-dark ground */}
      <div className="bg-laut-900 text-[#F7F6F3]">
        <header className="mx-auto flex min-h-[68px] max-w-6xl items-center gap-5 px-5 pt-safe">
          <Link to="/" className="inline-flex items-center gap-2.5 text-[22px] font-extrabold tracking-[-0.03em]">
            <Logo />
            wira
          </Link>
          <nav aria-label="Halaman" className="ml-auto hidden gap-6 text-[14px] font-semibold md:flex">
            <a href="#layanan" className="opacity-80 hover:opacity-100">Layanan</a>
            <a href="#cara" className="opacity-80 hover:opacity-100">Cara pesan</a>
            <a href="#mitra" className="opacity-80 hover:opacity-100">Jadi mitra</a>
          </nav>
          <Link to="/login" className={`${ghostBtn} ml-auto md:ml-0`}>Masuk</Link>
        </header>

        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-10 md:grid-cols-[1.1fr_0.9fr] md:pt-12">
          <div className="flex flex-col gap-5 pb-2 md:pb-12">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-emas-400">Lombok, dari Mataram sampai Senggigi</p>
            <h1 className="text-balance text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-[52px] lg:text-[58px]">
              Ojek, makanan, villa sampai teknisi. <span className="text-emas-400">Satu aplikasi</span> untuk Lombok.
            </h1>
            <p className="max-w-[34em] text-[18px] leading-relaxed text-[#C9D8DB]">
              Pesan dari HP, mitra terdekat datang ke tempat Anda. Bayar tunai atau QRIS.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <Link to="/login" className={goldBtn}>Mulai pesan</Link>
            </div>
          </div>

          {/* The app's home screen on a phone */}
          <div className="flex justify-center self-end" aria-hidden="true">
            <div className="w-[290px] max-w-full rounded-t-[40px] bg-[#0E1416] px-3 pt-3 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]">
              <div className="overflow-hidden rounded-t-[30px] bg-[#F7F6F3] pb-5 text-[#142328]">
                <div className="flex items-center justify-between px-4 pb-1.5 pt-4 font-extrabold text-laut-700">
                  <span className="flex items-center gap-1.5"><Logo className="h-6 w-6" />wira</span>
                  <span className="text-[11px] font-semibold text-[#6B6862]">ID</span>
                </div>
                <div className="px-4 pb-3 pt-1">
                  <span className="block text-[11px] text-[#6B6862]">Selamat pagi</span>
                  <b className="text-[18px] tracking-[-0.02em]">Mau ke mana hari ini?</b>
                </div>
                <div className="mx-3.5 mb-3.5 overflow-hidden rounded-2xl bg-laut-700 text-[#F7F6F3]">
                  <div className="tenun-band h-1.5" />
                  <div className="px-3.5 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-laut-300">Pesanan aktif</span>
                    <p className="mt-1 text-[13px] font-semibold">Driver menuju lokasi jemput</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-x-2 gap-y-2.5 px-3.5">
                  {SERVICES.map(({ icon: Icon, name }) => (
                    <div key={name} className="flex flex-col items-center gap-1 text-[10.5px] font-semibold">
                      <span className="grid aspect-[1.15] w-full place-items-center rounded-[13px] border border-laut-200 bg-laut-100 text-laut-700">
                        <Icon size={19} />
                      </span>
                      {name.replace('Wira', '')}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="tenun-band h-2.5" />
      </div>

      <main>
        <section id="layanan" className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <div className="mb-8 flex max-w-2xl flex-col gap-2.5">
            <p className={eyebrow}>Layanan</p>
            <h2 className="text-balance text-[30px] font-extrabold leading-tight tracking-[-0.02em] md:text-[38px]">Kebutuhan sehari-hari, satu tempat memesan</h2>
            <p className="text-[17px] text-ink-muted">Setiap layanan dikerjakan mitra lokal.</p>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map(({ icon: Icon, name, desc }) => (
              <article key={name} className="flex min-w-0 flex-col gap-2.5 rounded-card border border-line bg-card p-5">
                <span className="grid h-11 w-11 place-items-center rounded-[13px] bg-brand-soft text-brand-ink"><Icon size={22} /></span>
                <h3 className="text-[18px] font-extrabold tracking-[-0.01em]">{name}</h3>
                <p className="text-[15px] leading-relaxed text-ink-muted">{desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="cara" className="border-y border-line bg-card">
          <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
            <div className="mb-8 flex max-w-2xl flex-col gap-2.5">
              <p className={eyebrow}>Cara pesan</p>
              <h2 className="text-balance text-[30px] font-extrabold leading-tight tracking-[-0.02em] md:text-[38px]">Tiga langkah, tanpa ribet</h2>
            </div>
            <ol className="grid gap-7 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex min-w-0 flex-col gap-2.5">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-laut-700 font-mono text-[15px] text-[#F7F6F3]">{i + 1}</span>
                  <h3 className="text-[19px] font-extrabold">{s.title}</h3>
                  <p className="leading-relaxed text-ink-muted">{s.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <div className="mb-8 flex max-w-2xl flex-col gap-2.5">
            <p className={eyebrow}>Tenang memesan</p>
            <h2 className="text-balance text-[30px] font-extrabold leading-tight tracking-[-0.02em] md:text-[38px]">Dibuat supaya Anda tenang</h2>
          </div>
          <div className="grid gap-3.5 md:grid-cols-3">
            {TRUST.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex min-w-0 flex-col gap-2 rounded-card border border-line bg-card p-5">
                <Icon size={22} className="text-emas-600 dark:text-emas-400" aria-hidden="true" />
                <h3 className="text-[17px] font-extrabold">{title}</h3>
                <p className="text-[15px] leading-relaxed text-ink-muted">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="mitra" className="mx-auto max-w-6xl px-5 pb-16 md:pb-20">
          <div className="overflow-hidden rounded-[22px] bg-laut-700 text-[#F7F6F3]">
            <div className="tenun-band h-2.5" />
            <div className="grid items-center gap-7 p-7 md:grid-cols-[1.2fr_0.8fr] md:p-9">
              <div className="min-w-0">
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-emas-400">Wira Mitra</p>
                <h2 className="mt-2.5 text-balance text-[26px] font-extrabold leading-tight tracking-[-0.02em] md:text-[34px]">Punya motor, warung, villa atau keahlian? Dapatkan pesanan dari Wira.</h2>
                <p className="mt-3 text-[#C9D8DB]">Daftar gratis lewat aplikasi Wira Mitra, lalu mulai menerima pesanan setelah disetujui.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {PARTNERS.map((p) => (
                    <span key={p} className="rounded-full border border-white/25 px-3 py-1.5 text-[13px] font-semibold">{p}</span>
                  ))}
                </div>
              </div>
              <a href={MITRA_URL} className={goldBtn}>Daftar jadi mitra</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line pb-safe">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-x-12 gap-y-6 px-5 py-10 text-[14px] text-ink-muted">
          <div className="flex max-w-xs flex-col gap-1.5">
            <strong className="text-[18px] tracking-[-0.02em] text-ink">wira</strong>
            <span>Aplikasi layanan harian untuk warga dan wisatawan di Lombok.</span>
            <span className="font-mono">halo@wira.one</span>
          </div>
          <nav aria-label="Informasi" className="flex flex-wrap gap-x-5 gap-y-2.5">
            <a href="/panduan" className="hover:text-ink hover:underline">Panduan</a>
            <Link to="/privacy" className="hover:text-ink hover:underline">Kebijakan privasi</Link>
            <Link to="/terms" className="hover:text-ink hover:underline">Syarat &amp; ketentuan</Link>
            <Link to="/refund" className="hover:text-ink hover:underline">Pengembalian dana</Link>
            <Link to="/hapus-akun" className="hover:text-ink hover:underline">Hapus akun</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
