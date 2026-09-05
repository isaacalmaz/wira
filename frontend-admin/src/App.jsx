import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';

// Layout
import AdminLayout from './components/layout/AdminLayout';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FeatureFlagsPage from './pages/FeatureFlagsPage';
import UsersPage from './pages/UsersPage';
import OrdersPage from './pages/OrdersPage';
import DriversPage from './pages/DriversPage';
import MerchantsPage from './pages/MerchantsPage';
import TechniciansPage from './pages/TechniciansPage';
import VillasPage from './pages/VillasPage';
import FinancePage from './pages/FinancePage';
import PromosPage from './pages/PromosPage';
import WhatsAppPage from './pages/WhatsAppPage';
import SettingsPage from './pages/SettingsPage';

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
    </Router>
  );
}

export default App;
