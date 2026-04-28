
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
import ChangePassword from './pages/ChangePassword';
import PMSIndex from './pages/pms/Index';
import PMSCycles from './pages/pms/Cycles';
import PMSCollegiums from './pages/pms/Collegiums';
import PMSReports from './pages/pms/Reports';
import ReportNew from './pages/pms/ReportNew';
import ReportView from './pages/pms/ReportView';
import ReportEdit from './pages/pms/ReportEdit';
import { useAuth } from './contexts/AuthContext';
import { isProvisioned } from './utils/supabaseClient';
import type { Role } from './types';
import { ROLE_ROUTES } from './constants/roleRoutes';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
  children?: React.ReactNode;
}

// Route Guard component
function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading, mustChangePassword } = useAuth();
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

  // Force password change before accessing any other route
  if (mustChangePassword && !window.location.hash.includes('/change-password')) {
    return <Navigate to="/change-password" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.activeRole)) {
    return <Navigate to={ROLE_ROUTES[user.activeRole]} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<SetupWizard />} />
        <Route path="/change-password" element={<ChangePassword />} />
        
        {/* Protected Application Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/director"      element={<ProtectedRoute allowedRoles={['Director']}><Dashboard /></ProtectedRoute>} />
            <Route path="/division-head" element={<ProtectedRoute allowedRoles={['DivisionHead']}><Dashboard /></ProtectedRoute>} />
            <Route path="/hod"           element={<ProtectedRoute allowedRoles={['HOD']}><Dashboard /></ProtectedRoute>} />
            <Route path="/scientist"     element={<ProtectedRoute allowedRoles={['Scientist']}><Dashboard /></ProtectedRoute>} />
            <Route path="/technician"    element={<ProtectedRoute allowedRoles={['Technician']}><Dashboard /></ProtectedRoute>} />
            <Route path="/hr-admin"      element={<ProtectedRoute allowedRoles={['HRAdmin']}><Dashboard /></ProtectedRoute>} />
            <Route path="/finance-admin" element={<ProtectedRoute allowedRoles={['FinanceAdmin']}><Dashboard /></ProtectedRoute>} />
            <Route path="/system-admin"  element={<ProtectedRoute allowedRoles={['SystemAdmin']}><Dashboard /></ProtectedRoute>} />
            <Route path="/master-admin"  element={<ProtectedRoute allowedRoles={['MasterAdmin']}><Dashboard /></ProtectedRoute>} />
            <Route path="/student"       element={<ProtectedRoute allowedRoles={['Student']}><Dashboard /></ProtectedRoute>} />
            <Route path="/project-staff" element={<ProtectedRoute allowedRoles={['ProjectStaff']}><Dashboard /></ProtectedRoute>} />
            <Route path="/guest"         element={<ProtectedRoute allowedRoles={['Guest']}><Dashboard /></ProtectedRoute>} />
            <Route path="/pending"       element={<ProtectedRoute allowedRoles={['DefaultUser']}><Dashboard /></ProtectedRoute>} />
            <Route path="/staff" element={<HumanCapital />} />
            <Route path="/staff/:id" element={<StaffDetail />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/phd" element={<PhDTracker />} />
            <Route path="/divisions" element={<Divisions />} />
            <Route path="/intelligence" element={<Intelligence />} />
            <Route path="/facilities" element={<Facilities />} />
            <Route path="/recruitment" element={<ProtectedRoute allowedRoles={['HRAdmin', 'SystemAdmin', 'MasterAdmin']}><Recruitment /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
            <Route path="/data" element={<ProtectedRoute allowedRoles={['HRAdmin', 'SystemAdmin', 'MasterAdmin']}><DataManagement /></ProtectedRoute>} />
            <Route path="/pms" element={<ProtectedRoute allowedRoles={['Scientist','HOD','DivisionHead','Director','EmpoweredCommittee','HRAdmin','SystemAdmin','MasterAdmin']}><PMSIndex /></ProtectedRoute>} />
            <Route path="/pms/cycles" element={<ProtectedRoute allowedRoles={['HRAdmin','SystemAdmin','MasterAdmin']}><PMSCycles /></ProtectedRoute>} />
            <Route path="/pms/collegiums" element={<ProtectedRoute allowedRoles={['HRAdmin','SystemAdmin','MasterAdmin']}><PMSCollegiums /></ProtectedRoute>} />
            <Route path="/pms/reports" element={<ProtectedRoute><PMSReports /></ProtectedRoute>} />
            <Route path="/pms/reports/new" element={<ProtectedRoute allowedRoles={['Scientist','HOD','DivisionHead','Director']}><ReportNew /></ProtectedRoute>} />
            <Route path="/pms/reports/:id" element={<ProtectedRoute><ReportView /></ProtectedRoute>} />
            <Route path="/pms/reports/:id/edit" element={<ProtectedRoute allowedRoles={['Scientist','HOD','DivisionHead','Director']}><ReportEdit /></ProtectedRoute>} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
