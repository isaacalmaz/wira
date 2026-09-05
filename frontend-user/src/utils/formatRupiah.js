// =========================================
// 💰 FORMAT RUPIAH
// Mengubah angka menjadi format Rupiah
// Contoh: formatRupiah(25000) → "Rp 25.000"
// =========================================

export function formatRupiah(amount) {
  if (amount === null || amount === undefined) return 'Rp 0';
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

export default formatRupiah;

