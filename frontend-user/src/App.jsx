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
import Layout from './components/layout/Layout';
import HomePage from './pages/HomePage';
import RidePage from './pages/RidePage';
import WalletPage from './pages/WalletPage';
import FoodPage from './pages/FoodPage';
import RestaurantPage from './pages/RestaurantPage';
import ProfilePage from './pages/ProfilePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OTPPage from './pages/OTPPage';
import NotificationsPage from './pages/NotificationsPage';
import ActivityPage from './pages/ActivityPage';
import ChatPage from './pages/ChatPage';
import SendPage from './pages/SendPage';
import PulsaPage from './pages/PulsaPage';
import VillaPage from './pages/VillaPage';
import ServicePage from './pages/ServicePage';
import PoolPage from './pages/PoolPage';

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
                      <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />
                        <Route path="/otp" element={<OTPPage />} />
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
