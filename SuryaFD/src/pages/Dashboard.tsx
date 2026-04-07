import { useAuth } from '../contexts/AuthContext';
import { DirectorView }     from './dashboards/DirectorView';
import { DivisionHeadView } from './dashboards/DivisionHeadView';
import { ScientistView }    from './dashboards/ScientistView';
import { TechnicianView }   from './dashboards/TechnicianView';
import { HRAdminView }      from './dashboards/HRAdminView';
import { FinanceAdminView } from './dashboards/FinanceAdminView';
import { SystemAdminView }  from './dashboards/SystemAdminView';

export default function Dashboard() {
  const { role } = useAuth();

  switch (role) {
    case 'Director':     return <DirectorView />;
    case 'DivisionHead': return <DivisionHeadView />;
    case 'Scientist':    return <ScientistView />;
    case 'Technician':   return <TechnicianView />;
    case 'HRAdmin':      return <HRAdminView />;
    case 'FinanceAdmin': return <FinanceAdminView />;
    case 'SystemAdmin':  return <SystemAdminView />;
    default:
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-[#87867f]">
          <p className="text-sm font-medium">No dashboard assigned for this account.</p>
          <p className="text-xs">Contact your System Admin to assign a role.</p>
        </div>
      );
  }
}
