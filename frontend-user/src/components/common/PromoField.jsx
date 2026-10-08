import { Button, Field, Input, Notice } from '../ui';
import { useTranslation } from '../../i18n';

/**
 * Promo code entry used by every booking screen: an input with "Pakai",
 * or a success notice with "Hapus" once a code is applied. Enter applies
 * the code instead of submitting the surrounding booking form.
 */
export default function PromoField({ id, activePromo, promoCode, setPromoCode, onApply, onRemove, checking, error }) {
  const { t } = useTranslation();
  if (activePromo) {
    return (
      <Notice
        tone="success"
        action={
          <Button variant="ghost" size="sm" onClick={onRemove} className="-my-1.5">
            {t('common.remove')}
          </Button>
        }
      >
        {t('promo.applied', { code: activePromo.code })}
      </Notice>
    );
  }
  return (
    <Field label={t('promo.placeholder')} htmlFor={id} error={error || undefined}>
      <div className="flex gap-2">
        <Input
          id={id}
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!checking && promoCode.trim()) onApply();
            }
          }}
          invalid={!!error}
          autoCapitalize="characters"
          className="min-w-0 flex-1 font-mono uppercase"
        />
        <Button
          variant="secondary"
          onClick={onApply}
          disabled={checking || !promoCode.trim()}
          isLoading={checking}
          className="shrink-0"
        >
          {checking ? t('promo.checking') : t('promo.apply')}
        </Button>
      </div>
    </Field>
  );
}
