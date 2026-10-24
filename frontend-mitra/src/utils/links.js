// Notification links written by the database (notifications.link) are not
// always portal paths: some are role-less ("/earnings", "/notifications"),
// some name a portal this account doesn't have (a villa host gets
// "/merchant/orders"), and universal order links ("/active-order/:id").
// Resolve them to the page this partner can open under their portal.
const PORTALS = ['driver', 'merchant', 'villa', 'technician', 'nanny'];
const SIBLING = { merchant: 'villa', villa: 'merchant' };

export function resolvePartnerLink(link, mitraAccess = [], currentRole = null) {
  const access = Array.isArray(mitraAccess) ? mitraAccess : [];
  const home = currentRole && access.includes(currentRole) ? currentRole : access[0];
  if (!home) return '/';
  if (!link || typeof link !== 'string' || !link.startsWith('/')) return `/${home}`;

  const [first, ...rest] = link.split('?')[0].split('/').filter(Boolean);
  if (PORTALS.includes(first)) {
    const role = access.includes(first) ? first : access.includes(SIBLING[first]) ? SIBLING[first] : home;
    return `/${[role, ...rest].join('/')}`;
  }
  if (['earnings', 'orders', 'notifications', 'profile', 'settings', 'support'].includes(first)) {
    return `/${home}/${first}`;
  }
  if (first === 'active-order' || first === 'order') {
    return `/${home}/active-order${rest.length ? '/' + rest.join('/') : ''}`;
  }
  if (first === 'projects') {
    return `/technician/projects${rest.length ? '/' + rest.join('/') : ''}`;
  }
  return `/${home}`;
}

