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
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

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
            <Route path="dashboard" element={<DashboardPage />} />
            
            {/* Fitur yang bisa diakses Superadmin & Admin Ops */}
            <Route path="features" element={
              <ProtectedRoute allowedRoles={['Superadmin', 'Admin Ops']}>
                <FeatureFlagsPage />
              </ProtectedRoute>
            } />
            
            <Route path="users" element={<UsersPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="drivers" element={<DriversPage />} />
            <Route path="merchants" element={<MerchantsPage />} />
            <Route path="technicians" element={<TechniciansPage />} />
            <Route path="villas" element={<VillasPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="promos" element={<PromosPage />} />
            <Route path="whatsapp" element={<WhatsAppPage />} />
            <Route path="settings" element={<SettingsPage />} />
            
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
