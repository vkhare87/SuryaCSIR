import { lazy, Suspense, type ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MyActions } from '../components/MyActions';
import { DataHealthDigest } from '../components/DataHealthDigest';
import { StartIdeaCard } from '../components/proposals/StartIdeaCard';
import { HomeProvider } from '../contexts/HomeContext';
import { CommonDesk } from '../components/home/CommonDesk';
import { KpiSkeleton, TableSkeleton } from '../components/ui/Skeleton';

const DirectorView           = lazy(() => import('./dashboards/DirectorView').then(m => ({ default: m.DirectorView })));
const DivisionHeadView       = lazy(() => import('./dashboards/DivisionHeadView').then(m => ({ default: m.DivisionHeadView })));
const HoDView                = lazy(() => import('./dashboards/HoDView').then(m => ({ default: m.HoDView })));
const ScientistView          = lazy(() => import('./dashboards/ScientistView').then(m => ({ default: m.ScientistView })));
const TechnicianView         = lazy(() => import('./dashboards/TechnicianView').then(m => ({ default: m.TechnicianView })));
const HRAdminView            = lazy(() => import('./dashboards/HRAdminView').then(m => ({ default: m.HRAdminView })));
const FinanceAdminView       = lazy(() => import('./dashboards/FinanceAdminView').then(m => ({ default: m.FinanceAdminView })));
const SystemAdminView        = lazy(() => import('./dashboards/SystemAdminView').then(m => ({ default: m.SystemAdminView })));
const MasterAdminView        = lazy(() => import('./dashboards/MasterAdminView').then(m => ({ default: m.MasterAdminView })));
const StudentView            = lazy(() => import('./dashboards/StudentView').then(m => ({ default: m.StudentView })));
const ProjectStaffView       = lazy(() => import('./dashboards/ProjectStaffView').then(m => ({ default: m.ProjectStaffView })));
const GuestView              = lazy(() => import('./dashboards/GuestView').then(m => ({ default: m.GuestView })));
const PendingAccessView      = lazy(() => import('./dashboards/PendingAccessView').then(m => ({ default: m.PendingAccessView })));
const EmpoweredCommitteeView = lazy(() => import('./dashboards/EmpoweredCommitteeView').then(m => ({ default: m.EmpoweredCommitteeView })));
const PMEView                = lazy(() => import('./dashboards/PMEView').then(m => ({ default: m.PMEView })));

function ViewFallback() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => <KpiSkeleton key={i} />)}
      </div>
      <TableSkeleton />
    </div>
  );
}

export default function Dashboard() {
  const { activeRole } = useAuth();

  // Two halves: the role's own view on the left, the common desk on the right.
  // Below xl the desk moves under the role half.
  const twoHalves = (roleHalf: ReactNode) => (
    <HomeProvider>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <div className="space-y-6 min-w-0">{roleHalf}</div>
        <CommonDesk />
      </div>
    </HomeProvider>
  );
  // Unified pending-actions inbox above every working-role dashboard.
  const withActions = (view: ReactNode) => twoHalves(
    <>
      <MyActions />
      {/* Renders nothing for roles that cannot author a proposal. */}
      <StartIdeaCard />
      <DataHealthDigest />
      <Suspense fallback={<ViewFallback />}>{view}</Suspense>
    </>,
  );
  // A role-first home: the screen itself ranks the open items, so no inbox card above it.
  const home = (view: ReactNode) => twoHalves(
    <>
      <Suspense fallback={<ViewFallback />}>{view}</Suspense>
      <DataHealthDigest />
    </>,
  );

  switch (activeRole) {
    case 'Director':     return home(<DirectorView />);
    case 'DivisionHead': return home(<DivisionHeadView />);
    case 'HOD':          return home(<HoDView />);
    case 'Scientist':    return home(<ScientistView />);
    case 'Technician':   return home(<TechnicianView />);
    case 'HRAdmin':      return withActions(<HRAdminView />);
    case 'FinanceAdmin': return withActions(<FinanceAdminView />);
    case 'SystemAdmin':  return withActions(<SystemAdminView />);
    case 'MasterAdmin':  return withActions(<MasterAdminView />);
    case 'Student':      return home(<StudentView />);
    case 'ProjectStaff': return home(<ProjectStaffView />);
    case 'Guest':        return <Suspense fallback={<ViewFallback />}><GuestView /></Suspense>;
    case 'DefaultUser':         return <Suspense fallback={<ViewFallback />}><PendingAccessView /></Suspense>;
    case 'EmpoweredCommittee':  return withActions(<EmpoweredCommitteeView />);
    case 'PME':                 return withActions(<PMEView />);
    default:
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-[#87867f]">
          <p className="text-sm font-medium">No dashboard assigned for this account.</p>
          <p className="text-xs">Contact your System Admin to assign a role.</p>
        </div>
      );
  }
}
