import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider as MitraAuthProvider, useAuth as useMitraAuth } from '@mitra/context/AuthContext';

import MitraLayout from '@mitra/components/layout/MitraLayout';
import LoginPage from '@mitra/pages/LoginPage';
import RegisterPage from '@mitra/pages/RegisterPage';
import PendingVerificationPage from '@mitra/pages/PendingVerificationPage';
import UnauthorizedPage from '@mitra/pages/UnauthorizedPage';
import ChatPage from '@mitra/pages/ChatPage';

// Driver Pages
import DriverHomePage from '@mitra/pages/driver/DriverHomePage';
import DriverOrdersPage from '@mitra/pages/driver/DriverOrdersPage';
import DriverEarningsPage from '@mitra/pages/driver/DriverEarningsPage';
import DriverProfilePage from '@mitra/pages/driver/DriverProfilePage';

// Merchant Pages
import MerchantHomePage from '@mitra/pages/merchant/MerchantHomePage';
import MerchantOrdersPage from '@mitra/pages/merchant/MerchantOrdersPage';
import MerchantMenuPage from '@mitra/pages/merchant/MerchantMenuPage';
import MerchantEarningsPage from '@mitra/pages/merchant/MerchantEarningsPage';
import MerchantProfilePage from '@mitra/pages/merchant/MerchantProfilePage';

// Technician Pages
import TechHomePage from '@mitra/pages/technician/TechHomePage';
import TechOrdersPage from '@mitra/pages/technician/TechOrdersPage';
import TechSchedulePage from '@mitra/pages/technician/TechSchedulePage';
import TechEarningsPage from '@mitra/pages/technician/TechEarningsPage';
import TechProfilePage from '@mitra/pages/technician/TechProfilePage';

const ProtectedRoute = ({ children, allowedRole }) => {
  const { user, mitraAccess, loading } = useMitraAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-amber-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/mitra/login" replace />;
  }

  // Jika allowedRole diberikan, periksa akses mitra (default demo user punya akses ke driver, merchant, technician)
  if (allowedRole && mitraAccess && mitraAccess.length > 0 && !mitraAccess.includes(allowedRole)) {
    return <Navigate to={`/mitra/${mitraAccess[0]}`} replace />;
  }

  return <MitraLayout>{children}</MitraLayout>;
};

export default function MitraPortal() {
  return (
    <MitraAuthProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="pending-verification" element={<PendingVerificationPage />} />
        <Route path="unauthorized" element={<UnauthorizedPage />} />

        {/* Driver Sub-Routes */}
        <Route
          path="driver"
          element={
            <ProtectedRoute allowedRole="driver">
              <DriverHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="driver/orders"
          element={
            <ProtectedRoute allowedRole="driver">
              <DriverOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="driver/earnings"
          element={
            <ProtectedRoute allowedRole="driver">
              <DriverEarningsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="driver/chat"
          element={
            <ProtectedRoute allowedRole="driver">
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="driver/profile"
          element={
            <ProtectedRoute allowedRole="driver">
              <DriverProfilePage />
            </ProtectedRoute>
          }
        />

        {/* Merchant Sub-Routes */}
        <Route
          path="merchant"
          element={
            <ProtectedRoute allowedRole="merchant">
              <MerchantHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="merchant/orders"
          element={
            <ProtectedRoute allowedRole="merchant">
              <MerchantOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="merchant/menu"
          element={
            <ProtectedRoute allowedRole="merchant">
              <MerchantMenuPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="merchant/earnings"
          element={
            <ProtectedRoute allowedRole="merchant">
              <MerchantEarningsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="merchant/chat"
          element={
            <ProtectedRoute allowedRole="merchant">
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="merchant/profile"
          element={
            <ProtectedRoute allowedRole="merchant">
              <MerchantProfilePage />
            </ProtectedRoute>
          }
        />

        {/* Technician Sub-Routes */}
        <Route
          path="technician"
          element={
            <ProtectedRoute allowedRole="technician">
              <TechHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="technician/orders"
          element={
            <ProtectedRoute allowedRole="technician">
              <TechOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="technician/schedule"
          element={
            <ProtectedRoute allowedRole="technician">
              <TechSchedulePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="technician/earnings"
          element={
            <ProtectedRoute allowedRole="technician">
              <TechEarningsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="technician/chat"
          element={
            <ProtectedRoute allowedRole="technician">
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="technician/profile"
          element={
            <ProtectedRoute allowedRole="technician">
              <TechProfilePage />
            </ProtectedRoute>
          }
        />

        {/* Index fallback to driver */}
        <Route index element={<Navigate to="driver" replace />} />
        <Route path="*" element={<Navigate to="driver" replace />} />
      </Routes>
    </MitraAuthProvider>
  );
}
