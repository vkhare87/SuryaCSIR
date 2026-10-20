
import { lazy, Suspense } from 'react';
import { Routes, Route, HashRouter, Navigate, Outlet } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import SetupWizard from './pages/SetupWizard';
import ChangePassword from './pages/ChangePassword';
import { useAuth } from './contexts/AuthContext';
import { useFeatureControls } from './contexts/FeatureControlContext';
import { useUI } from './contexts/UIContext';
import { Monitor } from 'lucide-react';
import { EmptyState } from './components/ui/EmptyState';
import { isProvisioned } from './utils/supabaseClient';
import type { Role } from './types';
import { ROLE_ROUTES } from './constants/roleRoutes';
import { KpiSkeleton, TableSkeleton } from './components/ui/Skeleton';
import { VERIFIED } from './constants/access';

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
const ExploreGraph      = lazy(() => import('./pages/ExploreGraph'));
const Partnerships      = lazy(() => import('./pages/Partnerships'));
const RnDMonitor        = lazy(() => import('./pages/RnDMonitor'));
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
const EvaluationCommittees = lazy(() => import('./pages/pms/EvaluationCommittees'));
const PMSReports        = lazy(() => import('./pages/pms/Reports'));
const ReportNew         = lazy(() => import('./pages/pms/ReportNew'));
const ReportView        = lazy(() => import('./pages/pms/ReportView'));
const ReportEdit        = lazy(() => import('./pages/pms/ReportEdit'));
const AssignEvaluators  = lazy(() => import('./pages/pms/AssignEvaluators'));
const EvaluatorQueue    = lazy(() => import('./pages/pms/EvaluatorQueue'));
const EvaluateReport    = lazy(() => import('./pages/pms/EvaluateReport'));
const PMSGrievance      = lazy(() => import('./pages/pms/Grievance'));
const CommitteeQueue    = lazy(() => import('./pages/pms/CommitteeQueue'));
const PmsAuditLog       = lazy(() => import('./pages/pms/AuditLog'));
const TicketList        = lazy(() => import('./pages/helpdesk/TicketList'));
const TicketDetail      = lazy(() => import('./pages/helpdesk/TicketDetail'));
const TicketForm        = lazy(() => import('./pages/helpdesk/TicketForm'));
const IrinsSync         = lazy(() => import('./pages/IrinsSync'));
const RagMonitor        = lazy(() => import('./pages/RagMonitor'));
const AskSurya          = lazy(() => import('./pages/AskSurya'));
const HolidaysAdmin     = lazy(() => import('./pages/admin/HolidaysAdmin'));
const FeatureControlsAdmin = lazy(() => import('./pages/admin/FeatureControls'));
const Proposals         = lazy(() => import('./pages/proposals/Proposals'));
const ProposalForm      = lazy(() => import('./pages/proposals/ProposalForm'));
const ProposalDetail    = lazy(() => import('./pages/proposals/ProposalDetail'));
const ProjectReports    = lazy(() => import('./pages/reports/ProjectReports'));
const ProjectReportForm = lazy(() => import('./pages/reports/ProjectReportForm'));
const ProjectReportDetail = lazy(() => import('./pages/reports/ProjectReportDetail'));

function RouteFallback() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => <KpiSkeleton key={i} />)}
      </div>
      <TableSkeleton />
    </div>
  );
}

interface ProtectedRouteProps {
  /** Extra hard role list (role dashboards, Scientist-only create). Grants do not widen it. */
  allowedRoles?: Role[];
  /** ACCESS_MAP feature key — role access or a MasterAdmin grant, then runtime controls. */
  accessPath?: string;
  /** Heavy authoring / admin page: phones get an "open on desktop" card instead. */
  desktopOnly?: boolean;
  children?: React.ReactNode;
}

