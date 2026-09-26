import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';

import { Suspense, lazy } from 'react';

// Layout
const AdminLayout = lazy(() => import('./components/layout/AdminLayout'));

// Pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const FeatureFlagsPage = lazy(() => import('./pages/FeatureFlagsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const DriversPage = lazy(() => import('./pages/DriversPage'));
const MerchantsPage = lazy(() => import('./pages/MerchantsPage'));
const TechniciansPage = lazy(() => import('./pages/TechniciansPage'));
const VillasPage = lazy(() => import('./pages/VillasPage'));
const VehiclesPricingPage = lazy(() => import('./pages/VehiclesPricingPage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const PromosPage = lazy(() => import('./pages/PromosPage'));
const WhatsAppPage = lazy(() => import('./pages/WhatsAppPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SupportTicketsPage = lazy(() => import('./pages/SupportTicketsPage'));

// Komponen untuk rute yang dilindungi
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // NOTE: this used to bounce to "/dashboard" as a softer fallback than
    // "/login", back when /dashboard itself had no role check. Now that
    // every admin route (including /dashboard) is gated, redirecting a
    // role-check failure to /dashboard would self-redirect forever for any
    // authenticated-but-non-admin user (e.g. a publicly self-registered
    // account) landing on /dashboard. /login is the only always-reachable,
    // unrestricted route, so it's the safe universal fallback here.
    return <Navigate to="/login" replace />;
  }

  return children;
};

// The 4 roles actually recognized by backend RLS policies / RPCs / is_admin()
// (see migrations/0022, 0024, 0025, 0026: `role IN ('admin', 'Superadmin',
// 'superadmin', 'Admin Ops')`). Verified against migrations/*.sql: neither
// 'CS' nor 'Admin Keuangan' appears in any RLS policy, RPC role check, or
// is_admin() definition anywhere in this repo - they are purely
// frontend-admin/AdminSidebar.jsx concepts today. That is a real backend
// gap (flagged for the coordinator - see PR notes), but it does not excuse
// the bug this route guard has: AdminSidebar.jsx already shows CS and Admin
// Keuangan a full nav (Dashboard, Users, Orders, Keuangan, WhatsApp, Pusat
// Bantuan), yet this constant - used as the blanket `allowedRoles` on nearly
// every route below - didn't include either role, so both roles logged in,
// saw a full sidebar, and got silently bounced to /login on every click,
// including landing on /dashboard itself.
//
// Fix: CORE_ADMIN_ROLES keeps the exact backend-verified 4-role set, for
// routes AdminSidebar.jsx does NOT promise to CS/Admin Keuangan (Drivers,
// Merchants, Technicians, Villas, Manajemen Harga, Promo, Settings) - so
// those two roles aren't blanket-granted pages the sidebar never shows
// them. ADMIN_ROLES adds CS + Admin Keuangan on top, for the routes the
// sidebar *does* promise them, using the narrowest role list that matches
// each page's sidebar entry (see AdminSidebar.jsx menuItems, ~line 83-96):
// Dashboard -> both, Users/Orders/WhatsApp/Support -> + CS only,
// Finance -> + Admin Keuangan only. Data on those pages is still gated by
// RLS to the backend-verified set until a migration adds these two roles
// there too - unblocking navigation here does not by itself unblock every
// query on those pages.
const CORE_ADMIN_ROLES = ['admin', 'Superadmin', 'superadmin', 'Admin Ops'];
const ADMIN_ROLES = [...CORE_ADMIN_ROLES, 'CS', 'Admin Keuangan'];
const CS_ADMIN_ROLES = [...CORE_ADMIN_ROLES, 'CS'];
const FINANCE_ADMIN_ROLES = [...CORE_ADMIN_ROLES, 'Admin Keuangan'];

function App() {
  return (
    <Router>
      <Toaster position="top-right" />
      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center"><div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div></div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          {/* Rute Admin dengan Layout Utama */}
          <Route path="/" element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <DashboardPage />
              </ProtectedRoute>
            } />

            {/* Fitur yang bisa diakses Superadmin & Admin Ops */}
            <Route path="features" element={
              <ProtectedRoute allowedRoles={['Superadmin', 'Admin Ops']}>
                <FeatureFlagsPage />
              </ProtectedRoute>
            } />

            <Route path="users" element={
              <ProtectedRoute allowedRoles={CS_ADMIN_ROLES}>
                <UsersPage />
              </ProtectedRoute>
            } />
            <Route path="orders" element={
              <ProtectedRoute allowedRoles={CS_ADMIN_ROLES}>
                <OrdersPage />
              </ProtectedRoute>
            } />
            <Route path="drivers" element={
              <ProtectedRoute allowedRoles={CORE_ADMIN_ROLES}>
                <DriversPage />
              </ProtectedRoute>
            } />
            <Route path="merchants" element={
              <ProtectedRoute allowedRoles={CORE_ADMIN_ROLES}>
                <MerchantsPage />
              </ProtectedRoute>
            } />
            <Route path="technicians" element={
              <ProtectedRoute allowedRoles={CORE_ADMIN_ROLES}>
                <TechniciansPage />
              </ProtectedRoute>
            } />
            <Route path="villas" element={
              <ProtectedRoute allowedRoles={CORE_ADMIN_ROLES}>
                <VillasPage />
              </ProtectedRoute>
            } />
            <Route path="pricing" element={
              <ProtectedRoute allowedRoles={CORE_ADMIN_ROLES}>
                <VehiclesPricingPage />
              </ProtectedRoute>
            } />
            <Route path="finance" element={
              <ProtectedRoute allowedRoles={FINANCE_ADMIN_ROLES}>
                <FinancePage />
              </ProtectedRoute>
            } />
            <Route path="promos" element={
              <ProtectedRoute allowedRoles={CORE_ADMIN_ROLES}>
                <PromosPage />
              </ProtectedRoute>
            } />
            <Route path="whatsapp" element={
              <ProtectedRoute allowedRoles={CS_ADMIN_ROLES}>
                <WhatsAppPage />
              </ProtectedRoute>
            } />
            <Route path="support" element={
              <ProtectedRoute allowedRoles={CS_ADMIN_ROLES}>
                <SupportTicketsPage />
              </ProtectedRoute>
            } />
            <Route path="settings" element={
              <ProtectedRoute allowedRoles={CORE_ADMIN_ROLES}>
                <SettingsPage />
              </ProtectedRoute>
            } />

          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
