# 📖 Cara Menambah Menu Restoran

Panduan ini menjelaskan cara menambah, mengubah, dan menghapus menu restoran di Wira.

## 🍔 Untuk Merchant (Pemilik Restoran)

### Login ke Dashboard Mitra

1. Buka Dashboard Mitra di browser
2. Login dengan akun merchant Anda
3. Klik menu **Kelola Menu** di navigasi bawah

### Menambah Menu Baru

1. Di halaman Kelola Menu, klik tombol **+ Tambah Menu**
2. Isi form:
   - **Nama menu**: contoh "Ayam Taliwang Bakar"
   - **Kategori**: pilih dari dropdown (Makanan Utama, Lauk, Minuman, Dessert)
   - **Harga**: contoh 35000 (tanpa titik, dalam Rupiah)
   - **Deskripsi**: contoh "Ayam bakar khas Lombok dengan bumbu pedas"
   - **Foto**: upload foto menu (opsional)
3. Klik **Simpan**

### Mengubah Menu

1. Di daftar menu, klik tombol **✏️ Edit** pada menu yang ingin diubah
2. Ubah informasi yang diperlukan
3. Klik **Simpan**

### Menandai Menu Habis

1. Di daftar menu, klik toggle **Tersedia/Habis** pada menu
2. Menu yang ditandai "Habis" tidak akan muncul di aplikasi pengguna

### Menghapus Menu

1. Klik tombol **🗑️ Hapus** pada menu
2. Konfirmasi penghapusan

## 👨‍💼 Untuk Admin

### Menambah Restoran Baru (via Admin Dashboard)

1. Login ke Admin Dashboard
2. Buka halaman **Merchants**
3. Verifikasi merchant baru yang mendaftar
4. Setelah diverifikasi, merchant bisa login dan kelola menu sendiri

### Menambah Menu via Database (Advanced)

Jika perlu menambah menu langsung ke database, tambahkan data di tabel `menu_items`:

```sql
INSERT INTO menu_items (restaurant_id, name, category, price, description, is_available)
VALUES (
  'id-restoran',
  'Ayam Taliwang Spesial',
  'Makanan Utama',
  35000,
  'Ayam bakar bumbu pedas khas Lombok',
  true
);
```

## 📝 Tips

- Gunakan foto berkualitas baik untuk menarik pelanggan
- Pastikan harga sudah termasuk pajak
- Update stok/ketersediaan menu secara rutin
- Kategori menu yang tersedia: Makanan Utama, Lauk, Minuman, Dessert, Snack
