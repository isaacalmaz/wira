import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Home,
  Truck,
  Clock,
  Check,
  ChevronRight,
  ArrowLeft,
  QrCode,
  CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Card,
  Badge,
  Button,
  Input,
  Sheet,
  Segmented,
  Money,
  Spinner,
  Field
} from '../components/ui';
import AddressMapPicker from '../components/common/AddressMapPicker';

export default function BersihPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('services'); // 'services' | 'history'
  const [submitting, setSubmitting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Active form view ('none' | 'subscribe' | 'housekeeping' | 'quote')
  const [activeForm, setActiveForm] = useState('none');

  // Form 1: Langganan Sampah Villa
  const [subProperty, setSubProperty] = useState('');
  const [subCoords, setSubCoords] = useState(null);
  const [subAddress, setSubAddress] = useState('');
  const [subType, setSubType] = useState('villa');
  const [subFrequency, setSubFrequency] = useState('3x');
  const [subDays, setSubDays] = useState(['Sunday', 'Tuesday', 'Friday']);

  // Form 2: Housekeeping Villa
  const [hkProperty, setHkProperty] = useState('');
  const [hkCoords, setHkCoords] = useState(null);
  const [hkAddress, setHkAddress] = useState('');
  const [hkType, setHkType] = useState('turnover');
  const [hkBedrooms, setHkBedrooms] = useState(2);
  const [hkDate, setHkDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [hkTime, setHkTime] = useState('11:00');
  const [hkNotes, setHkNotes] = useState('');

  // Form 3: Borongan
  const [quoteCoords, setQuoteCoords] = useState(null);
  const [quoteAddress, setQuoteAddress] = useState('');
  const [quoteDate, setQuoteDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [quoteNotes, setQuoteNotes] = useState('');

  // Tab 2: User History (Invoices & Pickups)
  const [mySubscriptions, setMySubscriptions] = useState([]);
  const [myInvoices, setMyInvoices] = useState([]);
  const [myPickups, setMyPickups] = useState([]);
  const [qrisModalInvoice, setQrisModalInvoice] = useState(null);

  const loadUserHistory = useCallback(async () => {
    if (!user?.id) return;
    setLoadingHistory(true);
    try {
      const [subsRes, invRes] = await Promise.all([
        supabase
          .from('waste_subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('waste_invoices')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
      ]);

      const subs = subsRes.data || [];
      setMySubscriptions(subs);
      setMyInvoices(invRes.data || []);

      if (subs.length > 0) {
        const subIds = subs.map(s => s.id);
        const { data: pData } = await supabase
          .from('waste_pickups')
          .select('*')
          .in('subscription_id', subIds)
          .order('pickup_date', { ascending: false })
          .limit(10);
        setMyPickups(pData || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadUserHistory();
    }
  }, [activeTab, loadUserHistory]);

  // Submission Handlers
  const handleSubscribeSubmit = async (e) => {
    e.preventDefault();
    if (!subProperty.trim()) {
      toast.error('Masukkan nama vila / properti Anda');
      return;
    }
    if (!subAddress.trim()) {
      toast.error('Tentukan titik peta dan alamat lengkap');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('waste_subscriptions').insert({
        user_id: user?.id || null,
        property_name: subProperty,
        property_type: subType,
        address: subAddress,
        lat: subCoords?.lat || null,
        lng: subCoords?.lng || null,
        frequency: subFrequency,
        pickup_days: subDays,
        status: 'pending',
      });

      if (error) throw error;
      toast.success('Pendaftaran langganan berhasil dikirim!');
      setActiveForm('none');
      setActiveTab('history');
      loadUserHistory();
    } catch (err) {
      toast.error('Gagal mendaftar: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleHousekeepingSubmit = async (e) => {
    e.preventDefault();
    if (!hkProperty.trim()) {
      toast.error('Masukkan nama vila');
      return;
    }
    if (!hkAddress.trim()) {
      toast.error('Tentukan alamat penugasan');
      return;
    }

    setSubmitting(true);
    try {
      const orderNo = `HK-${new Date().toISOString().substring(2, 7).replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const { error } = await supabase.from('housekeeping_orders').insert({
        order_no: orderNo,
        user_id: user?.id || null,
        property_name: hkProperty,
        service_type: hkType,
        bedrooms: hkBedrooms,
        scheduled_date: hkDate,
        scheduled_time: hkTime,
        address: hkAddress,
        lat: hkCoords?.lat || null,
        lng: hkCoords?.lng || null,
        notes: hkNotes,
        status: 'pending',
      });

      if (error) throw error;
      toast.success('Pesanan housekeeping berhasil dibuat!');
      setActiveForm('none');
      setActiveTab('history');
      loadUserHistory();
    } catch (err) {
      toast.error('Gagal memesan: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuoteSubmit = async (e) => {
    e.preventDefault();
    if (!quoteAddress.trim()) {
      toast.error('Tentukan alamat penjemputan borongan');
      return;
    }

    setSubmitting(true);
    try {
      const quoteNo = `BR-${new Date().toISOString().substring(2, 7).replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const { error } = await supabase.from('waste_quotes').insert({
        quote_no: quoteNo,
        user_id: user?.id || null,
        address: quoteAddress,
        lat: quoteCoords?.lat || null,
        lng: quoteCoords?.lng || null,
        requested_date: quoteDate,
        notes: quoteNotes,
        status: 'pending',
      });

      if (error) throw error;
      toast.success('Permohonan borongan terkirim! Admin akan segera menghubungi Anda.');
      setActiveForm('none');
      setActiveTab('history');
      loadUserHistory();
    } catch (err) {
      toast.error('Gagal mengajukan: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg min-h-screen pb-24 text-ink">
      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-ground/90 backdrop-blur-md border-b border-line px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (activeForm !== 'none' ? setActiveForm('none') : navigate('/'))}
            className="flex h-10 w-10 items-center justify-center rounded-control bg-card text-ink border border-line hover:bg-sunken transition"
            aria-label="Kembali"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-[17px] font-bold text-ink leading-none">Wira Bersih</h1>
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand-ink">
                by Sampun Bersih
              </span>
            </div>
            <p className="text-[11.5px] text-ink-muted">Kebersihan Villa & Angkut Sampah Kuta Lombok</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Navigation Tabs */}
        {activeForm === 'none' && (
          <Segmented
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'services', label: 'Pilihan Layanan' },
              { value: 'history', label: 'Tagihan & Riwayat' },
            ]}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 1: KATALOG LAYANAN                                         */}
        {/* ============================================================== */}
        {activeTab === 'services' && activeForm === 'none' && (
          <div className="space-y-3">
            {/* Banner Info Kuta */}
            <div className="p-3.5 rounded-card bg-brand-soft border border-brand-line flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sparkles size={18} className="text-brand-ink shrink-0" />
                <div>
                  <span className="text-[13px] font-bold text-brand-ink block">Operasional Sampun Bersih</span>
                  <span className="text-[11px] text-ink-muted">Rute rutin: Minggu, Selasa, Jumat • Wilayah Kuta Lombok</span>
                </div>
              </div>
            </div>

            {/* Service 1: Sampah Rutin Villa */}
            <Card
              className="cursor-pointer hover:border-brand transition"
              onClick={() => setActiveForm('subscribe')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-ink">
                    <Home size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-bold text-ink">Sampah Rutin Villa</h3>
                      <Badge tone="brand">Sampun Bersih</Badge>
                    </div>
                    <p className="text-[12px] text-ink-muted mt-1">
                      Pengangkutan rutin terjadwal untuk villa, homestay, atau bisnis Anda.
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] font-semibold text-brand-ink">
                      <Clock size={12} />
                      <span>Rute: Min, Sel, Jum (1x, 2x, atau 3x seminggu)</span>
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-ink-muted shrink-0 mt-1" />
              </div>
            </Card>

            {/* Service 2: Housekeeping Villa */}
            <Card
              className="cursor-pointer hover:border-brand transition"
              onClick={() => setActiveForm('housekeeping')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-pay-soft text-pay-ink">
                    <Sparkles size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-bold text-ink">Housekeeping Villa</h3>
                      <Badge tone="warning">Mitra Terverifikasi</Badge>
                    </div>
                    <p className="text-[12px] text-ink-muted mt-1">
                      Turnover tamu (check-out/in), ganti linen/sprei, sanitasi toilet, dan deep clean.
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] font-semibold text-ink-muted">
                      <CheckCircle2 size={12} className="text-success" />
                      <span>Standar kebersihan perhotelan villa</span>
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-ink-muted shrink-0 mt-1" />
              </div>
            </Card>

            {/* Service 3: Angkut Borongan */}
            <Card
              className="cursor-pointer hover:border-brand transition"
              onClick={() => setActiveForm('quote')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-sunken text-ink">
                    <Truck size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-bold text-ink">Angkut Borongan</h3>
                      <Badge tone="neutral">Sekali Angkut</Badge>
                    </div>
                    <p className="text-[12px] text-ink-muted mt-1">
                      Pembersihan sisa pangkas kebun, renovasi, atau sampah hajatan villa.
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] font-semibold text-ink-muted">
                      <Truck size={12} />
                      <span>Armada Tossa & Truk Pickup</span>
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-ink-muted shrink-0 mt-1" />
              </div>
            </Card>
          </div>
        )}

        {/* ============================================================== */}
        {/* FORM 1: DAFTAR LANGGANAN SAMPAH VILLA                          */}
        {/* ============================================================== */}
        {activeForm === 'subscribe' && (
          <form onSubmit={handleSubscribeSubmit} className="space-y-4">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-[15px] font-bold text-ink">Form Langganan Sampun Bersih</h2>
              <button
                type="button"
                onClick={() => setActiveForm('none')}
                className="text-[12px] font-semibold text-ink-muted hover:text-ink"
              >
                Tutup
              </button>
            </div>

            <Field label="Nama Villa / Bisnis" required>
              <Input
                placeholder="Contoh: Villa Asri Kuta"
                value={subProperty}
                onChange={e => setSubProperty(e.target.value)}
              />
            </Field>

            {/* Titik Koordinat Peta (DI ATAS ALAMAT LENGKAP) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-semibold text-ink">Titik Koordinat Peta</label>
                <span className="text-[11px] font-semibold text-brand-ink">GPS Gerbang Masuk</span>
              </div>
              <AddressMapPicker
                id="sub-map"
                placeholder="Cari lokasi villa di Kuta Lombok..."
                address={subAddress}
                onAddressChange={setSubAddress}
                coords={subCoords}
                onCoordsChange={setSubCoords}
                pinLabel="Titik Gerbang"
              />
            </div>

            {/* Tipe Properti */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-ink">Tipe Properti</label>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                {[
                  { id: 'villa', label: 'Villa (1–3 Kamar)' },
                  { id: 'villa_complex', label: 'Villa Kompleks' },
                  { id: 'homestay', label: 'Homestay' },
                  { id: 'restaurant', label: 'Resto / Cafe' },
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSubType(item.id)}
                    className={`min-h-11 p-2 rounded-control border text-center font-medium transition ${subType === item.id ? 'border-brand bg-brand-soft text-brand-ink font-bold' : 'border-line bg-card text-ink hover:border-brand'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pilihan Frekuensi (1x, 2x, 3x) */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-ink">Frekuensi Angkut (Rute: Min, Sel, Jum)</label>
              <div className="space-y-2">
                {[
                  {
                    id: '3x',
                    label: '3x Seminggu',
                    days: 'Minggu, Selasa & Jumat',
                    daysArr: ['Sunday', 'Tuesday', 'Friday'],
                    desc: 'Semua hari operasional armada',
                  },
                  {
                    id: '2x',
                    label: '2x Seminggu',
                    days: 'Selasa & Jumat',
                    daysArr: ['Tuesday', 'Friday'],
                    desc: 'Pilihan 2 hari rutin',
                  },
                  {
                    id: '1x',
                    label: '1x Seminggu',
                    days: 'Jumat',
                    daysArr: ['Friday'],
                    desc: 'Pilihan 1 hari rutin',
                  },
                ].map(f => (
                  <div
                    key={f.id}
                    onClick={() => {
                      setSubFrequency(f.id);
                      setSubDays(f.daysArr);
                    }}
                    className={`p-3 rounded-card border cursor-pointer transition flex items-center justify-between ${subFrequency === f.id ? 'border-2 border-brand bg-brand-soft/20' : 'border-line bg-card hover:border-brand'}`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-ink">{f.label}</span>
                        <span className="text-[11.5px] font-semibold text-brand-ink">({f.days})</span>
                      </div>
                      <span className="text-[11px] text-ink-muted block mt-0.5">{f.desc}</span>
                    </div>
                    {subFrequency === f.id && <Check size={16} className="text-brand-ink" />}
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11.5px] text-ink-muted text-center leading-snug">
              Tarif bulanan resmi dikonfirmasi sebelum penagihan invoice pertama.
            </p>

            <Button
              type="submit"
              variant="primary"
              className="w-full min-h-11 font-bold"
              disabled={submitting}
            >
              {submitting ? 'Mengirim Pendaftaran...' : 'Ajukan Langganan Rutin'}
            </Button>
          </form>
        )}

        {/* ============================================================== */}
        {/* FORM 2: HOUSEKEEPING VILLA                                     */}
        {/* ============================================================== */}
        {activeForm === 'housekeeping' && (
          <form onSubmit={handleHousekeepingSubmit} className="space-y-4">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-[15px] font-bold text-ink">Pesan Housekeeping Villa</h2>
              <button
                type="button"
                onClick={() => setActiveForm('none')}
                className="text-[12px] font-semibold text-ink-muted hover:text-ink"
              >
                Tutup
              </button>
            </div>

            <Field label="Nama Villa" required>
              <Input
                placeholder="Contoh: Villa Kuta Sunset"
                value={hkProperty}
                onChange={e => setHkProperty(e.target.value)}
              />
            </Field>

            {/* Titik Peta & Alamat */}
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-ink">Lokasi Villa & Alamat</label>
              <AddressMapPicker
                id="hk-map"
                placeholder="Cari lokasi villa..."
                address={hkAddress}
                onAddressChange={setHkAddress}
                coords={hkCoords}
                onCoordsChange={setHkCoords}
                pinLabel="Titik Villa"
              />
            </div>

            {/* Tipe Pembersihan */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-ink">Tipe Pembersihan</label>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <button
                  type="button"
                  onClick={() => setHkType('turnover')}
                  className={`min-h-11 p-2 rounded-control border text-center transition ${hkType === 'turnover' ? 'border-brand bg-brand-soft text-brand-ink font-bold' : 'border-line bg-card text-ink'}`}
                >
                  Turnover (Check-Out)
                </button>
                <button
                  type="button"
                  onClick={() => setHkType('deep_clean')}
                  className={`min-h-11 p-2 rounded-control border text-center transition ${hkType === 'deep_clean' ? 'border-brand bg-brand-soft text-brand-ink font-bold' : 'border-line bg-card text-ink'}`}
                >
                  Deep Cleaning
                </button>
              </div>
            </div>

            {/* Jumlah Kamar Tidur */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-ink">Jumlah Kamar Tidur</label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setHkBedrooms(num)}
                    className={`min-h-11 rounded-control border font-bold text-[13px] transition ${hkBedrooms === num ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line bg-card text-ink'}`}
                  >
                    {num === 4 ? '4+ Kamar' : `${num} Kamar`}
                  </button>
                ))}
              </div>
            </div>

            {/* Tanggal & Jam */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tanggal Kedatangan">
                <input
                  type="date"
                  value={hkDate}
                  onChange={e => setHkDate(e.target.value)}
                  className="w-full text-[13px] px-3 py-2 rounded-control border border-line bg-card text-ink font-mono"
                />
              </Field>
              <Field label="Jam Kedatangan">
                <input
                  type="time"
                  value={hkTime}
                  onChange={e => setHkTime(e.target.value)}
                  className="w-full text-[13px] px-3 py-2 rounded-control border border-line bg-card text-ink font-mono"
                />
              </Field>
            </div>

            <Field label="Catatan Tambahan (Opsional)">
              <Input
                placeholder="Misal: kunci ada di lockbox kode 1234, linen di lemari"
                value={hkNotes}
                onChange={e => setHkNotes(e.target.value)}
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              className="w-full min-h-11 font-bold"
              disabled={submitting}
            >
              {submitting ? 'Memproses...' : 'Pesan Housekeeping'}
            </Button>
          </form>
        )}

        {/* ============================================================== */}
        {/* FORM 3: ANGKUT BORONGAN                                        */}
        {/* ============================================================== */}
        {activeForm === 'quote' && (
          <form onSubmit={handleQuoteSubmit} className="space-y-4">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-[15px] font-bold text-ink">Pengajuan Angkut Borongan</h2>
              <button
                type="button"
                onClick={() => setActiveForm('none')}
                className="text-[12px] font-semibold text-ink-muted hover:text-ink"
              >
                Tutup
              </button>
            </div>

            {/* Titik Peta & Alamat */}
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-ink">Titik Penjemputan & Alamat</label>
              <AddressMapPicker
                id="quote-map"
                placeholder="Cari lokasi penjemputan sampah..."
                address={quoteAddress}
                onAddressChange={setQuoteAddress}
                coords={quoteCoords}
                onCoordsChange={setQuoteCoords}
                pinLabel="Titik Tumpukan"
              />
            </div>

            <Field label="Rencana Tanggal Penjemputan">
              <input
                type="date"
                value={quoteDate}
                onChange={e => setQuoteDate(e.target.value)}
                className="w-full text-[13px] px-3 py-2 rounded-control border border-line bg-card text-ink font-mono"
              />
            </Field>

            <Field label="Catatan Tumpukan Sampah">
              <Input
                placeholder="Misal: tebang pohon kelapa 3 karung, butuh tossa"
                value={quoteNotes}
                onChange={e => setQuoteNotes(e.target.value)}
              />
            </Field>

            <p className="text-[11.5px] text-ink-muted text-center leading-snug">
              Admin akan mengirim penawaran harga resmi via notifikasi dan WhatsApp.
            </p>

            <Button
              type="submit"
              variant="primary"
              className="w-full min-h-11 font-bold"
              disabled={submitting}
            >
              {submitting ? 'Mengirim...' : 'Minta Penawaran Harga'}
            </Button>
          </form>
        )}

        {/* ============================================================== */}
        {/* TAB 2: TAGIHAN & RIWAYAT                                       */}
        {/* ============================================================== */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {loadingHistory ? (
              <div className="py-12 flex justify-center"><Spinner size={28} /></div>
            ) : (
              <>
                {/* Active Subscriptions Section */}
                {mySubscriptions.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-[13.5px] font-bold text-ink">Langganan Properti Saya</h3>
                    {mySubscriptions.map(s => (
                      <Card key={s.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[14px] font-bold text-ink">{s.property_name}</h4>
                          <Badge tone={s.status === 'active' ? 'success' : 'neutral'}>{s.status}</Badge>
                        </div>
                        <p className="text-[12px] text-ink-muted truncate">{s.address}</p>
                        <div className="flex items-center justify-between text-[11.5px] pt-1 border-t border-line">
                          <span className="font-semibold text-brand-ink">{s.frequency} Seminggu (Min, Sel, Jum)</span>
                          {s.monthly_price > 0 && <Money amount={s.monthly_price} className="font-bold text-ink" />}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Active Invoices Section */}
                <div className="space-y-2">
                  <h3 className="text-[13.5px] font-bold text-ink">Tagihan Langganan</h3>
                  {myInvoices.length === 0 ? (
                    <Card className="text-center py-6">
                      <p className="text-[12px] text-ink-muted">Belum ada tagihan aktif untuk akun Anda.</p>
                    </Card>
                  ) : (
                    myInvoices.map(inv => (
                      <Card key={inv.id} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[11px] font-mono text-ink-muted block">{inv.invoice_no}</span>
                            <h4 className="text-[14px] font-bold text-ink">{inv.client_name}</h4>
                          </div>
                          {inv.status === 'paid' && <Badge tone="success">Lunas</Badge>}
                          {inv.status === 'collected_by_driver' && (
                            <Badge tone="warning">Diterima Driver</Badge>
                          )}
                          {inv.status === 'pending' && <Badge tone="neutral">Menunggu Pembayaran</Badge>}
                        </div>

                        <div className="p-3 bg-sunken rounded-control flex items-center justify-between">
                          <div>
                            <span className="text-[11px] text-ink-muted block">Bulan {inv.month}</span>
                            <Money amount={inv.amount} className="text-[17px] font-mono font-extrabold text-ink" />
                          </div>
                          {inv.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => setQrisModalInvoice(inv)}
                                icon={<QrCode size={14} />}
                              >
                                Bayar QRIS
                              </Button>
                            </div>
                          )}
                        </div>

                        {inv.status === 'collected_by_driver' && (
                          <p className="text-[11.5px] text-warning-ink bg-warning-soft p-2 rounded-control">
                            Pembayaran tunai telah diserahkan ke driver lapangan dan sedang dalam proses verifikasi kasir.
                          </p>
                        )}
                      </Card>
                    ))
                  )}
                </div>

                {/* Pickup Logs Checklist Feed */}
                <div className="space-y-2 pt-2">
                  <h3 className="text-[13.5px] font-bold text-ink">Riwayat Pengangkutan Terakhir</h3>
                  {myPickups.length === 0 ? (
                    <Card className="text-center py-6">
                      <p className="text-[12px] text-ink-muted">Belum ada riwayat pengangkutan tercatat.</p>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {myPickups.map(p => (
                        <div
                          key={p.id}
                          className="p-3 rounded-card bg-card border border-line flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`h-7 w-7 rounded-full flex items-center justify-center ${p.completed ? 'bg-success-soft text-success-ink' : 'bg-warning-soft text-warning-ink'}`}>
                              <Check size={14} />
                            </div>
                            <div>
                              <span className="text-[12.5px] font-bold text-ink block">
                                {p.completed ? 'Sudah Diangkut' : 'Jadwal Hari Ini'}
                              </span>
                              <span className="text-[11px] text-ink-muted">
                                {p.pickup_date} {p.completed_at ? `• ${new Date(p.completed_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''}
                              </span>
                            </div>
                          </div>
                          <span className="text-[11px] text-ink-muted font-mono">Armada Tossa</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* MODAL SHEET: QRIS Payment */}
      <Sheet
        open={Boolean(qrisModalInvoice)}
        onClose={() => setQrisModalInvoice(null)}
        title="Pembayaran QRIS Dinamis"
      >
        {qrisModalInvoice && (
          <div className="space-y-4 text-center">
            <p className="text-[12px] text-ink-muted">
              Wira Bersih • {qrisModalInvoice.invoice_no} ({qrisModalInvoice.client_name})
            </p>

            {/* QR Code Container */}
            <div className="p-6 bg-white rounded-card border border-line flex flex-col items-center justify-center gap-3">
              <svg width="180" height="180" viewBox="0 0 100 100" className="text-black">
                <rect width="100" height="100" fill="white" />
                <rect x="5" y="5" width="30" height="30" fill="black" rx="3" />
                <rect x="9" y="9" width="22" height="22" fill="white" rx="2" />
                <rect x="13" y="13" width="14" height="14" fill="black" rx="1" />
                <rect x="65" y="5" width="30" height="30" fill="black" rx="3" />
                <rect x="69" y="9" width="22" height="22" fill="white" rx="2" />
                <rect x="73" y="13" width="14" height="14" fill="black" rx="1" />
                <rect x="5" y="65" width="30" height="30" fill="black" rx="3" />
                <rect x="9" y="69" width="22" height="22" fill="white" rx="2" />
                <rect x="13" y="73" width="14" height="14" fill="black" rx="1" />
                <rect x="42" y="10" width="16" height="6" fill="black" />
                <rect x="42" y="24" width="8" height="14" fill="black" />
                <rect x="10" y="42" width="14" height="8" fill="black" />
                <rect x="30" y="42" width="40" height="16" fill="black" />
                <rect x="76" y="42" width="14" height="10" fill="black" />
                <rect x="42" y="66" width="10" height="24" fill="black" />
                <rect x="60" y="66" width="30" height="8" fill="black" />
                <rect x="66" y="80" width="24" height="10" fill="black" />
              </svg>
              <div>
                <span className="text-[12px] text-gray-500 block">Total Pembayaran:</span>
                <Money amount={qrisModalInvoice.amount} className="font-mono text-[22px] font-extrabold text-black" />
              </div>
            </div>

            <p className="text-[12px] text-ink-muted">
              Pindai QRIS ini dengan GoPay, OVO, Dana, BCA Mobile, Livin', atau aplikasi mobile banking apa pun.
            </p>

            <Button
              variant="outline"
              className="w-full min-h-11"
              onClick={() => setQrisModalInvoice(null)}
            >
              Selesai & Tutup
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