// Route Guard component
function ProtectedRoute({ allowedRoles, accessPath, desktopOnly, children }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const { canAccess } = useFeatureControls();
  const { isMobile } = useUI();
  const provisioned = isProvisioned();

  if (isLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-background text-text-muted">Loading SURYA Vault Data...</div>;
  }

  // If not provisioned, force setup wizard — unless user skipped to login or is already authenticated
  if (!provisioned && !isAuthenticated && window.location.hash !== '#/login') {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: window.location.hash }} />;
  }

  // Force password change before accessing any other route
  if (mustChangePassword && !window.location.hash.includes('/change-password')) {
    return <Navigate to="/change-password" replace />;
  }

  // MasterAdmin is the all-features profile and passes every role list.
  if (allowedRoles && user && user.activeRole !== 'MasterAdmin' && !allowedRoles.includes(user.activeRole)) {
    return <Navigate to={ROLE_ROUTES[user.activeRole]} replace />;
  }

  if (accessPath && user && !canAccess(accessPath)) {
    return <Navigate to={ROLE_ROUTES[user.activeRole]} replace />;
  }

  // Phones are for checking and approving; authoring and admin stay on desktop.
  if (desktopOnly && isMobile && user) {
    return (
      <EmptyState
        icon={Monitor}
        title="Open this page on a computer"
        description="This page has large forms or tables. Use SURYA on a desktop or laptop to work on it."
        action={{ label: 'Back to dashboard', to: ROLE_ROUTES[user.activeRole] }}
      />
    );
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
            <Route path="/staff" element={<ProtectedRoute accessPath="/staff"><HumanCapital /></ProtectedRoute>} />
            <Route path="/staff/analytics" element={<ProtectedRoute accessPath="/staff/analytics"><StaffAnalytics /></ProtectedRoute>} />
            <Route path="/staff/project" element={<ProtectedRoute accessPath="/staff/project"><ProjectStaffRoster /></ProtectedRoute>} />
            {/* Detail routes — linked from many pages; any verified role, RLS scopes the row */}
            <Route path="/staff/:id" element={<ProtectedRoute allowedRoles={VERIFIED}><StaffDetail /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute accessPath="/projects"><Projects /></ProtectedRoute>} />
            <Route path="/projects/:id" element={<ProtectedRoute allowedRoles={VERIFIED}><ProjectDetail /></ProtectedRoute>} />
            <Route path="/phd" element={<ProtectedRoute accessPath="/phd"><PhDTracker /></ProtectedRoute>} />
            <Route path="/divisions" element={<ProtectedRoute accessPath="/divisions"><Divisions /></ProtectedRoute>} />
            <Route path="/intelligence" element={<ProtectedRoute accessPath="/intelligence"><Intelligence /></ProtectedRoute>} />
            <Route path="/explore" element={<ProtectedRoute desktopOnly accessPath="/explore"><ExploreGraph /></ProtectedRoute>} />
            <Route path="/facilities" element={<ProtectedRoute accessPath="/facilities"><Facilities /></ProtectedRoute>} />
            <Route path="/partnerships" element={<ProtectedRoute accessPath="/partnerships"><Partnerships /></ProtectedRoute>} />
            <Route path="/rnd-monitor" element={<ProtectedRoute accessPath="/rnd-monitor"><RnDMonitor /></ProtectedRoute>} />
            <Route path="/facilities/:uInsID" element={<ProtectedRoute allowedRoles={VERIFIED}><InstrumentDetail /></ProtectedRoute>} />
            {/* Committee Management — specific routes first (Pitfall 6) */}
            <Route path="/committees/:id/meetings/:meetId" element={<ProtectedRoute accessPath="/committees"><MeetingDetail /></ProtectedRoute>} />
            <Route path="/committees/:id/meetings" element={<ProtectedRoute accessPath="/committees"><CommitteeDetail /></ProtectedRoute>} />
            <Route path="/committees/:id/actions" element={<ProtectedRoute accessPath="/committees"><CommitteeDetail /></ProtectedRoute>} />
            <Route path="/committees/:id" element={<ProtectedRoute accessPath="/committees"><CommitteeDetail /></ProtectedRoute>} />
            <Route path="/committees" element={<ProtectedRoute accessPath="/committees"><CommitteeList /></ProtectedRoute>} />
            {/* Helpdesk — specific routes first (Pitfall 6) */}
            <Route path="/helpdesk/new" element={<ProtectedRoute accessPath="/helpdesk"><TicketForm /></ProtectedRoute>} />
            <Route path="/helpdesk/:id" element={<ProtectedRoute accessPath="/helpdesk"><TicketDetail /></ProtectedRoute>} />
            <Route path="/helpdesk" element={<ProtectedRoute accessPath="/helpdesk"><TicketList /></ProtectedRoute>} />
            <Route path="/recruitment" element={<ProtectedRoute accessPath="/recruitment"><Recruitment /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute accessPath="/calendar"><Calendar /></ProtectedRoute>} />
            <Route path="/ask" element={<ProtectedRoute accessPath="/ask"><AskSurya /></ProtectedRoute>} />
            <Route path="/data" element={<ProtectedRoute desktopOnly accessPath="/data"><DataManagement /></ProtectedRoute>} />
            <Route path="/pms" element={<ProtectedRoute accessPath="/pms"><PMSIndex /></ProtectedRoute>} />
            <Route path="/pms/cycles" element={<ProtectedRoute desktopOnly accessPath="/pms/cycles"><PMSCycles /></ProtectedRoute>} />
            <Route path="/pms/evaluation-committees" element={<ProtectedRoute desktopOnly accessPath="/pms/evaluation-committees"><EvaluationCommittees /></ProtectedRoute>} />
            <Route path="/pms/collegiums" element={<Navigate to="/pms/evaluation-committees" replace />} />
            <Route path="/pms/reports" element={<ProtectedRoute accessPath="/pms"><PMSReports /></ProtectedRoute>} />
            <Route path="/pms/reports/new" element={<ProtectedRoute desktopOnly accessPath="/pms/reports/new"><ReportNew /></ProtectedRoute>} />
            <Route path="/pms/reports/:id" element={<ProtectedRoute accessPath="/pms"><ReportView /></ProtectedRoute>} />
            <Route path="/pms/reports/:id/edit" element={<ProtectedRoute desktopOnly accessPath="/pms/reports/new"><ReportEdit /></ProtectedRoute>} />
            <Route path="/pms/assign" element={<ProtectedRoute desktopOnly accessPath="/pms/assign"><AssignEvaluators /></ProtectedRoute>} />
            <Route path="/pms/evaluate" element={<ProtectedRoute accessPath="/pms"><EvaluatorQueue /></ProtectedRoute>} />
            <Route path="/pms/evaluate/:evaluationId" element={<ProtectedRoute accessPath="/pms"><EvaluateReport /></ProtectedRoute>} />
            <Route path="/pms/grievance" element={<ProtectedRoute accessPath="/pms"><PMSGrievance /></ProtectedRoute>} />
            <Route path="/pms/committee" element={<ProtectedRoute accessPath="/pms/committee"><CommitteeQueue /></ProtectedRoute>} />
            <Route path="/pms/audit" element={<ProtectedRoute accessPath="/pms/audit"><PmsAuditLog /></ProtectedRoute>} />
            <Route path="/db-wizard" element={<Navigate to="/data" replace />} />
            <Route path="/irins-sync" element={<ProtectedRoute desktopOnly accessPath="/irins-sync"><IrinsSync /></ProtectedRoute>} />
            <Route path="/admin/rag" element={<ProtectedRoute desktopOnly accessPath="/admin/rag"><RagMonitor /></ProtectedRoute>} />
            <Route path="/admin/holidays" element={<ProtectedRoute desktopOnly accessPath="/admin/holidays"><HolidaysAdmin /></ProtectedRoute>} />
            <Route path="/admin/access-requests" element={<ProtectedRoute accessPath="/admin/access-requests"><AccessRequests /></ProtectedRoute>} />
            <Route path="/admin/features" element={<ProtectedRoute desktopOnly accessPath="/admin/features"><FeatureControlsAdmin /></ProtectedRoute>} />
            {/* Project Proposals — specific routes first */}
            <Route path="/proposals/new" element={<ProtectedRoute desktopOnly allowedRoles={['Scientist']}><ProposalForm /></ProtectedRoute>} />
            <Route path="/proposals/:id/edit" element={<ProtectedRoute desktopOnly accessPath="/proposals"><ProposalForm /></ProtectedRoute>} />
            <Route path="/proposals/:id" element={<ProtectedRoute accessPath="/proposals"><ProposalDetail /></ProtectedRoute>} />
            <Route path="/proposals" element={<ProtectedRoute accessPath="/proposals"><Proposals /></ProtectedRoute>} />
            {/* Project Progress Reports — specific routes first */}
            <Route path="/reports/new" element={<ProtectedRoute desktopOnly accessPath="/reports/new"><ProjectReportForm /></ProtectedRoute>} />
            <Route path="/reports/:id/edit" element={<ProtectedRoute desktopOnly accessPath="/reports/new"><ProjectReportForm /></ProtectedRoute>} />
            <Route path="/reports/:id" element={<ProtectedRoute accessPath="/reports"><ProjectReportDetail /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute accessPath="/reports"><ProjectReports /></ProtectedRoute>} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
