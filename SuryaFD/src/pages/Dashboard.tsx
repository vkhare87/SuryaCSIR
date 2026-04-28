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

export default function Dashboard() {
  const { activeRole } = useAuth();

  switch (activeRole) {
    case 'Director':     return <DirectorView />;
    case 'DivisionHead': return <DivisionHeadView />;
    case 'HOD':          return <HoDView />;
    case 'Scientist':    return <ScientistView />;
    case 'Technician':   return <TechnicianView />;
    case 'HRAdmin':      return <HRAdminView />;
    case 'FinanceAdmin': return <FinanceAdminView />;
    case 'SystemAdmin':  return <SystemAdminView />;
    case 'MasterAdmin':  return <MasterAdminView />;
    case 'Student':      return <StudentView />;
    case 'ProjectStaff': return <ProjectStaffView />;
    case 'Guest':        return <GuestView />;
    case 'DefaultUser':         return <PendingAccessView />;
    case 'EmpoweredCommittee':  return <EmpoweredCommitteeView />;
    default:
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-[#87867f]">
          <p className="text-sm font-medium">No dashboard assigned for this account.</p>
          <p className="text-xs">Contact your System Admin to assign a role.</p>
        </div>
      );
  }
}
