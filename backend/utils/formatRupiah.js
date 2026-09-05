// Format angka ke format Rupiah (Contoh: Rp 25.000)
const formatRupiah = (angka) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(angka);
};

module.exports = formatRupiah;
