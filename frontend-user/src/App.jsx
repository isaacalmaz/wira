import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LangProvider } from './i18n';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { NotificationProvider } from './context/NotificationContext';
import { WalletProvider } from './context/WalletContext';
import { OrderProvider } from './context/OrderContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import React, { Suspense, lazy } from 'react';

const Layout = lazy(() => import('./components/layout/Layout'));
const HomePage = lazy(() => import('./pages/HomePage'));
const RidePage = lazy(() => import('./pages/RidePage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));
const FoodPage = lazy(() => import('./pages/FoodPage'));
const RestaurantPage = lazy(() => import('./pages/RestaurantPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const OTPPage = lazy(() => import('./pages/OTPPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const SendPage = lazy(() => import('./pages/SendPage'));
const PulsaPage = lazy(() => import('./pages/PulsaPage'));
const VillaPage = lazy(() => import('./pages/VillaPage'));
const ServicePage = lazy(() => import('./pages/ServicePage'));
const PoolPage = lazy(() => import('./pages/PoolPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));

export default function Root() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LangProvider>
          <AuthProvider>
            <CartProvider>
              <NotificationProvider>
                <WalletProvider>
                  <OrderProvider>
                    <BrowserRouter>
                      <Toaster position="top-center" />
                      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center"><div className="text-lg text-slate-500">Memuat...</div></div>}>
                        <Routes>
                          {/* Pelanggan (User) Authentication */}
                          <Route path="/login" element={<LoginPage />} />
                          <Route path="/register" element={<RegisterPage />} />
                          <Route path="/otp" element={<OTPPage />} />
                          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />

                          {/* Pelanggan (User) Main Layout & Services */}
                          <Route element={<Layout />}>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/ride" element={<RidePage />} />
                            <Route path="/wallet" element={<WalletPage />} />
                            <Route path="/food" element={<FoodPage />} />
                            <Route path="/restaurant/:id" element={<RestaurantPage />} />
                            <Route path="/profile" element={<ProfilePage />} />
                            <Route path="/notifications" element={<NotificationsPage />} />
                            <Route path="/activity" element={<ActivityPage />} />
                            <Route path="/chat" element={<ChatPage />} />
                            <Route path="/send" element={<SendPage />} />
                            <Route path="/pulsa" element={<PulsaPage />} />
                            <Route path="/villa" element={<VillaPage />} />
                            <Route path="/service" element={<ServicePage />} />
                            <Route path="/pool" element={<PoolPage />} />
                          </Route>
                        </Routes>
                      </Suspense>
                    </BrowserRouter>
                  </OrderProvider>
                </WalletProvider>
              </NotificationProvider>
            </CartProvider>
          </AuthProvider>
        </LangProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
