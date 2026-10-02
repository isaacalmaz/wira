const fs = require('fs');

// Patch HomePage.jsx
let home = fs.readFileSync('frontend-user/src/pages/HomePage.jsx', 'utf8');
const bannerJSX = `
      {/* Banner Download */}
      <section className="mb-4">
        <Link to="/install" className="flex w-full items-center justify-between rounded-xl bg-brand-soft px-4 py-3 text-brand-ink transition-colors hover:bg-brand-soft/80 border border-brand-line">
          <div className="flex flex-col">
            <span className="text-[13.5px] font-bold">Aplikasi Wira Tersedia!</span>
            <span className="text-[12px] opacity-90">Unduh untuk pengalaman terbaik</span>
          </div>
          <span className="rounded-full bg-brand-ink px-3 py-1 text-[11px] font-bold text-white">Unduh</span>
        </Link>
      </section>
`;

if (home.includes('{recentOrders.length > 0')) {
  home = home.replace(
    "{recentOrders.length > 0",
    bannerJSX + "\n      {recentOrders.length > 0"
  );
  fs.writeFileSync('frontend-user/src/pages/HomePage.jsx', home);
}

// Patch LoginPage.jsx
let login = fs.readFileSync('frontend-user/src/pages/LoginPage.jsx', 'utf8');
const loginBannerJSX = `
      <div className="mt-4 text-center text-[13px] text-ink-muted">
        <p>Aplikasi untuk Pelanggan & Mitra juga tersedia</p>
        <Link to="/install" className="inline-flex min-h-[32px] items-center font-bold text-brand hover:underline">Unduh Aplikasinya</Link>
      </div>
`;
if (!login.includes('Unduh Aplikasinya')) {
  login = login.replace(
    '</p>\n    </div>',
    '</p>\n' + loginBannerJSX + '\n    </div>'
  );
  fs.writeFileSync('frontend-user/src/pages/LoginPage.jsx', login);
}
