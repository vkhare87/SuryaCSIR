import { useAuth } from '../contexts/AuthContext';
import { DirectorView }       from './dashboards/DirectorView';
import { DivisionHeadView }   from './dashboards/DivisionHeadView';
import { HoDView }            from './dashboards/HoDView';
import { ScientistView }      from './dashboards/ScientistView';
import { TechnicianView }     from './dashboards/TechnicianView';
import { HRAdminView }        from './dashboards/HRAdminView';
import { FinanceAdminView }   from './dashboards/FinanceAdminView';
import { SystemAdminView }    from './dashboards/SystemAdminView';
import { MasterAdminView }    from './dashboards/MasterAdminView';
import { StudentView }        from './dashboards/StudentView';
import { ProjectStaffView }   from './dashboards/ProjectStaffView';
import { GuestView }          from './dashboards/GuestView';
import { PendingAccessView }  from './dashboards/PendingAccessView';
import { EmpoweredCommitteeView } from './dashboards/EmpoweredCommitteeView';
import { PMEView }            from './dashboards/PMEView';
import { MyActions } from '../components/MyActions';
import { DataHealthDigest } from '../components/DataHealthDigest';
import { StartIdeaCard } from '../components/proposals/StartIdeaCard';
import { HomeProvider } from '../contexts/HomeContext';
import { CommonDesk } from '../components/home/CommonDesk';

export default function Dashboard() {
  const { activeRole } = useAuth();

  // Two halves: the role's own view on the left, the common desk on the right.
  // Below xl the desk moves under the role half.
  const twoHalves = (roleHalf: React.ReactNode) => (
    <HomeProvider>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <div className="space-y-6 min-w-0">{roleHalf}</div>
        <CommonDesk />
      </div>
    </HomeProvider>
  );
  // Unified pending-actions inbox above every working-role dashboard.
  const withActions = (view: React.ReactNode) => twoHalves(
    <>
      <MyActions />
      {/* Renders nothing for roles that cannot author a proposal. */}
      <StartIdeaCard />
      <DataHealthDigest />
      {view}
    </>,
  );
  // A role-first home: the screen itself ranks the open items, so no inbox card above it.
  const home = (view: React.ReactNode) => twoHalves(<>{view}<DataHealthDigest /></>);

  switch (activeRole) {
    case 'Director':     return home(<DirectorView />);
    case 'DivisionHead': return home(<DivisionHeadView />);
    case 'HOD':          return home(<HoDView />);
    case 'Scientist':    return home(<ScientistView />);
    case 'Technician':   return withActions(<TechnicianView />);
    case 'HRAdmin':      return withActions(<HRAdminView />);
    case 'FinanceAdmin': return withActions(<FinanceAdminView />);
    case 'SystemAdmin':  return withActions(<SystemAdminView />);
    case 'MasterAdmin':  return withActions(<MasterAdminView />);
    case 'Student':      return withActions(<StudentView />);
    case 'ProjectStaff': return withActions(<ProjectStaffView />);
    case 'Guest':        return <GuestView />;
    case 'DefaultUser':         return <PendingAccessView />;
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
