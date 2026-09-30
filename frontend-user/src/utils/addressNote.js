// A landmark note ("pagar hijau, depan masjid") travels inside the address
// text of an order, because Wira Mitra shows orders.details / the ride
// pickup name to drivers and merchants as-is. Written in Indonesian like the
// rest of orders.details; localizeDbText renders the label per language.
export const NOTE_PREFIX = 'Patokan: ';

export function withAddressNote(address, note) {
  const n = (note || '').trim();
  return n ? `${address} (${NOTE_PREFIX}${n})` : address;
}
