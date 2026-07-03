
import { lazy, Suspense } from 'react';
import { Routes, Route, HashRouter, Navigate, Outlet } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import SetupWizard from './pages/SetupWizard';
import ChangePassword from './pages/ChangePassword';
import { useAuth } from './contexts/AuthContext';
import { isProvisioned } from './utils/supabaseClient';
import type { Role } from './types';
import { ROLE_ROUTES } from './constants/roleRoutes';
import { ACCESS_MAP } from './constants/access';

// Lazy-loaded routes — split into per-chunk bundles to keep the initial
// payload manageable. Heavy deps (@react-pdf, xlsx, recharts) live behind
// these boundaries.
const HumanCapital      = lazy(() => import('./pages/HumanCapital'));
const ProjectStaffRoster = lazy(() => import('./pages/ProjectStaffRoster'));
const StaffAnalytics    = lazy(() => import('./pages/StaffAnalytics'));
const StaffDetail       = lazy(() => import('./pages/StaffDetail'));
const Projects          = lazy(() => import('./pages/Projects'));
const ProjectDetail     = lazy(() => import('./pages/ProjectDetail'));
const PhDTracker        = lazy(() => import('./pages/PhDTracker'));
const Divisions         = lazy(() => import('./pages/Divisions'));
const Intelligence      = lazy(() => import('./pages/Intelligence'));
const Facilities        = lazy(() => import('./pages/Facilities'));
const InstrumentDetail  = lazy(() => import('./pages/InstrumentDetail'));
const CommitteeList     = lazy(() => import('./pages/committees/CommitteeList'));
const CommitteeDetail   = lazy(() => import('./pages/committees/CommitteeDetail'));
const MeetingDetail     = lazy(() => import('./pages/committees/MeetingDetail'));
const Recruitment       = lazy(() => import('./pages/Recruitment'));
const DataManagement    = lazy(() => import('./pages/DataManagement'));
const AccessRequests    = lazy(() => import('./pages/AccessRequests'));
const Calendar          = lazy(() => import('./pages/Calendar'));
const PMSIndex          = lazy(() => import('./pages/pms/Index'));
const PMSCycles         = lazy(() => import('./pages/pms/Cycles'));
const PMSCollegiums     = lazy(() => import('./pages/pms/Collegiums'));
const PMSReports        = lazy(() => import('./pages/pms/Reports'));
const ReportNew         = lazy(() => import('./pages/pms/ReportNew'));
const ReportView        = lazy(() => import('./pages/pms/ReportView'));
const ReportEdit        = lazy(() => import('./pages/pms/ReportEdit'));
const AssignEvaluators  = lazy(() => import('./pages/pms/AssignEvaluators'));
const EvaluatorQueue    = lazy(() => import('./pages/pms/EvaluatorQueue'));
const EvaluateReport    = lazy(() => import('./pages/pms/EvaluateReport'));
const ChairmanQueue     = lazy(() => import('./pages/pms/ChairmanQueue'));
const CommitteeQueue    = lazy(() => import('./pages/pms/CommitteeQueue'));
const PmsAuditLog       = lazy(() => import('./pages/pms/AuditLog'));
const TicketList        = lazy(() => import('./pages/helpdesk/TicketList'));
const TicketDetail      = lazy(() => import('./pages/helpdesk/TicketDetail'));
const TicketForm        = lazy(() => import('./pages/helpdesk/TicketForm'));
const IrinsSync         = lazy(() => import('./pages/IrinsSync'));
const RagMonitor        = lazy(() => import('./pages/RagMonitor'));
const HolidaysAdmin     = lazy(() => import('./pages/admin/HolidaysAdmin'));
const Proposals         = lazy(() => import('./pages/proposals/Proposals'));
const ProposalForm      = lazy(() => import('./pages/proposals/ProposalForm'));
const ProposalDetail    = lazy(() => import('./pages/proposals/ProposalDetail'));
const ProjectReports    = lazy(() => import('./pages/reports/ProjectReports'));
const ProjectReportForm = lazy(() => import('./pages/reports/ProjectReportForm'));
const ProjectReportDetail = lazy(() => import('./pages/reports/ProjectReportDetail'));

