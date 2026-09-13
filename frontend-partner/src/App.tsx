import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DriverModePage from './pages/DriverModePage';
import MerchantModePage from './pages/MerchantModePage';

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/driver" element={<DriverModePage />} />
        <Route path="/merchant" element={<MerchantModePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
