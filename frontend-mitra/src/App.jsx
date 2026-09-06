import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';

import MitraLayout from './components/layout/MitraLayout';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PendingVerificationPage from './pages/PendingVerificationPage';
import ChatPage from './pages/ChatPage';
import UnauthorizedPage from './pages/UnauthorizedPage';

import DriverHomePage from './pages/driver/DriverHomePage';
import DriverOrdersPage from './pages/driver/DriverOrdersPage';
import DriverEarningsPage from './pages/driver/DriverEarningsPage';
import DriverProfilePage from './pages/driver/DriverProfilePage';

import MerchantHomePage from './pages/merchant/MerchantHomePage';
import MerchantOrdersPage from './pages/merchant/MerchantOrdersPage';
import MerchantMenuPage from './pages/merchant/MerchantMenuPage';
import MerchantEarningsPage from './pages/merchant/MerchantEarningsPage';
import MerchantProfilePage from './pages/merchant/MerchantProfilePage';

import TechHomePage from './pages/technician/TechHomePage';
import TechOrdersPage from './pages/technician/TechOrdersPage';
import TechSchedulePage from './pages/technician/TechSchedulePage';
import TechEarningsPage from './pages/technician/TechEarningsPage';
import TechProfilePage from './pages/technician/TechProfilePage';

const ProtectedRoute = ({ children, allowedRole }) => {
  const { user, role } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role !== allowedRole) {
    if (role === 'driver') return <Navigate to="/driver" replace />;
    if (role === 'merchant') return <Navigate to="/merchant" replace />;
    if (role === 'technician') return <Navigate to="/technician" replace />;
    return <Navigate to="/unauthorized" replace />;
  }
  return <MitraLayout>{children}</MitraLayout>;
};

function App() {
  const { user, role } = useAuth();

  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/" element={
          user ? (
            role === 'driver' ? <Navigate to="/driver" /> :
            role === 'merchant' ? <Navigate to="/merchant" /> :
            role === 'technician' ? <Navigate to="/technician" /> :
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
              <Route path="chat" element={<ChatPage />} />
              <Route path="profile" element={<DriverProfilePage />} />
            </Routes>
          </ProtectedRoute>
        } />
        
        <Route path="/merchant/*" element={
          <ProtectedRoute allowedRole="merchant">
            <Routes>
              <Route path="/" element={<MerchantHomePage />} />
              <Route path="orders" element={<MerchantOrdersPage />} />
              <Route path="menu" element={<MerchantMenuPage />} />
              <Route path="earnings" element={<MerchantEarningsPage />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="profile" element={<MerchantProfilePage />} />
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
              <Route path="chat" element={<ChatPage />} />
              <Route path="profile" element={<TechProfilePage />} />
            </Routes>
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