function RouteFallback() {
  return (
    <div className="min-h-[40vh] w-full flex items-center justify-center text-text-muted text-sm">
      Loading…
    </div>
  );
}

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

  // If not provisioned, force setup wizard — unless user skipped to login or is already authenticated
  if (!provisioned && !isAuthenticated && window.location.hash !== '#/login') {
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
            <Route element={<Suspense fallback={<RouteFallback />}><Outlet /></Suspense>}>
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
            <Route path="/staff" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/staff']}><HumanCapital /></ProtectedRoute>} />
            <Route path="/staff/analytics" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/staff/analytics']}><StaffAnalytics /></ProtectedRoute>} />
            <Route path="/staff/project" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/staff/project']}><ProjectStaffRoster /></ProtectedRoute>} />
            {/* Detail routes stay open — linked from ALL_ROLES pages (committees, PhD, facilities); RLS scopes data */}
            <Route path="/staff/:id" element={<StaffDetail />} />
            <Route path="/projects" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/projects']}><Projects /></ProtectedRoute>} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/phd" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/phd']}><PhDTracker /></ProtectedRoute>} />
            <Route path="/divisions" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/divisions']}><Divisions /></ProtectedRoute>} />
            <Route path="/intelligence" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/intelligence']}><Intelligence /></ProtectedRoute>} />
            <Route path="/facilities" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/facilities']}><Facilities /></ProtectedRoute>} />
            <Route path="/facilities/:uInsID" element={<InstrumentDetail />} />
            {/* Committee Management — specific routes first (Pitfall 6) */}
            <Route path="/committees/:id/meetings/:meetId" element={<MeetingDetail />} />
            <Route path="/committees/:id/meetings" element={<ProtectedRoute><CommitteeDetail /></ProtectedRoute>} />
            <Route path="/committees/:id/actions" element={<ProtectedRoute><CommitteeDetail /></ProtectedRoute>} />
            <Route path="/committees/:id" element={<ProtectedRoute><CommitteeDetail /></ProtectedRoute>} />
            <Route path="/committees" element={<ProtectedRoute><CommitteeList /></ProtectedRoute>} />
            {/* Helpdesk — specific routes first (Pitfall 6) */}
            <Route path="/helpdesk/new" element={<ProtectedRoute><TicketForm /></ProtectedRoute>} />
            <Route path="/helpdesk/:id" element={<ProtectedRoute><TicketDetail /></ProtectedRoute>} />
            <Route path="/helpdesk" element={<ProtectedRoute><TicketList /></ProtectedRoute>} />
            <Route path="/recruitment" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/recruitment']}><Recruitment /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
            <Route path="/data" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/data']}><DataManagement /></ProtectedRoute>} />
            <Route path="/pms" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/pms']}><PMSIndex /></ProtectedRoute>} />
            <Route path="/pms/cycles" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/pms/cycles']}><PMSCycles /></ProtectedRoute>} />
            <Route path="/pms/collegiums" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/pms/collegiums']}><PMSCollegiums /></ProtectedRoute>} />
            <Route path="/pms/reports" element={<ProtectedRoute><PMSReports /></ProtectedRoute>} />
            <Route path="/pms/reports/new" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/pms/reports/new']}><ReportNew /></ProtectedRoute>} />
            <Route path="/pms/reports/:id" element={<ProtectedRoute><ReportView /></ProtectedRoute>} />
            <Route path="/pms/reports/:id/edit" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/pms/reports/new']}><ReportEdit /></ProtectedRoute>} />
            <Route path="/pms/assign" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/pms/assign']}><AssignEvaluators /></ProtectedRoute>} />
            <Route path="/pms/evaluate" element={<ProtectedRoute><EvaluatorQueue /></ProtectedRoute>} />
            <Route path="/pms/evaluate/:evaluationId" element={<ProtectedRoute><EvaluateReport /></ProtectedRoute>} />
            <Route path="/pms/chairman" element={<ProtectedRoute><ChairmanQueue /></ProtectedRoute>} />
            <Route path="/pms/committee" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/pms/committee']}><CommitteeQueue /></ProtectedRoute>} />
            <Route path="/pms/audit" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/pms/audit']}><PmsAuditLog /></ProtectedRoute>} />
            <Route path="/db-wizard" element={<Navigate to="/data" replace />} />
            <Route path="/irins-sync" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/irins-sync']}><IrinsSync /></ProtectedRoute>} />
            <Route path="/admin/rag" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/admin/rag']}><RagMonitor /></ProtectedRoute>} />
            <Route path="/admin/holidays" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/admin/holidays']}><HolidaysAdmin /></ProtectedRoute>} />
            <Route path="/admin/access-requests" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/admin/access-requests']}><AccessRequests /></ProtectedRoute>} />
            {/* Project Proposals — specific routes first */}
            <Route path="/proposals/new" element={<ProtectedRoute allowedRoles={['Scientist']}><ProposalForm /></ProtectedRoute>} />
            <Route path="/proposals/:id/edit" element={<ProtectedRoute><ProposalForm /></ProtectedRoute>} />
            <Route path="/proposals/:id" element={<ProtectedRoute><ProposalDetail /></ProtectedRoute>} />
            <Route path="/proposals" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/proposals']}><Proposals /></ProtectedRoute>} />
            {/* Project Progress Reports — specific routes first */}
            <Route path="/reports/new" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/reports/new']}><ProjectReportForm /></ProtectedRoute>} />
            <Route path="/reports/:id/edit" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/reports/new']}><ProjectReportForm /></ProtectedRoute>} />
            <Route path="/reports/:id" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/reports']}><ProjectReportDetail /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute allowedRoles={ACCESS_MAP['/reports']}><ProjectReports /></ProtectedRoute>} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
