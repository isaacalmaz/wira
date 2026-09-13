const fs = require('fs');
let ride = fs.readFileSync('frontend-user/src/pages/RidePage.jsx', 'utf8');

ride = ride.replace(
  /\(error\) => {\s*console\.error\(error\);\s*toast\.error\('Gagal mendapatkan lokasi\. Pastikan izin lokasi aktif\.', \{ id: toastId \}\);\s*},\s*\{ enableHighAccuracy: true \}/g,
  `(error) => {
        console.error("GPS Error:", error);
        let errorMsg = 'Gagal mendapatkan lokasi.';
        if (error.code === 1) errorMsg = 'Akses lokasi ditolak browser/sistem. Izinkan akses lokasi di pengaturan privasi Anda.';
        else if (error.code === 2) errorMsg = 'Sinyal lokasi tidak tersedia. Coba aktifkan Wi-Fi Anda (Desktop) atau nyalakan GPS (Mobile).';
        else if (error.code === 3) errorMsg = 'Pencarian lokasi timeout. Sinyal GPS lemah.';
        toast.error(errorMsg, { id: toastId, duration: 6000 });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }`
);
fs.writeFileSync('frontend-user/src/pages/RidePage.jsx', ride);

let map = fs.readFileSync('frontend-user/src/components/common/WiraMap.jsx', 'utf8');
map = map.replace(
  /\(err\) => {\s*console\.error\("Geolocation error:", err\);\s*}\s*\);\s*}\s*};/g,
  `(err) => {
          console.error("Geolocation error:", err);
          let errorMsg = 'Gagal mendapatkan lokasi.';
          if (err.code === 1) errorMsg = 'Akses lokasi ditolak browser/sistem. Izinkan akses lokasi di pengaturan privasi Anda.';
          else if (err.code === 2) errorMsg = 'Sinyal lokasi tidak tersedia. Coba aktifkan Wi-Fi Anda (Desktop) atau nyalakan GPS (Mobile).';
          else if (err.code === 3) errorMsg = 'Pencarian lokasi timeout.';
          alert(errorMsg);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    }
  };`
);
fs.writeFileSync('frontend-user/src/components/common/WiraMap.jsx', map);
