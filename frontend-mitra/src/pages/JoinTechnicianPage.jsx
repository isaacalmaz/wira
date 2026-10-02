import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck, Banknote, CalendarCheck, ClipboardList, CreditCard, MapPin, ShieldCheck, Smartphone, Star, Wallet, Wrench,
} from 'lucide-react';
import { Card, IconTile, cx } from '../components/ui';
import WiraMark from '../components/brand/WiraMark';
import { supabase } from '../config/supabase';

const BENEFITS = [
  { icon: CalendarCheck, title: 'Pekerjaan datang ke Anda', text: 'Pesanan servis sesuai keahlian dan wilayah Anda muncul di aplikasi, lengkap dengan jadwal, alamat dan rincian pekerjaan.' },
  { icon: Banknote, title: 'Harga jelas, tanpa tawar-menawar', text: 'Daftar harga per pekerjaan sudah tetap. Bahan dan suku cadang diajukan terpisah dan disetujui pelanggan di aplikasi.' },
  { icon: Wallet, title: 'Bayaran aman', text: 'Pelanggan membayar lewat WiraPay sebelum Anda berangkat. Uang bahan 100% untuk Anda, tanpa potongan.' },
  { icon: ClipboardList, title: 'Proyek besar lewat penawaran', text: 'Renovasi, terazzo, cat villa: kirim penawaran sendiri, dibayar bertahap (DP + termin) yang ditahan Wira sampai pelanggan setuju.' },
  { icon: Star, title: 'Reputasi yang terlihat', text: 'Ulasan pelanggan, portofolio foto dan badge Terverifikasi membuat Anda dipilih lebih dulu.' },
  { icon: Smartphone, title: 'Atur waktu sendiri', text: 'Nyalakan atau matikan penerimaan pekerjaan kapan saja. Tidak ada target, tidak ada biaya pendaftaran.' },
];

const STEPS = [
  { title: 'Daftar di aplikasi', text: 'Isi data diri, pilih keahlian, lampirkan foto KTP dan selfie. Sekitar 5 menit.' },
  { title: 'Verifikasi oleh tim Wira', text: 'Kami periksa identitas dan menghubungi Anda lewat WhatsApp, biasanya 1-2 hari kerja.' },
  { title: 'Mulai terima pekerjaan', text: 'Lengkapi profil dan portofolio, lalu ambil pekerjaan dari menu Pekerjaan.' },
];

const FAQ = [
  { q: 'Berapa potongan Wira?', a: 'Servis harian 20% dari biaya jasa; proyek 10%. Uang bahan dan suku cadang tidak dipotong sama sekali.' },
  { q: 'Kapan uang saya bisa dicairkan?', a: 'Pendapatan masuk ke saldo mitra begitu pekerjaan selesai dan bisa ditarik ke rekening atau e-wallet dari menu Pendapatan.' },
  { q: 'Bagaimana kalau pelanggan batal setelah saya datang?', a: 'Dengan PIN pelanggan, kunjungan diselesaikan sebagai pengecekan dan Anda tetap mendapat biaya cek.' },
  { q: 'Apakah harus punya alat sendiri?', a: 'Ya, gunakan alat kerja Anda sendiri. Bahan bisa diajukan sebagai biaya tambahan sesuai harga aslinya.' },
  { q: 'Wilayah mana saja?', a: 'Seluruh Lombok: Mataram, Lombok Barat, Senggigi, Lombok Utara, Gili, Lombok Tengah, Kuta Mandalika dan Lombok Timur. Anda memilih wilayah sendiri.' },
];

/**
 * Public recruitment page for technicians (mitra.wira.one/gabung): what
 * they get, what they need, how it works, example earnings, and a sign-up
 * button that opens registration with "Teknisi & Jasa" selected.
 */
