import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { TrendingUp, CheckCircle, XCircle, Clock, Landmark, List, Percent } from 'lucide-react';
import toast from 'react-hot-toast';
import PaymentModeCard from '../components/common/PaymentModeCard';
import CommissionDepositsSection from '../components/common/CommissionDepositsSection';
import CommissionDebtsSection from '../components/common/CommissionDebtsSection';
import { Badge, Button, Card, EmptyState, Money, PageHeader, SectionHeader, Segmented, Sheet, Spinner, Stat, Table } from '../components/ui';

// Platform commission on every completed order - 20%, matching
// DashboardPage.jsx's PLATFORM_COMMISSION_RATE (which itself must match
// credit_payout_on_order_completed() in migrations/0028_mitra_payout_system.sql).
// This used to be hardcoded here as 10% (revenue * 0.1), silently disagreeing
// with the Dashboard's 20% and understating real platform income by half.
// TODO(coordinator): worth hoisting into one shared constant (e.g.
// src/config/commission.js) so DashboardPage.jsx and this file can never
// drift apart again - left as a literal here for now to keep this fix
// minimal and avoid touching DashboardPage.jsx in this pass.
// Same words the customer and partner apps use for these states.
// Requests that need a decision come first; everything already handled is
// tucked into a collapsible history so the queue stays short on a phone.
const QueueWithHistory = ({ rows, render }) => {
  const pending = rows.filter((r) => r.status === 'pending');
  const history = rows.filter((r) => r.status !== 'pending');
  return (
    <div className="flex flex-col gap-3">
      {pending.length > 0 ? render(pending) : (
        <p className="rounded-card border border-dashed border-line px-4 py-3 text-[13px] text-ink-muted">Tidak ada yang menunggu.</p>
      )}
      {history.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-ink-muted hover:text-ink">
            <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span>
            Riwayat ({history.length})
          </summary>
          <div className="mt-2">{render(history)}</div>
        </details>
      )}
    </div>
  );
};

const TOPUP_STATUS = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak', cancelled: 'Dibatalkan' };
const PAYOUT_STATUS = { pending: 'Menunggu', approved: 'Sudah ditransfer', rejected: 'Ditolak', cancelled: 'Dibatalkan' };
const TX_TYPE = {
  topup: 'Top-up', payment: 'Pembayaran', refund: 'Refund', payout: 'Pencairan', tip: 'Tip',
  correction_in: 'Koreksi (+)', correction_out: 'Koreksi (−)', compensation: 'Kompensasi', transfer: 'Transfer',
};
const PLATFORM_COMMISSION_RATE = 0.20;

