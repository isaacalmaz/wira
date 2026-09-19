import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';

import React, { Suspense, lazy } from 'react';

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

// This is the same admin-role set enforced server-side by Postgres RLS
// policies and RPCs across the project (see e.g. migrations/0022, 0024,
// 0025, 0026: `role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops')`).
// AdminSidebar.jsx's menuItems array defines a finer per-item `roles`
// tiering ('Admin Keuangan', 'CS', ...) purely for hiding/showing nav
// links, but none of those finer roles are ever checked by any RLS policy
// or RPC - only this 4-value set is a real, server-enforced admin
// boundary. Gating routes on the sidebar's cosmetic tiers instead would
// (a) lock real 'Admin Ops' admins out of pages the backend already lets
// them use (e.g. /finance, /whatsapp), and (b) let 'Admin Keuangan'/'CS'
// users past the route gate only to be rejected by the RPC anyway. So
// every admin route below uses this uniform, backend-matching set.
const ADMIN_ROLES = ['admin', 'Superadmin', 'superadmin', 'Admin Ops'];

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
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <UsersPage />
              </ProtectedRoute>
            } />
            <Route path="orders" element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <OrdersPage />
              </ProtectedRoute>
            } />
            <Route path="drivers" element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <DriversPage />
              </ProtectedRoute>
            } />
            <Route path="merchants" element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <MerchantsPage />
              </ProtectedRoute>
            } />
            <Route path="technicians" element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <TechniciansPage />
              </ProtectedRoute>
            } />
            <Route path="villas" element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <VillasPage />
              </ProtectedRoute>
            } />
            <Route path="pricing" element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <VehiclesPricingPage />
              </ProtectedRoute>
            } />
            <Route path="finance" element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <FinancePage />
              </ProtectedRoute>
            } />
            <Route path="promos" element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <PromosPage />
              </ProtectedRoute>
            } />
            <Route path="whatsapp" element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <WhatsAppPage />
              </ProtectedRoute>
            } />
            <Route path="settings" element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
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
