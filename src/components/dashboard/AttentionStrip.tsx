import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { KpiTile } from '../viz/KpiTile';
import {
  getProjectFlags,
  getEquipmentFlags,
  getOpsFlags,
  type DirectorThresholds,
} from '../../utils/directorMetrics';

interface AttentionStripProps {
  thresholds: DirectorThresholds;
}

interface Flag {
  label: string;
  count: number;
  accent: 'negative' | 'warning';
  to: string;
}

export function AttentionStrip({ thresholds }: AttentionStripProps) {
  const { projects, equipment, tickets, actionItems } = useData();
  const navigate = useNavigate();

  const flags = useMemo<Flag[]>(() => {
    const pf = getProjectFlags(projects, thresholds);
    const ef = getEquipmentFlags(equipment, thresholds);
    const of = getOpsFlags(tickets, actionItems);
    const all: Flag[] = [
      { label: 'Overdue projects', count: pf.overdue.length, accent: 'negative', to: '/projects' },
      { label: 'Ending soon', count: pf.endingSoon.length, accent: 'warning', to: '/projects' },
      { label: 'Low fund burn', count: pf.lowBurn.length, accent: 'warning', to: '/projects' },
      { label: 'Equipment down', count: ef.down.length, accent: 'negative', to: '/facilities' },
      { label: 'AMC expiring', count: ef.amcExpiring.length, accent: 'warning', to: '/facilities' },
      { label: 'Critical tickets', count: of.criticalTickets.length, accent: 'negative', to: '/helpdesk' },
      { label: 'Overdue actions', count: of.overdueActions.length, accent: 'warning', to: '/committees' },
    ];
    return all.filter((f) => f.count > 0);
  }, [projects, equipment, tickets, actionItems, thresholds]);

  if (flags.length === 0) {
    return (
      <KpiTile
        label="Needs attention"
        value="All clear"
        sublabel="No flags at current thresholds"
        accent="positive"
        icon={<CheckCircle2 size={18} />}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {flags.map((f) => (
        <button key={f.label} onClick={() => navigate(f.to)} className="text-left focus:outline-none">
          <KpiTile label={f.label} value={f.count} accent={f.accent} icon={<AlertTriangle size={18} />} />
        </button>
      ))}
    </div>
  );
}
