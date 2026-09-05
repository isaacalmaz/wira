# 📖 Cara Mengubah Harga Layanan Wira

Panduan ini menjelaskan cara mengubah harga semua layanan di aplikasi Wira.

## 📍 Lokasi File

Semua harga ada di SATU file saja:
```
backend/config/pricing.js
```

## 🚗 Mengubah Harga WiraRide

Buka file `backend/config/pricing.js`, cari bagian `wiraRide`:

```js
wiraRide: {
  bike:    { baseFare: 5000,  perKm: 2500 },   // Ojek motor
  car:     { baseFare: 10000, perKm: 4000 },   // Mobil standar
  carXL:   { baseFare: 15000, perKm: 5500 },   // Mobil besar
  premium: { baseFare: 25000, perKm: 8000 },   // Mobil premium
},
```

- `baseFare` = harga awal (dalam Rupiah)
- `perKm` = harga per kilometer

**Contoh**: Jika ingin naikkan harga ojek motor jadi Rp 7.000 + Rp 3.000/km:
```js
bike: { baseFare: 7000, perKm: 3000 },
```

## 🍔 Mengubah Harga WiraFood

```js
wiraFood: {
  deliveryPerKm: 3000,        // Ongkir per km
  minDeliveryFee: 5000,       // Minimum ongkir
  serviceFeePercent: 5,       // Biaya layanan (5% dari subtotal)
},
```

## 📦 Mengubah Harga WiraSend

```js
wiraSend: {
  dokumen: { baseFare: 8000,  perKm: 2000 },   // Dokumen/surat
  kecil:   { baseFare: 12000, perKm: 2500 },   // Paket kecil
  sedang:  { baseFare: 18000, perKm: 3500 },   // Paket sedang
  besar:   { baseFare: 30000, perKm: 5000 },   // Paket besar
},
```

## 🔧 Mengubah Harga WiraService

```js
wiraService: {
  ac:          { basePrice: 75000 },    // Service AC
  listrik:     { basePrice: 50000 },    // Instalasi listrik
  plumbing:    { basePrice: 60000 },    // Pipa & saluran air
  tukang:      { basePrice: 100000 },   // Tukang bangunan
  elektronik:  { basePrice: 80000 },    // Service elektronik
  pestControl: { basePrice: 150000 },   // Basmi hama
  cleaning:    { basePrice: 100000 },   // Bersih rumah
},
```

## 🏊 Mengubah Harga WiraPool

```js
wiraPool: {
  cleaning:       200000,     // Pembersihan rutin
  treatment:      150000,     // Treatment air
  pump:           300000,     // Perbaikan pompa
  leak:           500000,     // Perbaikan kebocoran
  renovation:     2000000,    // Renovasi kolam
  monthlyPackage: 500000,     // Paket bulanan
},
```

## 📱 Mengubah Harga WiraPulsa

```js
wiraPulsa: {
  denominations: [5000, 10000, 15000, 20000, 25000, 50000, 100000],
},
```

## ⚠️ Penting!

- Setelah mengubah harga, **restart** backend server
- Semua harga dalam satuan **Rupiah (tanpa titik atau koma)**
- Contoh: Rp 25.000 ditulis sebagai `25000`
