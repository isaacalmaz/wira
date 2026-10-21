import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeftRight, ChevronRight, Check, PlusCircle, User, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button, Card, Badge, IconTile, ListRow, Sheet, cx } from '../ui';
import { ROLE_CONFIG, MITRA_ROLES, setStoredActiveMode } from '../../constants/roles';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

/**
 * Modal sheet allowing multi-capable partners to seamlessly switch between portals.
 */
export function RoleSwitcherSheet({ open, onClose, currentRole, roles = [] }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [checkingOrder, setCheckingOrder] = useState(false);

  // Filter to valid mitra roles
  const validRoles = (roles || []).filter((r) => MITRA_ROLES.includes(r));

  const handleSelectRole = async (targetRole) => {
    if (targetRole === currentRole) {
      onClose();
      return;
    }

    if (currentRole === 'driver' && user?.id) {
      setCheckingOrder(true);
      try {
        const { data: ongoing } = await supabase
          .from('orders')
          .select('id, status')
          .eq('driver_id', user.id)
          .in('status', ['accepted', 'picking_up', 'in_trip'])
          .limit(1)
          .maybeSingle();

        if (ongoing) {
          toast.error('Tidak dapat berganti peran saat ada pesanan aktif. Selesaikan pesanan Anda terlebih dahulu.');
          setCheckingOrder(false);
          return;
        }
      } catch (err) {
        console.warn('Cek pesanan aktif gagal:', err);
      } finally {
        setCheckingOrder(false);
      }
    }

    setStoredActiveMode(targetRole);
    const targetLabel = ROLE_CONFIG[targetRole]?.label || targetRole;
    toast.success(`Beralih ke portal ${targetLabel}`);
    onClose();
    navigate(`/${targetRole}`);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ganti Peran Mitra"
      description="Pilih portal peran mitra yang ingin Anda masuki:"
      size="md"
      footer={
        <Button variant="secondary" size="md" block onClick={onClose}>
          Batal
        </Button>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        <div className="flex flex-col gap-2">
          {validRoles.map((r) => {
            const config = ROLE_CONFIG[r];
            if (!config) return null;
            const Icon = config.icon || User;
            const isActive = r === currentRole;

            return (
              <button
                key={r}
                type="button"
                disabled={checkingOrder}
                onClick={() => handleSelectRole(r)}
                className={cx(
                  'group flex w-full min-h-14 items-center justify-between gap-3 rounded-card border p-3.5 text-left transition-all',
                  isActive
                    ? 'border-brand bg-brand-soft/40 shadow-sm ring-1 ring-brand'
                    : 'border-line bg-card hover:border-brand-line hover:bg-brand-soft/20',
                  checkingOrder && 'opacity-60 cursor-not-allowed'
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cx(
                      'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border transition-colors',
                      isActive
                        ? 'border-brand-line bg-brand-soft text-brand-ink font-bold'
                        : 'border-line bg-sunken text-ink-muted group-hover:border-brand-line group-hover:bg-brand-soft group-hover:text-brand-ink'
                    )}
                  >
                    <Icon size={20} />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[14.5px] font-bold text-ink leading-tight">
                      {config.label}
                    </span>
                    <span className="text-[12px] text-ink-muted leading-tight mt-0.5 line-clamp-1">
                      {config.description || config.sub}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5 pl-2">
                  {checkingOrder && isActive ? (
                    <Loader2 size={16} className="animate-spin text-brand-ink" />
                  ) : isActive ? (
                    <Badge tone="brand" className="gap-1 font-semibold">
                      <Check size={12} strokeWidth={2.5} />
                      Aktif
                    </Badge>
                  ) : (
                    <ChevronRight
                      size={18}
                      className="text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-ink"
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Link to apply for new roles */}
        <div className="mt-2 pt-3 border-t border-line">
          <Link
            to="/register"
            onClick={onClose}
            className="flex items-center gap-2.5 rounded-control px-3 py-2 text-[13px] font-semibold text-brand-ink hover:bg-brand-soft transition-colors min-h-11"
          >
            <PlusCircle size={17} className="shrink-0" />
            <span>Punya keahlian lain? Tambah atau daftar peran baru</span>
          </Link>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Interactive card in the desktop sidebar showing current role and quick switch trigger.
 */
export function RoleSwitcherSidebarButton({ currentRole, roles = [], onClick }) {
  const config = ROLE_CONFIG[currentRole] || ROLE_CONFIG.driver;
  const Icon = config.icon || User;
  const hasMultiple = roles && roles.length > 1;

  if (!hasMultiple) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-line bg-ground px-3 py-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-brand-line bg-brand-soft text-brand-ink">
          <Icon size={19} />
        </span>
        <div className="min-w-0 flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Mitra</span>
          <span className="font-bold text-[14px] text-ink truncate">{config.label}</span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ganti peran mitra"
      className="group flex min-h-11 w-full items-center justify-between gap-3 rounded-card border border-line bg-ground p-3 text-left transition-all hover:border-brand-line hover:bg-brand-soft/25"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-brand-line bg-brand-soft text-brand-ink transition-colors group-hover:border-brand">
          <Icon size={19} />
        </span>
        <div className="min-w-0 flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Mitra</span>
          <span className="font-bold text-[14px] text-ink truncate group-hover:text-brand-ink">{config.label}</span>
        </div>
      </div>

      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-[11.5px] font-bold text-ink-muted transition-colors group-hover:border-brand-line group-hover:bg-brand-soft group-hover:text-brand-ink">
        <ArrowLeftRight size={12} />
        <span>Ganti</span>
      </span>
    </button>
  );
}

/**
 * Interactive badge in the mobile header top bar.
 */
export function RoleSwitcherHeaderBadge({ currentRole, roles = [], onClick }) {
  const config = ROLE_CONFIG[currentRole] || ROLE_CONFIG.driver;
  const Icon = config.icon || User;
  const hasMultiple = roles && roles.length > 1;

  if (!hasMultiple) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-2.5 py-1 text-[12px] font-semibold text-brand-ink">
        <Icon size={14} aria-hidden="true" />
        {config.label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ganti peran mitra"
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-3 py-1.5 text-[12px] font-bold text-brand-ink transition-all hover:bg-brand-soft/80 active:scale-95"
    >
      <Icon size={14} aria-hidden="true" />
      <span>{config.label}</span>
      <ArrowLeftRight size={12} className="ml-0.5 text-brand-ink/80" />
    </button>
  );
}

/**
 * Menu item in partner ProfileShell screen.
 */
export function RoleSwitcherProfileRow({ currentRole, roles = [], onOpen }) {
  const validRoles = (roles || []).filter((r) => MITRA_ROLES.includes(r));
  const hasMultiple = validRoles.length > 1;

  if (!hasMultiple) {
    return (
      <Card padding="none">
        <ListRow
          as={Link}
          to="/register"
          chevron
          className="min-h-14 w-full px-4 py-3.5 text-left"
          leading={<IconTile tone="brand" size="sm"><PlusCircle size={18} /></IconTile>}
          title="Tambah Peran / Keahlian Mitra"
          subtitle="Punya keahlian lain? Daftar peran baru di akun ini tanpa membuat akun baru"
        />
      </Card>
    );
  }

  const currentLabel = ROLE_CONFIG[currentRole]?.label || currentRole;

  return (
    <Card padding="none">
      <ListRow
        as="button"
        type="button"
        onClick={onOpen}
        chevron
        className="min-h-14 w-full px-4 py-3.5 text-left"
        leading={<IconTile tone="brand" size="sm"><ArrowLeftRight size={18} /></IconTile>}
        title="Ganti Peran Mitra"
        subtitle={`Sedang aktif sebagai ${currentLabel} · Beralih ke peran lain (${validRoles.length} peran terdaftar)`}
      />
    </Card>
  );
}

export default RoleSwitcherSheet;
