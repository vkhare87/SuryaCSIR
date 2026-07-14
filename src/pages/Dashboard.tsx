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
import { MyActions } from '../components/MyActions';
import { DataHealthDigest } from '../components/DataHealthDigest';

export default function Dashboard() {
  const { activeRole } = useAuth();

  // Unified pending-actions inbox above every working-role dashboard.
  const withActions = (view: React.ReactNode) => (
    <div className="space-y-6">
      <MyActions />
      <DataHealthDigest />
      {view}
    </div>
  );

  switch (activeRole) {
    case 'Director':     return withActions(<DirectorView />);
    case 'DivisionHead': return withActions(<DivisionHeadView />);
    case 'HOD':          return withActions(<HoDView />);
    case 'Scientist':    return withActions(<ScientistView />);
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
    default:
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-[#87867f]">
          <p className="text-sm font-medium">No dashboard assigned for this account.</p>
          <p className="text-xs">Contact your System Admin to assign a role.</p>
        </div>
      );
  }
}
