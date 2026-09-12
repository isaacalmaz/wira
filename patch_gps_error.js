const fs = require('fs');
const path = 'frontend-user/src/pages/HomePage.jsx';
let content = fs.readFileSync(path, 'utf8');

const oldErrorBlock = `(err) => {
          console.error("GPS Error:", err);
          setLocationWarning('Izin lokasi ditolak atau tidak tersedia.');
          setUserZones([]);
          updateServices(flags, []);
          setIsLoadingLocation(false);
        }`;

const newErrorBlock = `(err) => {
          console.error("GPS Error:", err);
          let errMsg = 'Izin lokasi ditolak atau tidak tersedia.';
          if (err.code === 1) errMsg = 'Akses GPS ditolak oleh Browser atau Sistem Operasi Anda.';
          if (err.code === 2) errMsg = 'Sinyal GPS tidak tersedia (Coba nyalakan Wi-Fi Anda).';
          if (err.code === 3) errMsg = 'Waktu pencarian sinyal GPS habis (Timeout).';
          setLocationWarning(errMsg);
          setUserZones([]);
          updateServices(flags, []);
          setIsLoadingLocation(false);
        }`;

if (content.includes("setLocationWarning('Izin lokasi ditolak atau tidak tersedia.');")) {
    content = content.replace(oldErrorBlock, newErrorBlock);
    fs.writeFileSync(path, content);
    console.log('Error block patched!');
} else {
    console.log('Target string not found.');
}