export default function JoinTechnicianPage() {
  const [skills, setSkills] = useState([]);
  const [prices, setPrices] = useState([]);

  useEffect(() => {
    supabase.from('service_skills').select('code, name, skill_group').eq('is_active', true).order('sort_order')
      .then(({ data }) => setSkills(data || []));
    supabase.from('pricing_rules').select('code, name, base_price, unit_label, item_of, sort_order')
      .eq('service_type', 'service').eq('is_active', true).not('item_of', 'is', null).order('sort_order')
      .then(({ data }) => setPrices((data || []).slice(0, 6)));
  }, []);

  const rupiah = (n) => `Rp ${Math.round(Number(n)).toLocaleString('id-ID')}`;
  const cta = 'inline-flex min-h-12 items-center justify-center rounded-control bg-brand px-6 text-[15px] font-bold text-white shadow-[0_12px_30px_-14px_rgba(6,47,60,0.6)] transition-colors hover:bg-brand-hover';

  return (
    <div className="min-h-[100dvh] bg-ground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link to="/gabung" className="flex items-center gap-2" aria-label="Wira Mitra">
          <WiraMark size={32} />
          <span className="text-[18px] font-extrabold tracking-tight text-ink">wira <span className="font-medium text-ink-muted">mitra</span></span>
        </Link>
        <Link to="/login" className="inline-flex min-h-11 items-center px-3 text-[14px] font-semibold text-brand-ink">Masuk</Link>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 pb-20">
        {/* Hero */}
        <section className="flex flex-col gap-5 pt-4 md:flex-row md:items-center md:gap-10 md:pt-10">
          <div className="flex flex-1 flex-col items-start gap-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-[12px] font-semibold text-brand-ink">
              <Wrench size={13} aria-hidden="true" /> Teknisi & tukang di Lombok
            </span>
            <h1 className="text-balance text-[32px] font-extrabold leading-[1.1] tracking-tight text-ink md:text-[44px]">
              Pekerjaan datang ke Anda. Bayaran aman lewat Wira.
            </h1>
            <p className="max-w-xl text-[16px] leading-relaxed text-ink-muted">
              Jadi mitra teknisi Wira: servis AC, listrik, pipa, kolam renang, sampai proyek terazzo dan renovasi villa.
              Gratis daftar, atur waktu sendiri.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/register?role=technician" className={cta}>Daftar Jadi Teknisi</Link>
              <a href="#cara-kerja" className="inline-flex min-h-12 items-center px-3 text-[14px] font-semibold text-ink underline-offset-4 hover:underline">Lihat cara kerjanya</a>
            </div>
          </div>
          {prices.length > 0 && (
            <Card className="w-full max-w-sm self-center md:self-auto">
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Contoh penghasilan servis</p>
              <ul className="flex flex-col divide-y divide-line">
                {prices.map((p) => (
                  <li key={p.code} className="flex items-baseline justify-between gap-3 py-2.5 text-[14px]">
                    <span className="min-w-0 text-ink">{p.name}</span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono font-medium text-ink">{rupiah(Number(p.base_price) * 0.8)}</span>
                      <span className="block text-[11.5px] text-ink-muted">dari harga {rupiah(p.base_price)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">Yang Anda terima per pekerjaan setelah potongan 20%. Bahan dibayar terpisah, tanpa potongan.</p>
            </Card>
          )}
        </section>

        {/* Benefits */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[22px] font-extrabold tracking-tight text-ink">Kenapa bergabung</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <Card key={title} className="flex flex-col gap-2.5">
                <IconTile tone="brand" size="sm"><Icon size={18} /></IconTile>
                <h3 className="text-[15px] font-bold text-ink">{title}</h3>
                <p className="text-[13.5px] leading-relaxed text-ink-muted">{text}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Skills */}
        {skills.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-[22px] font-extrabold tracking-tight text-ink">Keahlian yang kami cari</h2>
            {[['servis', 'Servis harian (harga tetap)'], ['proyek', 'Proyek & renovasi (lewat penawaran)']].map(([g, label]) => (
              <div key={g} className="flex flex-col gap-2">
                <p className="text-[13px] font-semibold text-ink-muted">{label}</p>
                <div className="flex flex-wrap gap-2">
                  {skills.filter((s) => s.skill_group === g).map((s) => (
                    <span key={s.code} className={cx('rounded-full border px-3.5 py-1.5 text-[13px] font-semibold', g === 'servis' ? 'border-brand-line bg-brand-soft text-brand-ink' : 'border-line bg-card text-ink')}>{s.name}</span>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* How it works + requirements */}
        <section id="cara-kerja" className="grid scroll-mt-6 grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <h2 className="text-[19px] font-extrabold tracking-tight text-ink">Cara bergabung</h2>
            <ol className="flex flex-col gap-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand font-mono text-[14px] font-medium text-white">{i + 1}</span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[14.5px] font-bold text-ink">{s.title}</span>
                    <span className="text-[13.5px] leading-relaxed text-ink-muted">{s.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="text-[19px] font-extrabold tracking-tight text-ink">Yang perlu disiapkan</h2>
            <ul className="flex flex-col gap-2.5 text-[14px] text-ink">
              <li className="flex items-start gap-2.5"><CreditCard size={18} className="mt-0.5 shrink-0 text-brand-ink" aria-hidden="true" /> KTP asli untuk difoto, dan selfie sambil memegang KTP</li>
              <li className="flex items-start gap-2.5"><Smartphone size={18} className="mt-0.5 shrink-0 text-brand-ink" aria-hidden="true" /> HP dengan internet dan WhatsApp aktif</li>
              <li className="flex items-start gap-2.5"><Wrench size={18} className="mt-0.5 shrink-0 text-brand-ink" aria-hidden="true" /> Keahlian dan alat kerja sendiri</li>
              <li className="flex items-start gap-2.5"><MapPin size={18} className="mt-0.5 shrink-0 text-brand-ink" aria-hidden="true" /> Tinggal atau bekerja di Lombok</li>
            </ul>
            <p className="mt-1 flex items-start gap-2 rounded-control bg-sunken px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
              <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              Foto KTP dan selfie hanya dilihat tim Wira untuk verifikasi, tidak pernah ditampilkan ke pelanggan. Nomor HP Anda juga tidak dibagikan.
            </p>
          </Card>
        </section>

        {/* FAQ */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[22px] font-extrabold tracking-tight text-ink">Pertanyaan yang sering diajukan</h2>
          <div className="flex flex-col gap-2">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-card border border-line bg-card px-4 py-3">
                <summary className="cursor-pointer list-none text-[14.5px] font-semibold text-ink marker:hidden">
                  <span className="flex items-center justify-between gap-3">{f.q}<span className="text-ink-muted transition-transform group-open:rotate-45" aria-hidden="true">+</span></span>
                </summary>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="flex flex-col items-center gap-4 rounded-card border border-brand-line bg-brand-soft/50 px-5 py-8 text-center">
          <BadgeCheck size={28} className="text-brand-ink" aria-hidden="true" />
          <h2 className="text-balance text-[22px] font-extrabold tracking-tight text-ink">Siap terima pekerjaan pertama Anda?</h2>
          <p className="max-w-md text-[14px] leading-relaxed text-ink-muted">Pendaftaran gratis dan hanya sekitar 5 menit. Tim kami menghubungi Anda setelah verifikasi.</p>
          <Link to="/register?role=technician" className={cta}>Daftar Jadi Teknisi</Link>
        </section>
      </main>
    </div>
  );
}
