import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LangProvider } from './i18n';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { NotificationProvider } from './context/NotificationContext';
import { WalletProvider } from './context/WalletContext';
import { OrderProvider } from './context/OrderContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import { Suspense, lazy } from 'react';

const Layout = lazy(() => import('./components/layout/Layout'));
const DownloadPage = lazy(() => import('./pages/DownloadPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const RidePage = lazy(() => import('./pages/RidePage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));
const FoodPage = lazy(() => import('./pages/FoodPage'));
const RestaurantPage = lazy(() => import('./pages/RestaurantPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const EditProfilePage = lazy(() => import('./pages/EditProfilePage'));
const SavedAddressesPage = lazy(() => import('./pages/SavedAddressesPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const ActiveOrderPage = lazy(() => import('./pages/ActiveOrderPage'));
const SendPage = lazy(() => import('./pages/SendPage'));
const PulsaPage = lazy(() => import('./pages/PulsaPage'));
const VillaPage = lazy(() => import('./pages/VillaPage'));
const ServicePage = lazy(() => import('./pages/ServicePage'));
const PoolPage = lazy(() => import('./pages/PoolPage'));
const AsuhPage = lazy(() => import('./pages/AsuhPage'));
const TechnicianDirectoryPage = lazy(() => import('./pages/technicians/TechnicianDirectoryPage'));
const TechnicianProfilePage = lazy(() => import('./pages/technicians/TechnicianProfilePage'));
const MyProjectsPage = lazy(() => import('./pages/projects/MyProjectsPage'));
const NewProjectPage = lazy(() => import('./pages/projects/NewProjectPage'));
const ProjectDetailPage = lazy(() => import('./pages/projects/ProjectDetailPage'));
const ContactPage = lazy(() => import('./pages/legal/ContactPage'));
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const RefundPage = lazy(() => import('./pages/legal/RefundPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const DeleteAccountPage = lazy(() => import('./pages/legal/DeleteAccountPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

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
                      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-ground text-brand-ink"><div className="animate-spin h-8 w-8 border-2 border-current border-t-transparent rounded-full"></div></div>}>
                        <Routes>
                          {/* Pelanggan (User) Authentication */}
                          <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/install" element={<DownloadPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/hapus-akun" element={<DeleteAccountPage />} />
        <Route path="/delete-account" element={<Navigate to="/hapus-akun" replace />} />
        <Route path="/unduh" element={<Navigate to="/install" replace />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
                          <Route path="/register" element={<RegisterPage />} />

                          {/* Pelanggan (User) Main Layout & Services */}
                          <Route element={<Layout />}>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/ride" element={<RidePage />} />
                            <Route path="/wallet" element={<WalletPage />} />
                            <Route path="/food" element={<FoodPage />} />
                            <Route path="/restaurant/:id" element={<RestaurantPage />} />
                            <Route path="/profile" element={<ProfilePage />} />
                            <Route path="/profile/edit" element={<EditProfilePage />} />
                            <Route path="/profile/addresses" element={<SavedAddressesPage />} />
                            <Route path="/notifications" element={<NotificationsPage />} />
                            <Route path="/activity" element={<ActivityPage />} />
                            <Route path="/active-order/:id" element={<ActiveOrderPage />} />
                            <Route path="/send" element={<SendPage />} />
                            <Route path="/pulsa" element={<PulsaPage />} />
                            <Route path="/villa" element={<VillaPage />} />
                            <Route path="/service" element={<ServicePage />} />
                            <Route path="/pool" element={<PoolPage />} />
                            <Route path="/asuh" element={<AsuhPage />} />
                            <Route path="/technicians" element={<TechnicianDirectoryPage />} />
                            <Route path="/technicians/:id" element={<TechnicianProfilePage />} />
                            <Route path="/projects" element={<MyProjectsPage />} />
                            <Route path="/projects/new" element={<NewProjectPage />} />
                            <Route path="/projects/:id" element={<ProjectDetailPage />} />
                            
                            {/* Legal & Bantuan */}
                            <Route path="/support" element={<SupportPage />} />
                            <Route path="/contact" element={<ContactPage />} />
                            <Route path="/terms" element={<TermsPage />} />
                            <Route path="/refund" element={<RefundPage />} />
                          </Route>

                          {/* Fallback for any unmatched/stale route */}
                          <Route path="*" element={<NotFoundPage />} />
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
