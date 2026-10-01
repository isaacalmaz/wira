import ReviewModal from "../components/common/ReviewModal";
import { canReview } from "../utils/review";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, IconTile, Money, PageHeader, Segmented, Sheet } from '../components/ui';
import { useOrders } from '../context/OrderContext';
import { OrderStatus } from '../constants/orderStatus';
import { useTranslation } from '../i18n';
import { localizeOrderTitle, localizeOrderDetails, localizePaymentMethod } from '../utils/localizeDbText';
import {
  ShoppingBag,
  Bike,
  Package,
  Home,
  Wrench,
  Waves,
  Smartphone,
  Clock,
  Receipt,
  Star,
} from 'lucide-react';

// Statuses that mean an order/ride is still actually "live" (not yet
// completed/cancelled). These should route to ActiveOrderPage for real-time
// tracking, the PIN screen, cancel and chat - anything past this point
// (COMPLETED/CANCELLED) is a finished record and should only open the
// read-only receipt modal. Source of truth: constants/orderStatus.js.
// 'menunggu' is kept for parity with the previous whitelist even though it
// isn't one of the canonical OrderStatus values.
const IN_PROGRESS_STATUSES = [
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.PICKING_UP,
  OrderStatus.IN_TRIP,
  OrderStatus.ON_THE_WAY,
  OrderStatus.WORKING,
  'menunggu',
];

// Badge tone per status (DESIGN.md §5): searching/pending = warning,
// active = brand, completed = success, cancelled = danger.
const WAITING_STATUSES = [OrderStatus.AWAITING_PAYMENT, OrderStatus.PENDING, 'menunggu'];
function statusTone(order) {
  const s = String(order?.rawStatus || order?.status || '').toLowerCase();
  if (s === OrderStatus.COMPLETED) return 'success';
  if (s === OrderStatus.CANCELLED) return 'danger';
  if (WAITING_STATUSES.includes(s)) return 'warning';
  if (IN_PROGRESS_STATUSES.includes(s)) return 'brand';
  return 'neutral';
}

