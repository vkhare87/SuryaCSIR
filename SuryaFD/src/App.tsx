
import { Routes, Route, HashRouter, Navigate, Outlet } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import HumanCapital from './pages/HumanCapital';
import StaffDetail from './pages/StaffDetail';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import PhDTracker from './pages/PhDTracker';
import Divisions from './pages/Divisions';
import Intelligence from './pages/Intelligence';
import Facilities from './pages/Facilities';
import Recruitment from './pages/Recruitment';
import DataManagement from './pages/DataManagement';
import Calendar from './pages/Calendar';
import Login from './pages/Login';
import SetupWizard from './pages/SetupWizard';
import { useAuth } from './contexts/AuthContext';
import { isProvisioned } from './utils/supabaseClient';

interface ProtectedRouteProps {
  allowedRoles?: string[];
  children?: React.ReactNode;
}

// Route Guard component
function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const provisioned = isProvisioned();

  if (isLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-background text-text-muted">Loading SURYA Vault Data...</div>;
  }

  // If not provisioned, force setup wizard FIRST (unless they skipped it to run local)
  // We use a query param or hash to indicate "skip" (handled in SetupWizard)
  if (!provisioned && window.location.hash !== '#/login') {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<SetupWizard />} />
        
        {/* Protected Application Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/staff" element={<HumanCapital />} />
            <Route path="/staff/:id" element={<StaffDetail />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/phd" element={<PhDTracker />} />
            <Route path="/divisions" element={<Divisions />} />
            <Route path="/intelligence" element={<Intelligence />} />
            <Route path="/facilities" element={<Facilities />} />
            <Route path="/recruitment" element={<ProtectedRoute allowedRoles={['HRAdmin', 'SystemAdmin']}><Recruitment /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
            <Route path="/data" element={<ProtectedRoute allowedRoles={['SystemAdmin']}><DataManagement /></ProtectedRoute>} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
