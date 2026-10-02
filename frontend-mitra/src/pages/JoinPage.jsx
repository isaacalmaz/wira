import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BadgeCheck, Banknote, Bike, Building2, CalendarCheck, Camera, Car, ClipboardList, CreditCard, Image as ImageIcon,
  MapPin, Navigation, ShieldCheck, Smartphone, Star, Store, ToggleRight, Utensils, Wallet, Wrench,
} from 'lucide-react';
import { Card, IconTile, cx } from '../components/ui';
import WiraMark from '../components/brand/WiraMark';
import { supabase } from '../config/supabase';
import { loadCommissionRates, commissionRate } from '../services/orderService';

// Wira's cut per service is set by admins (commission_rates, migrations/
// 0099); texts below carry {cut:service} / {keep:service} placeholders that
// are filled with the live percentages. Materials are never cut.
const rupiah = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;

const ROLES = {
  driver: {
    key: 'driver', register: 'driver', icon: Bike, label: 'Driver', sub: 'Ojek, kurir & antar makanan',
    headline: 'Antar penumpang, paket dan makanan di sekitar Anda.',
    intro: 'Pakai motor atau mobil sendiri. Pesanan ditawarkan ke driver terdekat, tarif dihitung otomatis, dan Anda menerima {keep:ride} dari tarif.',
    benefits: [
      { icon: Navigation, title: 'Pesanan terdekat dulu', text: 'Sistem menawarkan pesanan ke driver yang paling dekat dengan titik jemput, satu per satu.' },
      { icon: Bike, title: 'Pilih layanan sendiri', text: 'WiraRide (penumpang), WiraSend (paket) dan antar WiraFood. Mobil untuk WiraRide.' },
      { icon: Banknote, title: 'Tarif jelas per kilometer', text: 'Harga dihitung otomatis dari jarak; pelanggan melihat harga sebelum memesan, tanpa tawar-menawar.' },
      { icon: ShieldCheck, title: 'Aman untuk kedua pihak', text: 'Perjalanan dimulai dengan PIN dari pelanggan; lokasi dan riwayat tercatat di aplikasi.' },
      { icon: ToggleRight, title: 'Atur jam kerja sendiri', text: 'Nyalakan Online saat siap menerima pesanan, matikan kapan saja. Tidak ada target.' },
      { icon: Wallet, title: 'Pendapatan langsung tercatat', text: 'Tiap pesanan selesai masuk ke saldo pendapatan dan bisa dicairkan dari aplikasi.' },
    ],
    needs: [
      { icon: CreditCard, text: 'SIM aktif dan STNK (difoto saat daftar)' },
      { icon: Car, text: 'Motor atau mobil yang layak jalan' },
      { icon: Smartphone, text: 'HP Android dengan GPS dan internet' },
      { icon: MapPin, text: 'Tinggal atau bekerja di Lombok' },
    ],
    steps: [
      { title: 'Daftar di aplikasi', text: 'Isi data diri dan kendaraan, pilih layanan, unggah foto SIM & STNK.' },
      { title: 'Verifikasi tim Wira', text: 'Kami periksa dokumen dan menghubungi Anda lewat WhatsApp, biasanya 1-2 hari kerja.' },
      { title: 'Nyalakan Online', text: 'Terima pesanan pertama dari layar Beranda aplikasi Wira Mitra.' },
    ],
  },
  merchant: {
    key: 'merchant', register: 'merchant', icon: Store, label: 'Restoran / Warung', sub: 'Jual makanan di WiraFood',
    headline: 'Pelanggan baru untuk dapur Anda, diantar driver Wira.',
    intro: 'Tampilkan menu dan foto makanan Anda di WiraFood. Pelanggan memesan dan membayar di aplikasi, driver Wira yang mengantar.',
    benefits: [
      { icon: Utensils, title: 'Pelanggan di sekitar Anda', text: 'Warga dan wisatawan di Lombok menemukan warung Anda lewat aplikasi Wira.' },
      { icon: ImageIcon, title: 'Kelola menu sendiri', text: 'Tambah menu, harga dan foto dari HP. Tandai menu habis atau tutup toko kapan saja.' },
      { icon: Bike, title: 'Tidak perlu kurir sendiri', text: 'Begitu pesanan siap, driver Wira terdekat datang mengambil dan mengantar.' },
      { icon: Wallet, title: 'Pembayaran aman', text: 'Pelanggan membayar lewat WiraPay atau QRIS sebelum Anda memasak.' },
      { icon: Star, title: 'Ulasan membangun nama', text: 'Rating dan ulasan pelanggan membantu warung Anda dipilih lebih sering.' },
      { icon: Banknote, title: 'Potongan jelas', text: '{cut:food} dari harga makanan. Ongkos kirim untuk driver, tidak dipotong dari bagian Anda.' },
    ],
    needs: [
      { icon: Store, text: 'Nama usaha dan alamat dapur/warung' },
      { icon: Camera, text: 'Foto makanan untuk menu' },
      { icon: Smartphone, text: 'HP untuk menerima dan memproses pesanan' },
      { icon: MapPin, text: 'Berlokasi di Lombok' },
    ],
    steps: [
      { title: 'Daftar di aplikasi', text: 'Isi data diri, nama usaha dan alamat. Sekitar 3 menit.' },
      { title: 'Verifikasi tim Wira', text: 'Kami menghubungi Anda lewat WhatsApp dan membantu menyiapkan menu.' },
      { title: 'Buka toko', text: 'Unggah menu dan foto, lalu terima pesanan pertama dari aplikasi Wira Mitra.' },
    ],
  },
  villa: {
    key: 'villa', register: 'villa', icon: Building2, label: 'Villa / Penginapan', sub: 'Sewakan di WiraVilla',
    headline: 'Isi kamar kosong Anda dengan tamu dari aplikasi Wira.',
    intro: 'Daftarkan villa, homestay atau penginapan Anda di WiraVilla. Tamu memesan dan membayar di muka lewat aplikasi.',
    benefits: [
      { icon: Building2, title: 'Tamu lokal dan wisatawan', text: 'Penginapan Anda tampil bagi pengguna Wira yang mencari tempat menginap di Lombok.' },
      { icon: ImageIcon, title: 'Kelola listing sendiri', text: 'Atur foto, deskripsi dan harga per malam dari aplikasi Wira Mitra.' },
      { icon: Wallet, title: 'Dibayar di muka', text: 'Tamu membayar lewat WiraPay atau QRIS saat memesan; Anda tinggal menyiapkan kamar.' },
      { icon: CalendarCheck, title: 'Terima atau tolak pesanan', text: 'Setiap pesanan masuk ke aplikasi untuk Anda konfirmasi.' },
      { icon: Star, title: 'Ulasan tamu', text: 'Ulasan yang baik membuat penginapan Anda lebih dipercaya.' },
      { icon: Banknote, title: 'Potongan jelas', text: '{cut:villa} dari nilai sewa. Tidak ada biaya pendaftaran atau biaya bulanan.' },
    ],
    needs: [
      { icon: Building2, text: 'Nama penginapan dan alamat lengkap' },
      { icon: Camera, text: 'Foto kamar, kamar mandi dan area umum' },
      { icon: Smartphone, text: 'HP untuk menerima pesanan tamu' },
      { icon: MapPin, text: 'Berlokasi di Lombok' },
    ],
    steps: [
      { title: 'Daftar di aplikasi', text: 'Isi data diri, nama penginapan dan alamat.' },
      { title: 'Verifikasi tim Wira', text: 'Kami menghubungi Anda lewat WhatsApp untuk memastikan listing siap tampil.' },
      { title: 'Terima tamu', text: 'Lengkapi foto dan harga, lalu kelola pesanan dari aplikasi Wira Mitra.' },
    ],
  },
  technician: {
    key: 'technician', register: 'technician', icon: Wrench, label: 'Teknisi & Jasa', sub: 'AC, listrik, pipa, kolam, renovasi',
    headline: 'Pekerjaan datang ke Anda. Bayaran aman lewat Wira.',
    intro: 'Servis AC, listrik, pipa, kolam renang, sampai proyek terazzo dan renovasi villa. Pilih keahlian dan wilayah Anda sendiri.',
    benefits: [
      { icon: CalendarCheck, title: 'Pekerjaan sesuai keahlian', text: 'Pesanan sesuai keahlian dan wilayah Anda muncul di aplikasi, lengkap dengan jadwal dan rincian.' },
      { icon: Banknote, title: 'Harga jelas', text: 'Daftar harga per pekerjaan sudah tetap. Bahan diajukan terpisah dan disetujui pelanggan di aplikasi.' },
      { icon: Wallet, title: 'Uang bahan 100% untuk Anda', text: 'Pelanggan membayar lewat WiraPay; bahan dan suku cadang tidak dipotong sama sekali.' },
      { icon: ClipboardList, title: 'Proyek lewat penawaran', text: 'Renovasi, terazzo, cat villa: kirim penawaran sendiri, dibayar bertahap (DP + termin) dengan potongan {cut:project}.' },
      { icon: Star, title: 'Reputasi yang terlihat', text: 'Ulasan, portofolio foto dan badge Terverifikasi membuat Anda dipilih lebih dulu.' },
      { icon: ShieldCheck, title: 'Tetap dibayar bila batal di lokasi', text: 'Pelanggan batal setelah Anda datang dan mengecek? Anda tetap mendapat biaya cek.' },
    ],
    needs: [
      { icon: CreditCard, text: 'KTP untuk difoto, dan selfie sambil memegang KTP' },
      { icon: Wrench, text: 'Keahlian dan alat kerja sendiri' },
      { icon: Smartphone, text: 'HP dengan internet dan WhatsApp aktif' },
      { icon: MapPin, text: 'Tinggal atau bekerja di Lombok' },
    ],
    steps: [
      { title: 'Daftar di aplikasi', text: 'Isi data diri, pilih keahlian, lampirkan foto KTP dan selfie. Sekitar 5 menit.' },
      { title: 'Verifikasi tim Wira', text: 'Kami periksa identitas dan menghubungi Anda lewat WhatsApp, biasanya 1-2 hari kerja.' },
      { title: 'Mulai terima pekerjaan', text: 'Lengkapi profil dan portofolio, lalu ambil pekerjaan dari menu Pekerjaan.' },
    ],
  },
};
const ORDER = ['driver', 'merchant', 'villa', 'technician'];
// Service whose commission applies to a role's example earnings.
const ROLE_SERVICE = { driver: 'ride', merchant: 'food', villa: 'villa', technician: 'service' };
// Short words for shareable links: /gabung?jenis=teknisi
const ALIAS = { driver: 'driver', restoran: 'merchant', merchant: 'merchant', villa: 'villa', teknisi: 'technician', technician: 'technician' };
const SLUG = { driver: 'driver', merchant: 'restoran', villa: 'villa', technician: 'teknisi' };

