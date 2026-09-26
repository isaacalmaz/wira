import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';

import MitraLayout from './components/layout/MitraLayout';

// Eager: LoginPage is the first screen for a logged-out mitra, and MitraLayout
// wraps every protected route, so both ship in the entry chunk. Every other
// page is lazy so drivers on mobile data don't download the whole app up front.
import LoginPage from './pages/LoginPage';
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const PendingVerificationPage = lazy(() => import('./pages/PendingVerificationPage'));
const UnauthorizedPage = lazy(() => import('./pages/UnauthorizedPage'));

const DriverHomePage = lazy(() => import('./pages/driver/DriverHomePage'));
const DriverOrdersPage = lazy(() => import('./pages/driver/DriverOrdersPage'));
const DriverEarningsPage = lazy(() => import('./pages/driver/DriverEarningsPage'));
const DriverProfilePage = lazy(() => import('./pages/driver/DriverProfilePage'));

const MerchantHomePage = lazy(() => import('./pages/merchant/MerchantHomePage'));
const MerchantOrdersPage = lazy(() => import('./pages/merchant/MerchantOrdersPage'));
const MerchantMenuPage = lazy(() => import('./pages/merchant/MerchantMenuPage'));
const MerchantEarningsPage = lazy(() => import('./pages/merchant/MerchantEarningsPage'));
const MerchantProfilePage = lazy(() => import('./pages/merchant/MerchantProfilePage'));
const VillaListingPage = lazy(() => import('./pages/merchant/VillaListingPage'));

const TechHomePage = lazy(() => import('./pages/technician/TechHomePage'));
const TechOrdersPage = lazy(() => import('./pages/technician/TechOrdersPage'));
const TechSchedulePage = lazy(() => import('./pages/technician/TechSchedulePage'));
const TechEarningsPage = lazy(() => import('./pages/technician/TechEarningsPage'));
const TechProfilePage = lazy(() => import('./pages/technician/TechProfilePage'));

const SettingsPage = lazy(() => import('./pages/shared/SettingsPage'));
const ActiveOrderPage = lazy(() => import('./pages/shared/ActiveOrderPage'));
const SupportPage = lazy(() => import('./pages/shared/SupportPage'));

const PageFallback = () => (
  <div className="flex h-screen w-full items-center justify-center">
    <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
  </div>
);

const ProtectedRoute = ({ children, allowedRole }) => {
  const { user, mitraAccess } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  if (!mitraAccess || mitraAccess.length === 0) {
    if (user.status === 'Pending') return <Navigate to="/pending-verification" replace />;
    return <Navigate to="/unauthorized" replace />;
  }
  
  // Periksa apakah pengguna memiliki hak akses untuk role URL ini
  if (!mitraAccess.includes(allowedRole)) {
    // Jika tidak punya akses ke halaman ini, arahkan ke akses pertama yang mereka miliki
    return <Navigate to={`/${mitraAccess[0]}`} replace />;
  }
  
  // Suspense inside the layout keeps the nav visible while a page chunk loads.
  return (
    <MitraLayout>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </MitraLayout>
  );
};

function App() {
  const { user, mitraAccess, loading } = useAuth();

  if (loading) return null;

  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={
            user ? (
              mitraAccess && mitraAccess.length > 0 ? <Navigate to={`/${mitraAccess[0]}`} /> :
              user.status === 'Pending' ? <Navigate to="/pending-verification" /> :
              <Navigate to="/unauthorized" />
            ) : <Navigate to="/login" />
          } />
        
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/pending-verification" element={<PendingVerificationPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
        
          <Route path="/driver/*" element={
            <ProtectedRoute allowedRole="driver">
              <Routes>
                <Route path="/" element={<DriverHomePage />} />
                <Route path="orders" element={<DriverOrdersPage />} />
                <Route path="earnings" element={<DriverEarningsPage />} />
                <Route path="profile" element={<DriverProfilePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="active-order/:id" element={<ActiveOrderPage />} />
                <Route path="support" element={<SupportPage />} />
              </Routes>
            </ProtectedRoute>
          } />

          <Route path="/merchant/*" element={
            <ProtectedRoute allowedRole="merchant">
              <Routes>
                <Route path="/" element={<MerchantHomePage />} />
                <Route path="orders" element={<MerchantOrdersPage />} />
                <Route path="menu" element={<MerchantMenuPage />} />
                <Route path="listing" element={<VillaListingPage />} />
                <Route path="earnings" element={<MerchantEarningsPage />} />
                <Route path="profile" element={<MerchantProfilePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="active-order/:id" element={<ActiveOrderPage />} />
                <Route path="support" element={<SupportPage />} />
              </Routes>
            </ProtectedRoute>
          } />

          {/* Villa is its own login portal now, separate from Restoran (merchant) -
              reuses the same Home/Orders/Earnings/Profile components as merchant,
              since they already branch on merchants.service_type internally (see
              isVillaOrder() in each) - only the "Menu" slot differs, pointing at
              VillaListingPage (single-row listing edit) instead of MerchantMenuPage
              (products CRUD list), which villa merchants don't need. */}
          <Route path="/villa/*" element={
            <ProtectedRoute allowedRole="villa">
              <Routes>
                <Route path="/" element={<MerchantHomePage />} />
                <Route path="orders" element={<MerchantOrdersPage />} />
                <Route path="listing" element={<VillaListingPage />} />
                <Route path="earnings" element={<MerchantEarningsPage />} />
                <Route path="profile" element={<MerchantProfilePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="active-order/:id" element={<ActiveOrderPage />} />
                <Route path="support" element={<SupportPage />} />
              </Routes>
            </ProtectedRoute>
          } />

          <Route path="/technician/*" element={
            <ProtectedRoute allowedRole="technician">
              <Routes>
                <Route path="/" element={<TechHomePage />} />
                <Route path="orders" element={<TechOrdersPage />} />
                <Route path="schedule" element={<TechSchedulePage />} />
                <Route path="earnings" element={<TechEarningsPage />} />
                <Route path="profile" element={<TechProfilePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="active-order/:id" element={<ActiveOrderPage />} />
                <Route path="support" element={<SupportPage />} />
              </Routes>
            </ProtectedRoute>
          } />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
