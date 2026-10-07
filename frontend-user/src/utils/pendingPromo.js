import { useEffect, useRef } from 'react';

// "Pakai sekarang" on a home promo: the code is parked here and the service
// page it belongs to fills it in and checks it on open. Session storage so a
// detour (WiraFood list -> restaurant) keeps it; it expires after 30 minutes.
const KEY = 'wira_pending_promo';
const TTL_MS = 30 * 60 * 1000;

export function setPendingPromo(code, service) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ code, service, at: Date.now() }));
  } catch { /* private mode: the code is still copied */ }
}

function takePendingPromo(service) {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p?.code || Date.now() - p.at > TTL_MS) { sessionStorage.removeItem(KEY); return null; }
    if (p.service && p.service !== service) return null;
    sessionStorage.removeItem(KEY);
    return p.code;
  } catch {
    return null;
  }
}

/**
 * In a service page: fills the promo field with a parked code and runs the
 * page's own check once the field holds it and the page is `ready`.
 */
export function usePendingPromo(service, promoCode, setPromoCode, applyPromo, ready = true) {
  const pending = useRef(undefined);
  if (pending.current === undefined) pending.current = takePendingPromo(service);

  useEffect(() => {
    if (pending.current) setPromoCode(pending.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready && pending.current && promoCode === pending.current) {
      pending.current = null;
      applyPromo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoCode, ready]);
}