const FAQ = [
  { q: 'Apakah ada biaya pendaftaran?', a: 'Tidak ada. Pendaftaran gratis, tanpa biaya bulanan. Wira hanya mengambil potongan dari pesanan yang selesai.' },
  { q: 'Kapan pendapatan bisa dicairkan?', a: 'Pendapatan masuk ke saldo mitra begitu pesanan selesai dan bisa ditarik ke rekening atau e-wallet dari menu Pendapatan.' },
  { q: 'Bagaimana dengan pesanan bayar tunai?', a: 'Anda menerima uangnya langsung dari pelanggan; potongan Wira dicatat dan diperhitungkan dengan pendapatan Anda berikutnya.' },
  { q: 'Bisakah saya mendaftar untuk lebih dari satu jenis?', a: 'Bisa. Misalnya driver yang juga punya warung: daftar satu per satu, lalu pindah peran dari aplikasi yang sama.' },
  { q: 'Apakah data dan dokumen saya aman?', a: 'Foto SIM, STNK, KTP dan selfie hanya dilihat tim Wira untuk verifikasi. Nomor HP Anda tidak ditampilkan ke pelanggan.' },
  { q: 'Wilayah mana saja?', a: 'Seluruh Lombok: Mataram, Lombok Barat, Senggigi, Lombok Utara, Gili, Lombok Tengah, Kuta Mandalika dan Lombok Timur.' },
];