const FinancePage = () => {
  const [revenue, setRevenue] = useState(0);
  const [commission, setCommission] = useState(null);
  const [topups, setTopups] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('requests');
  const [transactions, setTransactions] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null); // { kind, row }
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Revenue
      // GMV is summed in the database (migrations/0087); the old path that
      // downloads every completed order only runs until that is applied.
      const { data: agg, error: aggError } = await supabase.rpc('admin_order_stats');
      if (!aggError && agg) {
        setRevenue(Number(agg.gmv) || 0);
        // Per-order rate from the database (villa 5%, others 20%; 0098).
        setCommission(agg.commission != null ? Number(agg.commission) || 0 : null);
      } else {
        if (aggError && aggError.code !== 'PGRST202') throw aggError;
        const { data: ordersData, error: ordersError } = await supabase.from('orders').select('total_price').eq('status', 'completed');
        if (ordersError) throw ordersError;
        if (ordersData) {
          setRevenue(ordersData.reduce((sum, o) => sum + (o.total_price || 0), 0));
        }
      }

      // Fetch Topup Requests
      const { data: topupData, error: topupError } = await supabase
        .from('topup_requests')
        .select('*, users(name, phone)')
        .order('created_at', { ascending: false });

      if (topupError) throw topupError;
      if (topupData) {
        setTopups(topupData);
      }

      // Fetch Payout Requests (mitra withdrawals)
      const { data: payoutData, error: payoutError } = await supabase
        .from('payout_requests')
        .select('*, users(name, phone)')
        .order('created_at', { ascending: false });

      if (payoutError) throw payoutError;
      if (payoutData) {
        setPayouts(payoutData);
      }

      // Fetch recent ledger transactions ("Semua Transaksi" tab) - this used
      // to never be fetched at all, so that tab always rendered an empty
      // table with no indication data was missing. Joins users(name, phone)
      // the same way topup/payout requests above do; capped at 200 most
      // recent rows since this is an audit trail, not a paginated report.
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('*, users(name, phone)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (txError) throw txError;
      if (txData) {
        setTransactions(txData);
      }
    } catch (error) {
      toast.error(error.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchData();
  }, []);

  const handleApprove = async (id) => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('approve_topup_request', { request_id: id });
      if (error) throw error;
      if (data) {
        toast.success('Top-up berhasil disetujui');
        fetchData();
      } else {
        toast.error('Gagal menyetujui, mungkin status sudah berubah');
      }
    } catch (err) {
      toast.error(err.message || 'Terjadi kesalahan');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id) => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('reject_topup_request', { request_id: id });
      if (error) throw error;
      if (data) {
        toast.success('Top-up berhasil ditolak');
        fetchData();
      } else {
        toast.error('Gagal menolak, mungkin status sudah berubah');
      }
    } catch (err) {
      toast.error(err.message || 'Terjadi kesalahan');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprovePayout = async (id) => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('approve_payout_request', { request_id: id });
      if (error) throw error;
      if (data) {
        toast.success('Pencairan ditandai selesai');
        fetchData();
      } else {
        toast.error('Gagal memproses, mungkin status sudah berubah');
      }
    } catch (err) {
      toast.error(err.message || 'Terjadi kesalahan');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectPayout = async (id) => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('reject_payout_request', { request_id: id });
      if (error) throw error;
      if (data) {
        toast.success('Pencairan ditolak, saldo dikembalikan');
        fetchData();
      } else {
        toast.error('Gagal menolak, mungkin status sudah berubah');
      }
    } catch (err) {
      toast.error(err.message || 'Terjadi kesalahan');
    } finally {
      setActionLoading(false);
    }
  };

  const pendingTopups = topups.filter(t => t.status === 'pending').length;
  const pendingPayouts = payouts.filter(p => p.status === 'pending').length;

  // Confirmation step for every money action (was window.confirm inside each
  // handler). The handlers themselves are unchanged apart from that gate.
  const CONFIRM_COPY = {
    approveTopup: { title: 'Setujui Top-Up', message: 'Yakin ingin menyetujui top-up ini?', label: 'Setujui', tone: 'default', run: handleApprove },
    rejectTopup: { title: 'Tolak Top-Up', message: 'Yakin ingin menolak top-up ini?', label: 'Tolak', tone: 'danger', run: handleReject },
    approvePayout: { title: 'Tandai Sudah Ditransfer', message: 'Konfirmasi dana SUDAH ditransfer manual ke mitra ini?', label: 'Tandai Sudah Ditransfer', tone: 'default', run: handleApprovePayout },
    rejectPayout: { title: 'Tolak Pencairan', message: 'Yakin ingin menolak pencairan ini? Saldo akan dikembalikan ke mitra.', label: 'Tolak', tone: 'danger', run: handleRejectPayout },
  };
  const confirmCopy = confirmAction ? CONFIRM_COPY[confirmAction.kind] : null;
  const runConfirmed = () => {
    if (!confirmAction) return;
    const { kind, row } = confirmAction;
    setConfirmAction(null);
    CONFIRM_COPY[kind].run(row.id);
  };

  const statusTone = (s) => (
    s === 'pending' ? 'warning' : s === 'approved' ? 'success' : s === 'cancelled' ? 'neutral' : 'danger'
  );

  const loadingBlock = (
    <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
      <Spinner size={16} /> Memuat data...
    </Card>
  );

  const userCell = (u) => (
    <div className="flex flex-col gap-0.5">
      <span className="font-semibold text-ink">{u?.name || 'Unknown'}</span>
      <span className="font-mono text-[12px] text-ink-muted">{u?.phone || '-'}</span>
    </div>
  );

  const timeCell = (iso) => (
    <span className="whitespace-nowrap font-mono text-[12.5px] text-ink-muted">{new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
  );

  const topupTable = (rows) => (
    <Table titleCol={1}>
      <thead>
        <tr>
          <th>Waktu</th>
          <th>Pengguna</th>
          <th className="text-right">Nominal</th>
          <th>Status</th>
          <th className="text-right">Aksi</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(t => (
          <tr key={t.id}>
            <td>{timeCell(t.created_at)}</td>
            <td>{userCell(t.users)}</td>
            <td className="text-right">
              {(() => {
                const amt = Number(t.amount);
                const str = amt.toLocaleString('id-ID');
                const code = amt % 1000;
                if (code > 0 && str.length >= 3) {
                  return (
                    <div className="flex flex-col items-end gap-1">
                      <span className="whitespace-nowrap font-mono font-medium text-ink">
                        Rp {str.slice(0, -3)}
                        <span className="rounded-[5px] border border-pay-line bg-pay-soft px-1 text-pay-ink">{str.slice(-3)}</span>
                      </span>
                      <span className="text-[11.5px] font-semibold text-pay-ink">
                        Kode Unik: <span className="font-mono">+{code}</span>
                      </span>
                    </div>
                  );
                }
                return <Money value={amt} className="font-medium text-ink" />;
              })()}
            </td>
            <td>
              <Badge tone={statusTone(t.status)} dot>{TOPUP_STATUS[t.status] || t.status}</Badge>
            </td>
            <td className="text-right">
              {t.status === 'pending' && (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<CheckCircle size={15} />}
                    onClick={() => setConfirmAction({ kind: 'approveTopup', row: t })}
                    disabled={actionLoading}
                  >
                    Setujui
                  </Button>
                  <Button
                    size="sm"
                    variant="danger-soft"
                    leftIcon={<XCircle size={15} />}
                    onClick={() => setConfirmAction({ kind: 'rejectTopup', row: t })}
                    disabled={actionLoading}
                  >
                    Tolak
                  </Button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );

  const payoutTable = (rows) => (
    <Table titleCol={1}>
      <thead>
        <tr>
          <th>Waktu</th>
          <th>Mitra</th>
          <th className="text-right">Nominal</th>
          <th>Tujuan Transfer</th>
          <th>Status</th>
          <th className="text-right">Aksi</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(p => (
          <tr key={p.id}>
            <td>{timeCell(p.created_at)}</td>
            <td>{userCell(p.users)}</td>
            <td className="text-right">
              <Money value={p.amount} className="font-medium text-ink" />
            </td>
            <td>
              <div className="flex flex-col gap-0.5">
                <span className="font-mono font-medium text-ink">{p.payout_destination}</span>
                <span className="text-[12px] text-ink-muted">
                  {p.payout_method === 'ewallet' ? 'E-Wallet' : 'Transfer Bank'}
                  {p.payout_account_name ? ` • a.n. ${p.payout_account_name}` : ''}
                </span>
              </div>
            </td>
            <td>
              <Badge tone={statusTone(p.status)} dot>{PAYOUT_STATUS[p.status] || p.status}</Badge>
            </td>
            <td className="text-right">
              {p.status === 'pending' && (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<CheckCircle size={15} />}
                    onClick={() => setConfirmAction({ kind: 'approvePayout', row: p })}
                    disabled={actionLoading}
                  >
                    Tandai Sudah Ditransfer
                  </Button>
                  <Button
                    size="sm"
                    variant="danger-soft"
                    leftIcon={<XCircle size={15} />}
                    onClick={() => setConfirmAction({ kind: 'rejectPayout', row: p })}
                    disabled={actionLoading}
                  >
                    Tolak
                  </Button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );

  return (
    <div className="flex flex-col gap-6 pb-12">
      <PageHeader
        className="!mb-0"
        title="Keuangan & Top-Up"
        subtitle="Laporan pendapatan asli dan permintaan saldo pengguna"
      />

      <PaymentModeCard />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1.35fr_1.35fr_1fr_1fr]">
        <Stat
          label="Total Nilai Transaksi (GMV)"
          value={<Money value={revenue} />}
          icon={<TrendingUp size={18} />}
          tone="pay"
          hint="Seluruh pesanan selesai"
        />
        <Stat
          label="Komisi Aplikasi"
          value={<Money value={commission ?? revenue * PLATFORM_COMMISSION_RATE} />}
          icon={<Percent size={18} />}
          tone="pay"
        />
        <Stat label="Top-Up Menunggu" value={loading ? '–' : pendingTopups} icon={<Clock size={18} />} tone="neutral" />
        <Stat label="Pencairan Menunggu" value={loading ? '–' : pendingPayouts} icon={<Landmark size={18} />} tone="neutral" />
      </div>

      <Segmented
        ariaLabel="Tampilan keuangan"
        className="self-start"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: 'requests', label: 'Permintaan' },
          { value: 'transactions', label: 'Buku Besar' },
        ]}
      />

      {activeTab === 'requests' && (
        <div className="flex flex-col gap-6">
          <CommissionDepositsSection />

          <section>
            <SectionHeader
              title="Permintaan Top-Up WiraPay"
              action={pendingTopups > 0 ? <Badge tone="warning" dot>{pendingTopups} menunggu</Badge> : null}
            />
            {loading ? loadingBlock : topups.length === 0 ? (
              <EmptyState icon={<Clock size={24} />} title="Belum ada permintaan top-up." />
            ) : (
              <QueueWithHistory rows={topups} render={topupTable} />
            )}
          </section>

          <section>
            <SectionHeader
              title="Permintaan Pencairan Mitra"
              action={pendingPayouts > 0 ? <Badge tone="warning" dot>{pendingPayouts} menunggu</Badge> : null}
            />
            {loading ? loadingBlock : payouts.length === 0 ? (
              <EmptyState icon={<Landmark size={24} />} title="Belum ada permintaan pencairan." />
            ) : (
              <QueueWithHistory rows={payouts} render={payoutTable} />
            )}
          </section>

          <CommissionDebtsSection />
        </div>
      )}

      {activeTab === 'transactions' && (
        <section>
          <SectionHeader title="Semua Transaksi (Buku Besar)" className="!mb-1" />
          <p className="mb-3 text-[13px] text-ink-muted">
            Menampilkan 200 transaksi uang terakhir (Top-Up, Pembayaran Pesanan, Pencairan, Koreksi).
          </p>

          {loading ? loadingBlock : transactions.length === 0 ? (
            <EmptyState icon={<List size={24} />} title="Belum ada transaksi tercatat." />
          ) : (
            <Table titleCol={1}>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Pengguna</th>
                  <th>Tipe</th>
                  <th className="text-right">Nominal</th>
                  <th>Deskripsi</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => {
                  const isIncoming = tx.type === 'topup' || tx.type === 'correction_in' || tx.type === 'refund' || tx.amount > 0;

                  return (
                    <tr key={tx.id}>
                      <td>{timeCell(tx.created_at)}</td>
                      <td>{userCell(tx.users)}</td>
                      <td>
                        <Badge tone="neutral">{TX_TYPE[tx.type] || tx.type}</Badge>
                      </td>
                      <td className="text-right">
                        <Money
                          value={tx.amount}
                          sign={isIncoming ? 'plus' : 'minus'}
                          tone={isIncoming ? 'in' : 'default'}
                          className="font-medium"
                        />
                      </td>
                      <td className="min-w-[220px] text-[13px]">
                        {tx.description || '-'}
                        {tx.reference_id && <div className="mt-0.5 break-all font-mono text-[11px] text-ink-muted">{tx.reference_id}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </section>
      )}

      <Sheet
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmCopy?.title}
        description={confirmCopy?.message}
        tone={confirmCopy?.tone === 'danger' ? 'danger' : 'pay'}
        icon={confirmCopy?.tone === 'danger' ? <XCircle size={20} /> : <CheckCircle size={20} />}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setConfirmAction(null)}>Batal</Button>
            <Button
              variant={confirmCopy?.tone === 'danger' ? 'danger' : 'primary'}
              onClick={runConfirmed}
              isLoading={actionLoading}
            >
              {confirmCopy?.label}
            </Button>
          </>
        )}
      >
        {confirmAction && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-control border border-line bg-card px-4 py-3 text-[13px]">
            <dt className="text-ink-muted">{confirmAction.kind.endsWith('Payout') ? 'Mitra' : 'Pengguna'}</dt>
            <dd className="text-right font-semibold text-ink">{confirmAction.row.users?.name || 'Unknown'}</dd>
            <dt className="text-ink-muted">Nominal</dt>
            <dd className="text-right"><Money value={confirmAction.row.amount} className="font-semibold text-ink" /></dd>
            {confirmAction.kind.endsWith('Payout') && (
              <>
                <dt className="text-ink-muted">Tujuan Transfer</dt>
                <dd className="text-right font-mono text-ink">{confirmAction.row.payout_destination}</dd>
              </>
            )}
          </dl>
        )}
      </Sheet>
    </div>
  );
};

export default FinancePage;
