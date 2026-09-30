// Legacy shared components, now thin wrappers over the Tenun Laut kit in
// components/ui so every existing caller picks up the new look. New code
// should import from '../ui' directly (see DESIGN.md).
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Field, Input, Select, Textarea } from '../ui/Field';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

export const FormField = ({ label, type = 'text', value, onChange, placeholder, options = [], className = '' }) => (
  <Field label={label} className={`mb-4 ${className}`}>
    {type === 'select' ? (
      <Select value={value} onChange={onChange}>
        {options.map((opt, i) => (
          <option key={i} value={opt.value}>{opt.label}</option>
        ))}
      </Select>
    ) : type === 'textarea' ? (
      <Textarea value={value} onChange={onChange} placeholder={placeholder} rows={4} />
    ) : (
      <Input type={type} value={value} onChange={onChange} placeholder={placeholder} />
    )}
  </Field>
);

export const Pagination = ({ currentPage = 1, totalPages = 1, onPageChange }) => (
  <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
    <p className="text-[13px] text-ink-muted">
      Halaman <span className="font-mono font-medium text-ink">{currentPage}</span> dari <span className="font-mono font-medium text-ink">{totalPages}</span>
    </p>
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} leftIcon={<ChevronLeft size={15} />}>
        Sebelumnya
      </Button>
      <Button variant="secondary" size="sm" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} rightIcon={<ChevronRight size={15} />}>
        Berikutnya
      </Button>
    </div>
  </div>
);

export const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, confirmLabel = 'Konfirmasi', cancelLabel = 'Batal', tone = 'default' }) => (
  <Sheet
    open={isOpen}
    onClose={onCancel}
    title={title}
    description={message}
    tone={tone}
    size="sm"
    footer={(
      <>
        <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </>
    )}
  />
);

const STATUS_TONES = {
  active: 'success', delivered: 'success', read: 'success', completed: 'success', approved: 'success', resolved: 'success',
  pending: 'warning', open: 'warning', waiting: 'warning',
  inactive: 'danger', cancelled: 'danger', failed: 'danger', rejected: 'danger', suspended: 'danger',
};
export const StatusBadge = ({ status }) => {
  const s = String(status || '').toLowerCase();
  return <Badge tone={STATUS_TONES[s] || 'neutral'} dot>{status}</Badge>;
};