/**
 * Public join page for every kind of partner (mitra.wira.one/gabung):
 * driver, restaurant, villa and technician tabs, each with benefits,
 * example earnings from the live tariffs, requirements and steps, and a
 * sign-up button that opens registration with that role selected.
 * ?jenis=driver|restoran|villa|teknisi opens a tab directly.
 */
export default function JoinPage() {
  const [params, setParams] = useSearchParams();
  const active = ALIAS[params.get('jenis')] || 'driver';
  const role = ROLES[active];
  const [tariffs, setTariffs] = useState({ vehicles: [], send: [], food: null, service: [] });
  const [skills, setSkills] = useState([]);
  const [, setRatesLoaded] = useState(false);
  useEffect(() => { loadCommissionRates(supabase).then(() => setRatesLoaded(true)); }, []);
  const pct = (rate) => `${(Math.round(rate * 10000) / 100).toLocaleString('id-ID')}%`;
  const fill = (text) => text
    .replace(/\{cut:(\w+)\}/g, (_, k) => pct(commissionRate(k)))
    .replace(/\{keep:(\w+)\}/g, (_, k) => pct(1 - commissionRate(k)));

  useEffect(() => {
    Promise.all([
      supabase.from('vehicles').select('type, name, price, per_km_rate').eq('service_type', 'ride').eq('is_active', true),
      supabase.from('pricing_rules').select('service_type, code, name, base_price, per_km_rate, item_of, sort_order').eq('is_active', true),
      supabase.from('service_skills').select('code, name, skill_group').eq('is_active', true).order('sort_order'),
    ]).then(([v, p, s]) => {
      const rules = p.data || [];
      setTariffs({
        vehicles: v.data || [],
        send: rules.filter((r) => r.service_type === 'send').sort((a, b) => a.base_price - b.base_price),
        food: rules.find((r) => r.service_type === 'food_delivery' && r.code === 'default') || null,
        service: rules.filter((r) => r.service_type === 'service' && r.item_of).sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100)),
      });
      setSkills(s.data || []);
    });
  }, []);

  // Example earnings per role, from the live tariffs.
  const examples = useMemo(() => {
    if (active === 'driver') {
      const ride = (type, km) => {
        const v = tariffs.vehicles.find((x) => x.type === type);
        return v ? Number(v.price) + Math.ceil(Math.max(0, km - 2) * Number(v.per_km_rate)) : null;
      };
      const rows = [];
      const motor = ride('motor', 5);
      const mobil = ride('mobil', 5);
      if (motor) rows.push({ label: 'WiraRide motor, 5 km', price: motor, svc: 'ride' });
      if (mobil) rows.push({ label: 'WiraRide mobil, 5 km', price: mobil, svc: 'ride' });
      const parcel = tariffs.send.find((r) => r.code === 'kecil') || tariffs.send[0];
      if (parcel) rows.push({ label: `WiraSend ${parcel.name.toLowerCase()}`, price: parcel.base_price, svc: 'send' });
      if (tariffs.food) rows.push({ label: 'Antar WiraFood, 3 km', price: Number(tariffs.food.base_price) + 3 * Number(tariffs.food.per_km_rate), svc: 'food' });
      return rows;
    }
    if (active === 'merchant') {
      return [
        { label: 'Pesanan 2 porsi', price: 50000 },
        { label: 'Pesanan keluarga', price: 100000 },
        { label: 'Pesanan acara / kantor', price: 250000 },
      ];
    }
    if (active === 'villa') {
      return [
        { label: 'Homestay, 1 malam', price: 350000 },
        { label: 'Villa 1 kamar, 1 malam', price: 750000 },
        { label: 'Villa kolam pribadi, 1 malam', price: 1500000 },
      ];
    }
    return tariffs.service.slice(0, 6).map((r) => ({ label: r.name, price: r.base_price }));
  }, [active, tariffs]);

  const pick = (key) => setParams({ jenis: SLUG[key] }, { replace: true });
  const cta = 'inline-flex min-h-12 items-center justify-center rounded-control bg-brand px-6 text-[15px] font-bold text-white shadow-[0_12px_30px_-14px_rgba(6,47,60,0.6)] transition-colors hover:bg-brand-hover';
  const RoleIcon = role.icon;

  return (
    <div className="min-h-[100dvh] bg-ground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link to="/gabung" className="flex items-center gap-2" aria-label="Wira Mitra">
          <WiraMark size={32} />
          <span className="text-[18px] font-extrabold tracking-tight text-ink">wira <span className="font-medium text-ink-muted">mitra</span></span>
        </Link>
        <Link to="/login" className="inline-flex min-h-11 items-center px-3 text-[14px] font-semibold text-brand-ink">Masuk</Link>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-20">
        <section className="flex flex-col items-start gap-3 pt-2 md:pt-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-[12px] font-semibold text-brand-ink">
            <BadgeCheck size={13} aria-hidden="true" /> Gratis daftar · Seluruh Lombok
          </span>
          <h1 className="text-balance text-[32px] font-extrabold leading-[1.1] tracking-tight text-ink md:text-[42px]">Gabung jadi Mitra Wira</h1>
          <p className="max-w-2xl text-[16px] leading-relaxed text-ink-muted">
            Aplikasi layanan lokal Lombok: perjalanan, kiriman, makanan, penginapan dan jasa rumah. Pilih cara Anda ingin bergabung.
          </p>
        </section>

        {/* Role picker */}
        <section aria-label="Jenis mitra" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {ORDER.map((key) => {
            const r = ROLES[key];
            const Icon = r.icon;
            const on = key === active;
            return (
              <button
                key={key}
                type="button"
                onClick={() => pick(key)}
                aria-pressed={on}
                className={cx(
                  'flex min-h-[88px] flex-col items-start gap-1.5 rounded-card border bg-card p-3.5 text-left transition-colors',
                  on ? 'border-2 border-brand p-[13px] shadow-[0_10px_30px_-18px_rgba(6,47,60,0.55)]' : 'border-line hover:border-line-strong',
                )}
              >
                <Icon size={20} className={on ? 'text-brand-ink' : 'text-ink-muted'} aria-hidden="true" />
                <span className="text-[14px] font-bold leading-tight text-ink">{r.label}</span>
                <span className="text-[12px] leading-snug text-ink-muted">{r.sub}</span>
              </button>
            );
          })}
        </section>

        {/* Selected role */}
        <section className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
          <div className="flex flex-1 flex-col items-start gap-4">
            <IconTile tone="brand"><RoleIcon size={20} /></IconTile>
            <h2 className="text-balance text-[26px] font-extrabold leading-tight tracking-tight text-ink">{role.headline}</h2>
            <p className="max-w-xl text-[15px] leading-relaxed text-ink-muted">{fill(role.intro)}</p>
            <Link to={`/register?role=${role.register}`} className={cta}>Daftar sebagai {role.label}</Link>
          </div>
          {examples.length > 0 && (
            <Card className="w-full md:max-w-sm">
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Contoh penghasilan</p>
              <ul className="flex flex-col divide-y divide-line">
                {examples.map((e) => (
                  <li key={e.label} className="flex items-baseline justify-between gap-3 py-2.5 text-[14px]">
                    <span className="min-w-0 text-ink">{e.label}</span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono font-medium text-ink">{rupiah(Number(e.price) * (1 - commissionRate(e.svc || ROLE_SERVICE[active])))}</span>
                      <span className="block text-[11.5px] text-ink-muted">dari {rupiah(e.price)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
                {active === 'driver' && fill('Yang Anda terima setelah potongan Wira. Tarif mengikuti jarak dan bisa berubah.')}
                {active === 'merchant' && fill('Bagian Anda dari harga makanan setelah potongan {cut:food}. Ongkos kirim untuk driver.')}
                {active === 'villa' && fill('Bagian Anda dari nilai sewa setelah potongan {cut:villa}.')}
                {active === 'technician' && fill('Yang Anda terima per pekerjaan setelah potongan {cut:service}. Bahan dibayar terpisah, tanpa potongan; proyek dipotong {cut:project}.')}
              </p>
            </Card>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[22px] font-extrabold tracking-tight text-ink">Keuntungan untuk {role.label}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {role.benefits.map(({ icon: Icon, title, text }) => (
              <Card key={title} className="flex flex-col gap-2.5">
                <IconTile tone="brand" size="sm"><Icon size={18} /></IconTile>
                <h3 className="text-[15px] font-bold text-ink">{title}</h3>
                <p className="text-[13.5px] leading-relaxed text-ink-muted">{fill(text)}</p>
              </Card>
            ))}
          </div>
        </section>

        {active === 'technician' && skills.length > 0 && (
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

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <h2 className="text-[19px] font-extrabold tracking-tight text-ink">Cara bergabung</h2>
            <ol className="flex flex-col gap-4">
              {role.steps.map((s, i) => (
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
              {role.needs.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-2.5"><Icon size={18} className="mt-0.5 shrink-0 text-brand-ink" aria-hidden="true" /> {text}</li>
              ))}
            </ul>
            <p className="mt-1 flex items-start gap-2 rounded-control bg-sunken px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
              <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              Dokumen hanya dilihat tim Wira untuk verifikasi, tidak pernah ditampilkan ke pelanggan.
            </p>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[22px] font-extrabold tracking-tight text-ink">Pertanyaan yang sering diajukan</h2>
          <div className="flex flex-col gap-2">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-card border border-line bg-card px-4 py-3">
                <summary className="cursor-pointer list-none text-[14.5px] font-semibold text-ink">
                  <span className="flex items-center justify-between gap-3">{f.q}<span className="text-ink-muted transition-transform group-open:rotate-45" aria-hidden="true">+</span></span>
                </summary>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-center gap-4 rounded-card border border-brand-line bg-brand-soft/50 px-5 py-8 text-center">
          <BadgeCheck size={28} className="text-brand-ink" aria-hidden="true" />
          <h2 className="text-balance text-[22px] font-extrabold tracking-tight text-ink">Siap bergabung sebagai {role.label}?</h2>
          <p className="max-w-md text-[14px] leading-relaxed text-ink-muted">Pendaftaran gratis dan hanya beberapa menit. Tim kami menghubungi Anda setelah verifikasi.</p>
          <Link to={`/register?role=${role.register}`} className={cta}>Daftar sebagai {role.label}</Link>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px]">
            {ORDER.filter((k) => k !== active).map((k) => (
              <button key={k} type="button" onClick={() => { pick(k); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="min-h-11 font-semibold text-brand-ink underline-offset-4 hover:underline">
                Lihat {ROLES[k].label}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
