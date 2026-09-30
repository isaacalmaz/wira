import { useState } from 'react';
import {
  Button,
  Card,
  Sheet,
  Field,
  Input,
  Badge,
  Money,
  Notice,
  PageHeader,
  SectionHeader,
  Segmented,
  cx,
} from '../components/ui';
import { useWallet } from '../context/WalletContext';
import {
  Smartphone,
  Zap,
  Droplet,
  ShieldPlus,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from '../i18n';

// Placeholder used to drop a <Money> into a translated sentence, so an
// amount inside "Beli Sekarang • {{price}}" still renders in mono.
const SLOT = '\u0000';
function withMoney(text, value, moneyProps = {}) {
  const [before, after = ''] = text.split(SLOT);
  return <>{before}<Money value={value} {...moneyProps} />{after}</>;
}

function SummaryRow({ label, children, strong = false, className = '' }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3', className)}>
      <dt className={cx('shrink-0', strong ? 'font-semibold text-ink' : 'text-ink-muted')}>{label}</dt>
      <dd className="min-w-0 text-right text-ink">{children}</dd>
    </div>
  );
}

export default function PulsaPage() {
  const { t } = useTranslation();
  const { balance } = useWallet();

  const [tab, setTab] = useState('Pulsa');
  const [targetNumber, setTargetNumber] = useState('');
  const [selectedNominal, setSelectedNominal] = useState(50000);
  const [showModal, setShowModal] = useState(false);

  const tabs = [
    { id: 'Pulsa', icon: Smartphone, labelKey: 'pulsa.tab_pulsa' },
    { id: 'Data', icon: Smartphone, labelKey: 'pulsa.tab_data' },
    { id: 'PLN', icon: Zap, labelKey: 'pulsa.tab_pln' },
    { id: 'PDAM', icon: Droplet, labelKey: 'pulsa.tab_pdam' },
    { id: 'BPJS', icon: ShieldPlus, labelKey: 'pulsa.tab_bpjs' },
  ];

  // Deteksi Operator Otomatis dari Prefix Nomor HP
  const detectOperator = (number) => {
    const clean = number.replace(/\D/g, '');
    if (clean.startsWith('0811') || clean.startsWith('0812') || clean.startsWith('0813') || clean.startsWith('0821') || clean.startsWith('0822') || clean.startsWith('0852') || clean.startsWith('0853')) {
      return { name: 'Telkomsel', tone: 'brand' };
    }
    if (clean.startsWith('0814') || clean.startsWith('0815') || clean.startsWith('0816') || clean.startsWith('0855') || clean.startsWith('0856') || clean.startsWith('0857') || clean.startsWith('0858')) {
      return { name: 'Indosat IM3', tone: 'brand' };
    }
    if (clean.startsWith('0817') || clean.startsWith('0818') || clean.startsWith('0819') || clean.startsWith('0859') || clean.startsWith('0877') || clean.startsWith('0878')) {
      return { name: 'XL Axiata', tone: 'brand' };
    }
    if (clean.startsWith('0895') || clean.startsWith('0896') || clean.startsWith('0897') || clean.startsWith('0898') || clean.startsWith('0899')) {
      return { name: 'Tri (3)', tone: 'brand' };
    }
    if (clean.startsWith('0881') || clean.startsWith('0882') || clean.startsWith('0883') || clean.startsWith('0888')) {
      return { name: 'Smartfren', tone: 'brand' };
    }
    return clean.length >= 4 ? { name: t('pulsa.operator_other'), tone: 'neutral' } : null;
  };

  const currentOperator = detectOperator(targetNumber);

  // Daftar Produk Berdasarkan Tab
  // Product catalogue. Each id maps to a `pulsa.products.<id>` label so the
  // wording follows the customer's language; amounts stay numeric.
  const products = {
    Pulsa: [
      { id: 'P10', nominal: 10000, price: 11500 },
      { id: 'P20', nominal: 20000, price: 21500 },
      { id: 'P50', nominal: 50000, price: 51000 },
      { id: 'P100', nominal: 100000, price: 100500 },
      { id: 'P150', nominal: 150000, price: 150500 },
      { id: 'P200', nominal: 200000, price: 199500 },
    ],
    Data: [
      { id: 'D1', nominal: 35000, price: 35000 },
      { id: 'D2', nominal: 60000, price: 60000 },
      { id: 'D3', nominal: 95000, price: 95000 },
      { id: 'D4', nominal: 130000, price: 130000 },
    ],
    PLN: [
      { id: 'PLN20', nominal: 20000, price: 22000 },
      { id: 'PLN50', nominal: 50000, price: 52000 },
      { id: 'PLN100', nominal: 100000, price: 102000 },
      { id: 'PLN200', nominal: 200000, price: 202000 },
      { id: 'PLN500', nominal: 500000, price: 502000 },
      { id: 'PLN1000', nominal: 1000000, price: 1002000 },
    ],
    PDAM: [
      { id: 'PDAM1', nominal: 85000, price: 87500 },
    ],
    BPJS: [
      { id: 'BPJS1', nominal: 70000, price: 72500 },
      { id: 'BPJS2', nominal: 100000, price: 102500 },
    ],
  };

  const activeProducts = products[tab] || products.Pulsa;
  const selectedProduct = activeProducts.find((p) => p.nominal === selectedNominal) || activeProducts[0];

  const handleCheckout = () => {
    if (!targetNumber || targetNumber.length < 9) {
      toast.error(tab === 'PLN' ? t('pulsa.invalid_pln') : t('pulsa.invalid_phone'));
      return;
    }
    setShowModal(true);
  };

  // Pembayaran nyata (potong saldo WiraPay + kirim token/nomor seri) belum
  // terhubung ke provider PPOB manapun - sebelumnya tombol ini tetap
  // memotong saldo WiraPay pengguna lalu mengarang nomor token/seri palsu
  // dengan Math.random()/Date.now(), seolah-olah transaksi benar-benar
  // berhasil. Daripada mengambil uang sungguhan untuk hasil yang palsu,
  // aksi pembelian dinonaktifkan sampai integrasi provider yang sebenarnya
  // siap - lihat tombol "Bayar Sekarang" di bawah.

  const targetLabel = tab === 'PLN'
    ? t('pulsa.label_pln')
    : tab === 'PDAM'
    ? t('pulsa.label_pdam')
    : tab === 'BPJS'
    ? t('pulsa.label_bpjs')
    : t('pulsa.label_phone');
  const showOperator = currentOperator && tab !== 'PLN' && tab !== 'PDAM' && tab !== 'BPJS';

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 pb-16">
      <PageHeader
        back="/"
        backLabel={t('common.back')}
        title={t('pulsa.title')}
        subtitle={t('pulsa.subtitle')}
        className="mb-0"
      />

      {/* Tabs Kategori Layanan */}
      <Segmented
        scroll
        value={tab}
        onChange={(id) => {
          setTab(id);
          setSelectedNominal(products[id]?.[0]?.nominal || 50000);
        }}
        options={tabs.map((tabItem) => {
          const Icon = tabItem.icon;
          return {
            value: tabItem.id,
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Icon size={15} aria-hidden="true" /> {t(tabItem.labelKey)}
              </span>
            ),
          };
        })}
      />

      {/* Form Input Nomor Tujuan */}
      <Card>
        <Field label={targetLabel} htmlFor="pulsa-target">
          <div className="relative">
            <Input
              id="pulsa-target"
              type="tel"
              inputMode="numeric"
              placeholder={tab === 'PLN' ? t('pulsa.placeholder_pln') : t('pulsa.placeholder_phone')}
              value={targetNumber}
              onChange={(e) => setTargetNumber(e.target.value)}
              className={cx('font-mono text-[16px] tracking-wide', showOperator && 'pr-36')}
            />
            {showOperator && (
              <Badge tone={currentOperator.tone} className="absolute right-3 top-1/2 max-w-[8.5rem] -translate-y-1/2 truncate">
                {currentOperator.name}
              </Badge>
            )}
          </div>
        </Field>
      </Card>

      {/* Daftar Pilihan Nominal / Paket */}
      <section>
        <SectionHeader title={t('pulsa.choose_package')} />
        <div role="radiogroup" aria-label={t('pulsa.choose_package')} className="grid grid-cols-2 gap-3">
          {activeProducts.map((p) => {
            const isSelected = selectedNominal === p.nominal;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedNominal(p.nominal)}
                className={cx(
                  'relative flex min-h-[84px] flex-col items-start justify-between gap-2 rounded-tile bg-card text-left transition-colors',
                  isSelected
                    ? 'border-2 border-brand p-[13px] pr-9'
                    : 'border border-line p-3.5 pr-9 hover:border-line-strong',
                )}
              >
                {isSelected && (
                  <CheckCircle2
                    size={18}
                    className="absolute right-3 top-3 text-brand-ink"
                    aria-hidden="true"
                  />
                )}
                <span className="text-[14px] font-semibold leading-snug text-ink">
                  {t(`pulsa.products.${p.id}`)}
                </span>
                <Money value={p.price} className="text-[13.5px] text-ink-muted" />
              </button>
            );
          })}
        </div>
      </section>

      {/* Tombol Aksi Beli */}
      <Button
        size="lg"
        block
        onClick={handleCheckout}
        disabled={!targetNumber}
      >
        {withMoney(t('pulsa.buy_now', { price: SLOT }), selectedProduct.price)}
      </Button>

      {/* SHEET KONFIRMASI */}
      <Sheet
        open={showModal}
        onClose={() => setShowModal(false)}
        closeLabel={t('common.close')}
        title={t('pulsa.confirm_title')}
        description={t('pulsa.confirm_subtitle')}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setShowModal(false)}>
              {t('common.close')}
            </Button>
            {/* Pembelian nyata belum terhubung ke provider PPOB manapun -
                daripada berpura-pura berhasil (memotong saldo & mengarang
                token/nomor seri palsu), aksi bayar dinonaktifkan dengan
                pesan jujur sampai integrasi yang sebenarnya siap. */}
            <Button size="lg" disabled>
              {t('pulsa.coming_soon')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <dl className="flex flex-col gap-3 rounded-card border border-line bg-card p-4 text-[13px]">
            <SummaryRow label={t('pulsa.service_label')}>
              <span className="font-semibold">{t(tabs.find((x) => x.id === tab)?.labelKey || 'pulsa.tab_pulsa')}</span>
            </SummaryRow>
            <SummaryRow label={t('pulsa.target_label')}>
              <span className="break-all font-mono font-medium">{targetNumber}</span>
            </SummaryRow>
            <SummaryRow label={t('pulsa.product_label')}>
              <span className="font-semibold">{t(`pulsa.products.${selectedProduct.id}`)}</span>
            </SummaryRow>
            <SummaryRow label={t('pulsa.total_label')} strong className="border-t border-line pt-3 text-[14px]">
              <Money value={selectedProduct.price} className="text-[17px] font-medium" />
            </SummaryRow>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[12px] text-ink-muted">
              <span>{t('pulsa.method_label')}</span>
              <span>{withMoney(t('pulsa.remaining_balance', { amount: SLOT }), balance)}</span>
            </div>
          </dl>

          <Notice tone="warning">{t('pulsa.under_construction')}</Notice>
        </div>
      </Sheet>
    </div>
  );
}
