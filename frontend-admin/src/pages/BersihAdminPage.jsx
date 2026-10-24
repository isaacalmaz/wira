import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  RefreshCw,
  Search,
  Check,
  Building2,
  AlertCircle,
  Truck,
  Coins,
  Send,
  Home
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Input,
  Table,
  Sheet,
  Segmented,
  Money,
  EmptyState,
  Spinner,
  Field,
  Select,
  Textarea
} from '../components/ui';
import {
  fetchSubscriptions,
  updateSubscription,
  fetchDailyPickups,
  togglePickupStatus,
  fetchInvoices,
  generateMonthlyInvoices,
  verifyCashSettlement,
  fetchHousekeepingOrders,
  updateHousekeepingOrder,
  fetchWasteQuotes,
  respondWasteQuote
} from '../services/bersihAdminService';

const BersihAdminPage = () => {
  const [activeTab, setActiveTab] = useState('applications');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Tab 1: Subscriptions
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);
  const [subTariff, setSubTariff] = useState('');
  const [subNotes, setSubNotes] = useState('');
  const [subBusy, setSubBusy] = useState(false);

  // Tab 2: Rute Filter
  const [dayFilter, setDayFilter] = useState('all');

  // Tab 3: Daily Pickups
  const [pickupDate, setPickupDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [pickups, setPickups] = useState([]);

  // Tab 4: Invoices & Cash Settlement
  const [invoices, setInvoices] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().substring(0, 7));
  const [invStatusFilter, setInvStatusFilter] = useState('all');
  const [verifyingInvoice, setVerifyingInvoice] = useState(null);
  const [cashierNote, setCashierNote] = useState('');
  const [genBusy, setGenBusy] = useState(false);

  // Tab 5: Housekeeping & Borongan
  const [hkOrders, setHkOrders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [subTabHk, setSubTabHk] = useState('housekeeping');
  const [selectedHk, setSelectedHk] = useState(null);
  const [hkAssignName, setHkAssignName] = useState('');
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [quotePrice, setQuotePrice] = useState('');
  const [quoteVehicle, setQuoteVehicle] = useState('tossa');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'applications' || activeTab === 'routes') {
        const data = await fetchSubscriptions();
        setSubscriptions(data);
      } else if (activeTab === 'pickups') {
        const data = await fetchDailyPickups(pickupDate);
        setPickups(data);
      } else if (activeTab === 'invoices') {
        const data = await fetchInvoices(invStatusFilter, selectedMonth);
        setInvoices(data);
      } else if (activeTab === 'housekeeping') {
        const [hk, q] = await Promise.all([
          fetchHousekeepingOrders(),
          fetchWasteQuotes()
        ]);
        setHkOrders(hk);
        setQuotes(q);
      }
    } catch (err) {
      toast.error('Gagal memuat data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab, pickupDate, selectedMonth, invStatusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tab 1 Actions: Approve / Set Tariff
  const handleOpenApproveSheet = (sub) => {
    setSelectedSub(sub);
    setSubTariff(sub.monthly_price ? String(sub.monthly_price) : '400000');
    setSubNotes(sub.notes || '');
  };

  const handleSaveSubscription = async (newStatus) => {
    if (!selectedSub) return;
    setSubBusy(true);
    try {
      await updateSubscription(selectedSub.id, {
        status: newStatus,
        monthly_price: Number(subTariff) || 0,
        notes: subNotes,
      });
      toast.success(newStatus === 'active' ? 'Langganan berhasil diaktifkan!' : 'Status langganan diperbarui');
      setSelectedSub(null);
      loadData();
    } catch (err) {
      toast.error('Gagal menyimpan: ' + err.message);
    } finally {
      setSubBusy(false);
    }
  };

  // Tab 3 Actions: Pickup Status
  const handleTogglePickup = async (pickup) => {
    try {
      await togglePickupStatus(pickup.id, !pickup.completed);
      setPickups(prev =>
        prev.map(p => (p.id === pickup.id ? { ...p, completed: !p.completed, completed_at: !p.completed ? new Date().toISOString() : null } : p))
      );
      toast.success(pickup.completed ? 'Status diubah ke Belum Diangkut' : 'Status diubah ke Selesai Diangkut');
    } catch (err) {
      toast.error('Gagal update status: ' + err.message);
    }
  };

  // Tab 4 Actions: Generate Invoices & Verify Cash
  const handleGenerateInvoices = async () => {
    setGenBusy(true);
    try {
      const count = await generateMonthlyInvoices(selectedMonth);
      toast.success(`${count} invoice bulan ${selectedMonth} berhasil diterbitkan!`);
      loadData();
    } catch (err) {
      toast.error('Gagal menerbitkan invoice: ' + err.message);
    } finally {
      setGenBusy(false);
    }
  };

  const handleVerifyCash = async () => {
    if (!verifyingInvoice) return;
    try {
      await verifyCashSettlement(verifyingInvoice.id, cashierNote);
      toast.success(`Setoran kas tunai ${verifyingInvoice.invoice_no} diverifikasi Lunas!`);
      setVerifyingInvoice(null);
      setCashierNote('');
      loadData();
    } catch (err) {
      toast.error('Gagal verifikasi setoran: ' + err.message);
    }
  };

  // Tab 5 Actions: Housekeeping & Quotes
  const handleSaveHkAssign = async () => {
    if (!selectedHk) return;
    try {
      await updateHousekeepingOrder(selectedHk.id, {
        status: 'assigned',
        assigned_to: hkAssignName,
      });
      toast.success('Pembersih berhasil ditugaskan!');
      setSelectedHk(null);
      loadData();
    } catch (err) {
      toast.error('Gagal menugaskan: ' + err.message);
    }
  };

  const handleSaveQuote = async () => {
    if (!selectedQuote) return;
    try {
      await respondWasteQuote(selectedQuote.id, {
        quoted_price: quotePrice,
        vehicle_type: quoteVehicle,
      });
      toast.success('Penawaran harga resmi berhasil dikirim ke pelanggan!');
      setSelectedQuote(null);
      loadData();
    } catch (err) {
      toast.error('Gagal mengirim penawaran: ' + err.message);
    }
  };

  // Filtered views
  const pendingSubs = subscriptions.filter(s => s.status === 'pending');
  const activeSubs = subscriptions.filter(s => {
    if (s.status !== 'active') return false;
    if (dayFilter === 'all') return true;
    return (s.pickup_days || []).includes(dayFilter);
  });

  const pendingCashCount = invoices.filter(i => i.status === 'collected_by_driver').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wira Bersih"
        subtitle="Operasional Sampun Bersih — Pengangkutan Sampah Villa & Housekeeping Kuta Lombok"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
          >
            Segarkan
          </Button>
        }
      />

      {/* Segmented Navigation */}
      <Segmented
        value={activeTab}
        onChange={setActiveTab}
        options={[
          {
            value: 'applications',
            label: (
              <span className="flex items-center gap-2">
                <span>Pengajuan Baru</span>
                {pendingSubs.length > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning-soft px-1.5 text-[11px] font-bold text-warning-ink">
                    {pendingSubs.length}
                  </span>
                )}
              </span>
            ),
          },
          { value: 'routes', label: 'Klien & Titik Rute' },
          { value: 'pickups', label: 'Monitor Pickup' },
          {
            value: 'invoices',
            label: (
              <span className="flex items-center gap-2">
                <span>Tagihan & Kas</span>
                {pendingCashCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-soft px-1.5 text-[11px] font-bold text-danger-ink">
                    {pendingCashCount} Setoran
                  </span>
                )}
              </span>
            ),
          },
          { value: 'housekeeping', label: 'Housekeeping & Borongan' },
        ]}
      />

      {/* TAB 1: PENGAJUAN BARU */}
      {activeTab === 'applications' && (
        <Card noPadding>
          <div className="p-4 border-b border-line flex items-center justify-between">
            <div>
              <h3 className="font-bold text-[15px] text-ink">Pengajuan Langganan Baru</h3>
              <p className="text-[12.5px] text-ink-muted">Villa atau properti yang baru mendaftar dari aplikasi pelanggan.</p>
            </div>
            <div className="w-64">
              <Input
                placeholder="Cari properti..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                leftIcon={<Search size={15} />}
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center"><Spinner size={28} /></div>
          ) : pendingSubs.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Tidak ada pengajuan baru"
              description="Semua vila yang mendaftar telah ditinjau dan diaktifkan rutenya."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Nama Properti</th>
                  <th>Tipe & Frekuensi</th>
                  <th>Titik Koordinat & Alamat</th>
                  <th>Kontak</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pendingSubs
                  .filter(s => s.property_name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(sub => (
                    <tr key={sub.id}>
                      <td>
                        <span className="font-bold text-ink block">{sub.property_name}</span>
                        <span className="text-[11px] text-ink-muted">{new Date(sub.created_at).toLocaleDateString('id-ID')}</span>
                      </td>
                      <td>
                        <Badge tone="brand">{sub.property_type}</Badge>
                        <span className="text-[12px] font-medium text-ink block mt-0.5">{sub.frequency} Seminggu</span>
                      </td>
                      <td className="max-w-xs">
                        <div className="flex items-center gap-1 text-[11px] font-mono text-brand-ink">
                          <MapPin size={12} />
                          <span>{sub.lat ? `${sub.lat.toFixed(6)}, ${sub.lng.toFixed(6)}` : 'Belum ada GPS'}</span>
                        </div>
                        <p className="text-[12px] text-ink truncate mt-0.5">{sub.address}</p>
                      </td>
                      <td>
                        <span className="text-[12.5px] font-medium text-ink block">{sub.contact_name || sub.user?.name || '-'}</span>
                        <span className="text-[11.5px] text-ink-muted block">{sub.contact_phone || sub.user?.phone || '-'}</span>
                      </td>
                      <td className="text-right">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleOpenApproveSheet(sub)}
                        >
                          Tinjau & Tetapkan Tarif
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {/* TAB 2: KLIEN & TITIK RUTE */}
      {activeTab === 'routes' && (
        <Card noPadding>
          <div className="p-4 border-b border-line flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-semibold text-ink-muted">Filter Hari Rute:</span>
              <button
                type="button"
                onClick={() => setDayFilter('all')}
                className={`px-3 py-1.5 text-[12px] font-bold rounded-control transition ${dayFilter === 'all' ? 'bg-brand text-white' : 'bg-sunken text-ink hover:bg-line'}`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setDayFilter('Sunday')}
                className={`px-3 py-1.5 text-[12px] font-bold rounded-control transition ${dayFilter === 'Sunday' ? 'bg-brand text-white' : 'bg-sunken text-ink hover:bg-line'}`}
              >
                Minggu
              </button>
              <button
                type="button"
                onClick={() => setDayFilter('Tuesday')}
                className={`px-3 py-1.5 text-[12px] font-bold rounded-control transition ${dayFilter === 'Tuesday' ? 'bg-brand text-white' : 'bg-sunken text-ink hover:bg-line'}`}
              >
                Selasa
              </button>
              <button
                type="button"
                onClick={() => setDayFilter('Friday')}
                className={`px-3 py-1.5 text-[12px] font-bold rounded-control transition ${dayFilter === 'Friday' ? 'bg-brand text-white' : 'bg-sunken text-ink hover:bg-line'}`}
              >
                Jumat
              </button>
            </div>

            <div className="w-64">
              <Input
                placeholder="Cari klien aktif..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                leftIcon={<Search size={15} />}
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center"><Spinner size={28} /></div>
          ) : activeSubs.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Belum ada klien aktif"
              description="Klien yang telah disetujui akan muncul pada jadwal rute di sini."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Vila / Properti</th>
                  <th>Jadwal Rute</th>
                  <th>Titik GPS Gerbang & Alamat</th>
                  <th>Tarif Bulanan</th>
                  <th>Status</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {activeSubs
                  .filter(s => s.property_name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(sub => (
                    <tr key={sub.id}>
                      <td>
                        <span className="font-bold text-ink block">{sub.property_name}</span>
                        <span className="text-[11px] text-ink-muted">{sub.contact_name || sub.contact_phone || '-'}</span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {(sub.pickup_days || []).map(day => (
                            <span key={day} className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-brand-soft text-brand-ink">
                              {day === 'Sunday' ? 'Min' : day === 'Tuesday' ? 'Sel' : day === 'Friday' ? 'Jum' : day}
                            </span>
                          ))}
                        </div>
                        <span className="text-[11px] text-ink-muted block mt-1">{sub.frequency} seminggu</span>
                      </td>
                      <td className="max-w-xs">
                        <div className="flex items-center gap-1 text-[11px] font-mono text-brand-ink">
                          <MapPin size={12} />
                          <span>{sub.lat ? `${sub.lat.toFixed(6)}, ${sub.lng.toFixed(6)}` : '-'}</span>
                        </div>
                        <p className="text-[12px] text-ink truncate mt-0.5">{sub.address}</p>
                      </td>
                      <td>
                        <Money amount={sub.monthly_price} className="font-bold text-[13px] text-ink" />
                        <span className="text-[11px] text-ink-muted block capitalize">{sub.billing_timing}</span>
                      </td>
                      <td>
                        <Badge tone={sub.status === 'active' ? 'success' : 'neutral'}>{sub.status}</Badge>
                      </td>
                      <td className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenApproveSheet(sub)}
                        >
                          Ubah
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {/* TAB 3: MONITOR PICKUP HARIAN */}
      {activeTab === 'pickups' && (
        <Card noPadding>
          <div className="p-4 border-b border-line flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-[12.5px] font-bold text-ink flex items-center gap-1.5">
                <Calendar size={15} />
                <span>Tanggal Pickup:</span>
              </label>
              <input
                type="date"
                value={pickupDate}
                onChange={e => setPickupDate(e.target.value)}
                className="px-3 py-1.5 rounded-control border border-line bg-card text-ink font-mono text-[13px]"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="text-[13px] font-semibold text-ink">
                Progress: <span className="font-bold text-brand-ink">{pickups.filter(p => p.completed).length}</span> / {pickups.length} Selesai
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center"><Spinner size={28} /></div>
          ) : pickups.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="Tidak ada rute penjemputan di tanggal ini"
              description="Jadwal rutin Sampun Bersih beroperasi setiap hari Minggu, Selasa, dan Jumat."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Properti & Alamat</th>
                  <th>Armada / Driver</th>
                  <th>Waktu Selesai</th>
                  <th className="text-right">Aksi Manual</th>
                </tr>
              </thead>
              <tbody>
                {pickups.map(p => (
                  <tr key={p.id}>
                    <td>
                      {p.completed ? (
                        <Badge tone="success">
                          <Check size={11} className="mr-1" />
                          Sudah Diangkut
                        </Badge>
                      ) : (
                        <Badge tone="warning">
                          <Clock size={11} className="mr-1" />
                          Belum Diangkut
                        </Badge>
                      )}
                    </td>
                    <td>
                      <span className="font-bold text-ink block">{p.subscription?.property_name || 'Vila'}</span>
                      <span className="text-[12px] text-ink-muted block truncate max-w-sm">{p.subscription?.address}</span>
                    </td>
                    <td>
                      <span className="text-[12.5px] font-medium text-ink">{p.driver_name || 'Armada Tossa 01'}</span>
                    </td>
                    <td>
                      <span className="text-[12px] font-mono text-ink">
                        {p.completed_at ? new Date(p.completed_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </span>
                    </td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        variant={p.completed ? 'outline' : 'primary'}
                        onClick={() => handleTogglePickup(p)}
                      >
                        {p.completed ? 'Batalkan Ceklis' : 'Tandai Selesai'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {/* TAB 4: TAGIHAN & SETORAN KAS */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {/* Top Control: Auto Generator & Month selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-card rounded-card border border-line">
            <div className="flex items-center gap-3">
              <label className="text-[12.5px] font-bold text-ink">Bulan Tagihan:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 rounded-control border border-line bg-card text-ink font-mono text-[13px]"
              />
              <Select
                value={invStatusFilter}
                onChange={e => setInvStatusFilter(e.target.value)}
                className="text-[12.5px]"
              >
                <option value="all">Semua Status</option>
                <option value="pending">Menunggu Pembayaran</option>
                <option value="collected_by_driver">Diterima Driver (Perlu Verifikasi Kasir)</option>
                <option value="paid">Lunas</option>
              </Select>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerateInvoices}
              disabled={genBusy}
              icon={<Coins size={14} />}
            >
              {genBusy ? 'Menerbitkan...' : `Terbitkan Tagihan Bulan ${selectedMonth}`}
            </Button>
          </div>

          {/* Pending Cash Verification Alert Banner */}
          {pendingCashCount > 0 && (
            <div className="p-4 rounded-card border border-danger-line bg-danger-soft flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-danger shrink-0 mt-0.5" size={18} />
                <div>
                  <h4 className="font-bold text-[13.5px] text-danger-ink">
                    Ada {pendingCashCount} Setoran Kas Tunai Menunggu Verifikasi Kasir
                  </h4>
                  <p className="text-[12px] text-danger-ink">
                    Driver telah mencatat penerimaan uang tunai langsung dari penjaga vila di lapangan. Segera verifikasi saat uang fisik disetor ke kantor.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Invoices Table */}
          <Card noPadding>
            {loading ? (
              <div className="py-12 flex justify-center"><Spinner size={28} /></div>
            ) : invoices.length === 0 ? (
              <EmptyState
                icon={Coins}
                title="Tidak ada tagihan ditemukan"
                description={`Klik tombol "Terbitkan Tagihan Bulan ${selectedMonth}" untuk meng-generate invoice untuk semua klien aktif.`}
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>No. Invoice</th>
                    <th>Nama Klien / Vila</th>
                    <th>Bulan</th>
                    <th>Jumlah</th>
                    <th>Status</th>
                    <th>Metode Bayar</th>
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td>
                        <span className="font-mono font-bold text-ink text-[12.5px]">{inv.invoice_no}</span>
                        <span className="text-[11px] text-ink-muted block">{inv.due_date ? `Jatuh tempo: ${inv.due_date}` : ''}</span>
                      </td>
                      <td>
                        <span className="font-bold text-ink block">{inv.client_name}</span>
                        <span className="text-[11px] text-ink-muted block truncate max-w-xs">{inv.subscription?.address || ''}</span>
                      </td>
                      <td>
                        <span className="font-mono text-[12px] text-ink">{inv.month}</span>
                      </td>
                      <td>
                        <Money amount={inv.amount} className="font-bold text-[13px] text-ink" />
                      </td>
                      <td>
                        {inv.status === 'paid' && <Badge tone="success">Lunas</Badge>}
                        {inv.status === 'collected_by_driver' && (
                          <Badge tone="warning">
                            <Clock size={11} className="mr-1" />
                            Diterima Driver
                          </Badge>
                        )}
                        {inv.status === 'pending' && <Badge tone="neutral">Menunggu</Badge>}
                      </td>
                      <td>
                        <span className="text-[12px] capitalize font-medium text-ink">
                          {inv.payment_method === 'cash' ? 'Tunai Lapangan' : inv.payment_method === 'qris' ? 'QRIS' : inv.payment_method === 'bank_transfer' ? 'Transfer Bank' : '-'}
                        </span>
                        {inv.collected_by_driver_name && (
                          <span className="text-[10.5px] text-ink-muted block">via {inv.collected_by_driver_name}</span>
                        )}
                      </td>
                      <td className="text-right">
                        {inv.status === 'collected_by_driver' ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              setVerifyingInvoice(inv);
                              setCashierNote('');
                            }}
                          >
                            Verifikasi Kas
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const wa = inv.user?.phone;
                              if (wa) {
                                window.open(`https://wa.me/${wa.replace(/[^0-9]/g, '')}?text=Halo%20${encodeURIComponent(inv.client_name)},%20berikut%20tagihan%20Wira%20Bersih%20bulan%20${inv.month}%20sebesar%20Rp%20${Number(inv.amount).toLocaleString('id-ID')}.%20Terima%20kasih!`, '_blank');
                              } else {
                                toast.error('Nomor WhatsApp pelanggan tidak tersedia');
                              }
                            }}
                            icon={<Send size={13} />}
                          >
                            Kirim WA
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* TAB 5: HOUSEKEEPING & BORONGAN */}
      {activeTab === 'housekeeping' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSubTabHk('housekeeping')}
              className={`px-4 py-2 text-[13px] font-bold rounded-control transition ${subTabHk === 'housekeeping' ? 'bg-brand text-white' : 'bg-sunken text-ink hover:bg-line'}`}
            >
              Housekeeping Villa ({hkOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTabHk('quotes')}
              className={`px-4 py-2 text-[13px] font-bold rounded-control transition ${subTabHk === 'quotes' ? 'bg-brand text-white' : 'bg-sunken text-ink hover:bg-line'}`}
            >
              Angkut Borongan ({quotes.length})
            </button>
          </div>

          {subTabHk === 'housekeeping' ? (
            <Card noPadding>
              {loading ? (
                <div className="py-12 flex justify-center"><Spinner size={28} /></div>
              ) : hkOrders.length === 0 ? (
                <EmptyState
                  icon={Home}
                  title="Belum ada pesanan housekeeping"
                  description="Pesanan turnover tamu atau deep cleaning villa akan muncul di sini."
                />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>No. Order & Properti</th>
                      <th>Tipe & Kamar</th>
                      <th>Jadwal Kedatangan</th>
                      <th>Pembersih Ditugaskan</th>
                      <th>Status</th>
                      <th className="text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hkOrders.map(hk => (
                      <tr key={hk.id}>
                        <td>
                          <span className="font-bold text-ink block">{hk.property_name}</span>
                          <span className="font-mono text-[11px] text-ink-muted">{hk.order_no}</span>
                        </td>
                        <td>
                          <Badge tone="brand">
                            {hk.service_type === 'turnover' ? 'Turnover Tamu' : 'Deep Cleaning'}
                          </Badge>
                          <span className="text-[12px] font-medium text-ink block mt-0.5">{hk.bedrooms} Kamar Tidur</span>
                        </td>
                        <td>
                          <span className="font-mono text-[12.5px] text-ink font-semibold">{hk.scheduled_date}</span>
                          <span className="text-[11.5px] text-ink-muted block">{hk.scheduled_time} WITA</span>
                        </td>
                        <td>
                          <span className="text-[12.5px] font-bold text-ink block">{hk.assigned_to || 'Belum ditugaskan'}</span>
                          <span className="text-[11px] text-ink-muted block capitalize">{hk.assigned_type} Team</span>
                        </td>
                        <td>
                          <Badge tone={hk.status === 'completed' ? 'success' : hk.status === 'assigned' ? 'brand' : 'warning'}>
                            {hk.status}
                          </Badge>
                        </td>
                        <td className="text-right">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              setSelectedHk(hk);
                              setHkAssignName(hk.assigned_to || '');
                            }}
                          >
                            Tugaskan Tim
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          ) : (
            <Card noPadding>
              {loading ? (
                <div className="py-12 flex justify-center"><Spinner size={28} /></div>
              ) : quotes.length === 0 ? (
                <EmptyState
                  icon={Truck}
                  title="Belum ada permohonan borongan"
                  description="Permintaan angkut sampah kebun/proyek dengan foto tumpukan akan muncul di sini."
                />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>No. Pengajuan</th>
                      <th>Lokasi & Kontak</th>
                      <th>Rencana Tanggal</th>
                      <th>Foto Tumpukan</th>
                      <th>Status & Penawaran</th>
                      <th className="text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map(q => (
                      <tr key={q.id}>
                        <td>
                          <span className="font-mono font-bold text-ink text-[12.5px]">{q.quote_no}</span>
                          <span className="text-[11px] text-ink-muted block">{q.notes || 'Tanpa catatan'}</span>
                        </td>
                        <td>
                          <p className="text-[12.5px] text-ink truncate max-w-xs">{q.address}</p>
                          <span className="text-[11px] text-ink-muted">{q.contact_name || q.contact_phone || '-'}</span>
                        </td>
                        <td>
                          <span className="font-mono text-[12.5px] text-ink">{q.requested_date}</span>
                        </td>
                        <td>
                          {q.photo_url ? (
                            <a href={q.photo_url} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-brand-ink underline">
                              Lihat Foto
                            </a>
                          ) : (
                            <span className="text-[12px] text-ink-muted">Tidak ada foto</span>
                          )}
                        </td>
                        <td>
                          {q.status === 'pending' && <Badge tone="warning">Menunggu Penawaran</Badge>}
                          {q.status === 'quoted' && (
                            <div>
                              <Badge tone="brand">Sudah Diberi Penawaran</Badge>
                              <Money amount={q.quoted_price} className="text-[12px] font-bold block mt-0.5" />
                            </div>
                          )}
                          {q.status === 'accepted' && <Badge tone="success">Disetujui Pelanggan</Badge>}
                        </td>
                        <td className="text-right">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              setSelectedQuote(q);
                              setQuotePrice(q.quoted_price ? String(q.quoted_price) : '');
                              setQuoteVehicle(q.vehicle_type || 'tossa');
                            }}
                          >
                            Beri Penawaran
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          )}
        </div>
      )}

      {/* MODAL SHEET: Review & Approve Subscription */}
      <Sheet
        open={Boolean(selectedSub)}
        onClose={() => setSelectedSub(null)}
        title="Tinjau & Tetapkan Tarif Langganan"
      >
        {selectedSub && (
          <div className="space-y-4">
            <div className="p-3 bg-sunken rounded-control space-y-1 text-[13px]">
              <div className="flex justify-between">
                <span className="text-ink-muted">Properti:</span>
                <span className="font-bold text-ink">{selectedSub.property_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Tipe & Frekuensi:</span>
                <span className="font-medium text-ink">{selectedSub.property_type} • {selectedSub.frequency} Seminggu</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Titik GPS:</span>
                <span className="font-mono text-brand-ink">{selectedSub.lat ? `${selectedSub.lat.toFixed(6)}, ${selectedSub.lng.toFixed(6)}` : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Alamat:</span>
                <span className="text-ink text-right max-w-xs">{selectedSub.address}</span>
              </div>
            </div>

            <Field label="Tarif Resmi Bulanan (Rp)" hint="Konfirmasi sesuai volume sampah & kapasitas armada tossa">
              <Input
                type="number"
                value={subTariff}
                onChange={e => setSubTariff(e.target.value)}
                placeholder="400000"
              />
            </Field>

            <Field label="Catatan Akses Rute (Opsional)" hint="Misal: gerbang samping, tossa putar di gang barat">
              <Textarea
                rows={2}
                value={subNotes}
                onChange={e => setSubNotes(e.target.value)}
                placeholder="Akses gerbang utama..."
              />
            </Field>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSelectedSub(null)}
                disabled={subBusy}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => handleSaveSubscription('active')}
                disabled={subBusy}
              >
                {subBusy ? 'Menyimpan...' : 'Aktifkan Rute'}
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      {/* MODAL SHEET: Verifikasi Setoran Kasir */}
      <Sheet
        open={Boolean(verifyingInvoice)}
        onClose={() => setVerifyingInvoice(null)}
        title="Verifikasi Setoran Kas Tunai"
      >
        {verifyingInvoice && (
          <div className="space-y-4">
            <div className="p-4 bg-sunken rounded-control text-center space-y-1">
              <span className="text-[12px] text-ink-muted block">Jumlah Uang Fisik yang Diterima:</span>
              <Money amount={verifyingInvoice.amount} className="text-[22px] font-extrabold text-ink font-mono" />
              <span className="text-[12px] text-brand-ink font-semibold block">
                Diserahkan oleh Driver: {verifyingInvoice.collected_by_driver_name || 'Driver Lapangan'}
              </span>
            </div>

            <p className="text-[12.5px] text-ink-muted">
              Pastikan uang fisik telah dihitung dan cocok dengan total invoice #{verifyingInvoice.invoice_no} ({verifyingInvoice.client_name}).
            </p>

            <Field label="Catatan Kasir (Opsional)">
              <Input
                value={cashierNote}
                onChange={e => setCashierNote(e.target.value)}
                placeholder="Misal: uang pas diterima di kantor pos Kuta"
              />
            </Field>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setVerifyingInvoice(null)}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleVerifyCash}
              >
                Konfirmasi Uang Masuk Kas
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      {/* MODAL SHEET: Assign Housekeeping Cleaner */}
      <Sheet
        open={Boolean(selectedHk)}
        onClose={() => setSelectedHk(null)}
        title="Tugaskan Pembersih Housekeeping"
      >
        {selectedHk && (
          <div className="space-y-4">
            <div className="p-3 bg-sunken rounded-control space-y-1 text-[13px]">
              <div className="flex justify-between">
                <span className="text-ink-muted">Vila:</span>
                <span className="font-bold text-ink">{selectedHk.property_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Layanan:</span>
                <span className="font-medium text-ink">{selectedHk.service_type === 'turnover' ? 'Turnover Tamu' : 'Deep Clean'} ({selectedHk.bedrooms} Kamar)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Jadwal:</span>
                <span className="font-mono text-brand-ink">{selectedHk.scheduled_date} • {selectedHk.scheduled_time} WITA</span>
              </div>
            </div>

            <Field label="Nama Staf Pembersih / Mitra Cleaner">
              <Input
                value={hkAssignName}
                onChange={e => setHkAssignName(e.target.value)}
                placeholder="Contoh: Tim Bersih A / Siti Rohana"
              />
            </Field>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedHk(null)}>
                Batal
              </Button>
              <Button variant="primary" className="flex-1" onClick={handleSaveHkAssign}>
                Tugaskan
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      {/* MODAL SHEET: Respond Waste Quote */}
      <Sheet
        open={Boolean(selectedQuote)}
        onClose={() => setSelectedQuote(null)}
        title="Beri Penawaran Harga Borongan"
      >
        {selectedQuote && (
          <div className="space-y-4">
            <div className="p-3 bg-sunken rounded-control space-y-1 text-[13px]">
              <div className="flex justify-between">
                <span className="text-ink-muted">Alamat:</span>
                <span className="text-ink max-w-xs text-right truncate">{selectedQuote.address}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Rencana Tanggal:</span>
                <span className="font-mono text-brand-ink">{selectedQuote.requested_date}</span>
              </div>
              {selectedQuote.notes && (
                <div className="flex justify-between">
                  <span className="text-ink-muted">Catatan:</span>
                  <span className="text-ink text-right">{selectedQuote.notes}</span>
                </div>
              )}
            </div>

            <Field label="Harga Penawaran Resmi (Rp)">
              <Input
                type="number"
                value={quotePrice}
                onChange={e => setQuotePrice(e.target.value)}
                placeholder="250000"
              />
            </Field>

            <Field label="Armada yang Ditugaskan">
              <Select value={quoteVehicle} onChange={e => setQuoteVehicle(e.target.value)}>
                <option value="tossa">Tossa (Motor Roda Tiga)</option>
                <option value="pickup">Mobil Pickup</option>
                <option value="truck">Truk Engkel</option>
              </Select>
            </Field>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedQuote(null)}>
                Batal
              </Button>
              <Button variant="primary" className="flex-1" onClick={handleSaveQuote}>
                Kirim Penawaran ke Pelanggan
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};

export default BersihAdminPage;
