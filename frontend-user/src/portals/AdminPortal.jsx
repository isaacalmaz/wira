import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider as AdminAuthProvider, useAuth as useAdminAuth } from '@admin/context/AuthContext';
import { ThemeProvider as AdminThemeProvider } from '@admin/context/ThemeContext';

import AdminLayout from '@admin/components/layout/AdminLayout';
import LoginPage from '@admin/pages/LoginPage';
import DashboardPage from '@admin/pages/DashboardPage';
import FeatureFlagsPage from '@admin/pages/FeatureFlagsPage';
import UsersPage from '@admin/pages/UsersPage';
import OrdersPage from '@admin/pages/OrdersPage';
import DriversPage from '@admin/pages/DriversPage';
import MerchantsPage from '@admin/pages/MerchantsPage';
import TechniciansPage from '@admin/pages/TechniciansPage';
import VillasPage from '@admin/pages/VillasPage';
import FinancePage from '@admin/pages/FinancePage';
import PromosPage from '@admin/pages/PromosPage';
import WhatsAppPage from '@admin/pages/WhatsAppPage';
import SettingsPage from '@admin/pages/SettingsPage';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-cyan-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  if (!isAuthenticated && !user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
};

export default function AdminPortal() {
  return (
    <AdminAuthProvider>
      <AdminThemeProvider>
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="features" element={<FeatureFlagsPage />} />
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
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </AdminThemeProvider>
    </AdminAuthProvider>
  );
}
