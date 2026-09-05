// Konfigurasi harga untuk semua layanan (Mudah diubah, dalam Rupiah)
module.exports = {
  // Harga untuk layanan WiraRide (Ojek & Taksi Online)
  WiraRide: {
    bike: { base: 5000, perKm: 2500 }, // Motor
    car: { base: 10000, perKm: 4000 }, // Mobil standar
    carXL: { base: 15000, perKm: 5500 }, // Mobil besar (Kapasitas > 4)
    premium: { base: 25000, perKm: 8000 } // Mobil mewah
  },
  
  // Harga untuk layanan WiraSend (Kurir)
  WiraSend: {
    dokumen: { base: 8000, perKm: 2000 }, // Dokumen ringan
    kecil: { base: 12000, perKm: 2500 }, // Barang kecil
    sedang: { base: 18000, perKm: 3500 }, // Barang sedang
    besar: { base: 30000, perKm: 5000 } // Barang besar/berat
  },

  // Konfigurasi WiraFood (Pesan antar makanan)
  WiraFood: {
    deliveryPerKm: 3000, // Ongkir per kilometer
    minDeliveryFee: 5000, // Ongkir minimum
    serviceFeePercent: 5 // Biaya layanan (5% dari total pesanan)
  },

  // Konfigurasi WiraVilla (Sewa Villa)
  WiraVilla: {
    serviceFeePercent: 10 // Biaya platform (10% dari total sewa)
  },

  // Harga dasar untuk layanan WiraService (Tukang & Teknisi)
  WiraService: {
    AC: 75000, // Servis AC
    Listrik: 50000, // Perbaikan listrik
    Plumbing: 60000, // Saluran air/ledeng
    Tukang: 100000, // Tukang bangunan
    Elektronik: 80000, // Servis elektronik
    PestControl: 150000, // Pembasmi hama
    Cleaning: 100000 // Jasa bersih-bersih
  },

  // Harga untuk layanan WiraPool (Perawatan Kolam Renang)
  WiraPool: {
    cleaning: 200000, // Pembersihan standar
    treatment: 150000, // Pemberian obat air
    pump: 300000, // Servis pompa
    leak: 500000, // Tambal bocor
    renovation: 2000000, // Renovasi ringan
    monthlyPackage: 500000 // Paket bulanan
  },

  // Denominasi untuk WiraPulsa (Pembelian pulsa & PPOB)
  WiraPulsa: {
    denominations: [5000, 10000, 15000, 20000, 25000, 50000, 100000] // Pilihan nominal
  }
};