// One label/value line of the receipt.
function ReceiptRow({ label, children, strong = false }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className={`shrink-0 text-[13px] ${strong ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{label}</span>
      <span className="min-w-0 break-words text-right text-[13px] font-semibold text-ink">{children}</span>
    </div>
  );
}

export default function ActivityPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { orders, refreshOrders } = useOrders();
  const [tab, setTab] = useState('Semua');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [reviewingOrder, setReviewingOrder] = useState(null);

  const tabs = [
    'Semua',
    'WiraRide',
    'WiraFood',
    'WiraSend',
    'WiraVilla',
    'WiraService',
    'WiraPool',
    'WiraPulsa',
  ];

  const filtered = tab === 'Semua' ? orders : orders.filter((a) => a.service === tab);

  const getServiceIcon = (service) => {
    switch (service) {
      case 'WiraRide':
        return <Bike size={20} />;
      case 'WiraFood':
        return <ShoppingBag size={20} />;
      case 'WiraSend':
        return <Package size={20} />;
      case 'WiraVilla':
        return <Home size={20} />;
      case 'WiraService':
        return <Wrench size={20} />;
      case 'WiraPool':
        return <Waves size={20} />;
      case 'WiraPulsa':
        return <Smartphone size={20} />;
      default:
        return <Receipt size={20} />;
    }
  };

  const filterOptions = tabs.map((tabName) => ({
    value: tabName,
    label: tabName === 'Semua' ? t('common.all') : tabName,
  }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-4">
      <PageHeader title={t('activity.title')} subtitle={t('activity.subtitle')} className="mb-0" />

      {/* Tabs Filter */}
      <Segmented scroll options={filterOptions} value={tab} onChange={setTab} ariaLabel={t('activity.service_label')} />

      {/* Daftar Kartu Pesanan */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <EmptyState icon={<Receipt size={24} />} title={t('activity.empty')} />
        ) : (
          filtered.map((act) => {
            const tone = statusTone(act);
            return (
              <Card
                key={act.id}
                as="button"
                type="button"
                padding="none"
                onClick={() => IN_PROGRESS_STATUSES.includes((act.rawStatus || act.status).toLowerCase()) ? navigate(`/active-order/${act.id}`) : setSelectedOrder(act)}
                className="hover:border-brand-line"
              >
                <span className="flex flex-col gap-3 p-4">
                  <span className="flex items-start gap-3">
                    <IconTile tone="brand">{getServiceIcon(act.service)}</IconTile>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-ink">
                        {act.service}
                      </span>
                      <span className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink">
                        {localizeOrderTitle(act, t)}
                      </span>
                      {act.details && (
                        <span className="line-clamp-1 text-[12px] text-ink-muted">
                          {localizeOrderDetails(act, t)}
                        </span>
                      )}
                    </span>
                    <Badge tone={tone} dot className="mt-0.5 shrink-0">
                      {t(act.statusKey)}
                    </Badge>
                  </span>

                  <span className="flex items-center justify-between gap-3 border-t border-line pt-3">
                    <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-xs text-ink-muted">
                      <Clock size={13} className="shrink-0" aria-hidden="true" />
                      <span className="truncate">{act.date}</span>
                    </span>
                    <Money
                      value={act.price}
                      tone={tone === 'danger' ? 'muted' : 'default'}
                      className={`text-[14px] font-medium ${tone === 'danger' ? 'line-through' : 'text-ink'}`}
                    />
                  </span>
                </span>
              </Card>
            );
          })
        )}
      </div>

      {/* MODAL RINCIAN STRUK PESANAN */}
      <Sheet
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title={t('activity.receipt_title')}
        icon={selectedOrder ? getServiceIcon(selectedOrder.service) : null}
        closeLabel={t('common.close')}
        footer={
          selectedOrder && (
            <>
              <Button
                variant={canReview(selectedOrder) ? 'secondary' : 'primary'}
                size="lg"
                onClick={() => setSelectedOrder(null)}
              >
                {t('activity.close_receipt')}
              </Button>
              {canReview(selectedOrder) && (
                <Button
                  size="lg"
                  leftIcon={<Star size={18} />}
                  onClick={() => {
                    setReviewingOrder(selectedOrder);
                    setSelectedOrder(null);
                  }}
                >
                  {t('activity.review_cta')}
                </Button>
              )}
            </>
          )
        }
      >
        {selectedOrder && (
          <div className="flex flex-col gap-3">
            <p className="break-all font-mono text-xs text-ink-muted">
              {t('activity.receipt_id', { id: selectedOrder.id })}
            </p>

            <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-card px-4 py-1.5">
              <ReceiptRow label={t('activity.service_label')}>{selectedOrder.service}</ReceiptRow>
              <ReceiptRow label={t('activity.order_label')}>{localizeOrderTitle(selectedOrder, t)}</ReceiptRow>
              {selectedOrder.details && (
                <ReceiptRow label={t('activity.detail_label')}>
                  <span className="font-medium">{localizeOrderDetails(selectedOrder, t)}</span>
                </ReceiptRow>
              )}
              <ReceiptRow label={t('activity.time_label')}>
                <span className="font-mono font-medium">{selectedOrder.date}</span>
              </ReceiptRow>
              <ReceiptRow label={t('activity.payment_label')}>{localizePaymentMethod(selectedOrder, t)}</ReceiptRow>
              <ReceiptRow label={t('activity.status_label')}>
                <Badge tone={statusTone(selectedOrder)} dot>{t(selectedOrder.statusKey)}</Badge>
              </ReceiptRow>
              <ReceiptRow label={t('activity.total_label')} strong>
                <Money value={selectedOrder.price} className="text-[15px] font-medium" />
              </ReceiptRow>
            </div>
          </div>
        )}
      </Sheet>

      {reviewingOrder && (
        <ReviewModal 
          order={reviewingOrder} 
          onClose={() => setReviewingOrder(null)}
          onSuccess={() => {
            setReviewingOrder(null);
            refreshOrders();
          }}
        />
      )}
    </div>
  );
}
