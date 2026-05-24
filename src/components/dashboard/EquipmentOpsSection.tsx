import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { ChartCard } from '../viz/ChartCard';
import { ProgressRing } from '../viz/ProgressRing';
import { CategoryDonut } from '../viz/CategoryDonut';
import { formatDate, parseDate } from '../../utils/dateUtils';
import {
  getEquipmentUptime,
  getAmcExpiryList,
  getTicketUrgencyMix,
  getOpsFlags,
} from '../../utils/directorMetrics';

export function EquipmentOpsSection() {
  const { equipment, tickets, actionItems } = useData();
  const navigate = useNavigate();

  const uptime = useMemo(() => getEquipmentUptime(equipment), [equipment]);
  const amc = useMemo(() => getAmcExpiryList(equipment, 6), [equipment]);
  const urgency = useMemo(() => getTicketUrgencyMix(tickets), [tickets]);
  const overdueActions = useMemo(() => getOpsFlags(tickets, actionItems).overdueActions, [tickets, actionItems]);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-text uppercase tracking-wide">Equipment &amp; Operations</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Equipment uptime" subtitle="working vs total">
          <div className="flex items-center justify-center min-h-[200px]">
            <ProgressRing value={uptime.working} max={uptime.total} size={160} label="working" />
          </div>
        </ChartCard>
        <ChartCard title="Open tickets by urgency">
          <CategoryDonut data={urgency} onSelect={() => navigate('/helpdesk')} />
        </ChartCard>
        <ChartCard title="AMC expiring (next 6 months)">
          {amc.length === 0 ? (
            <p className="text-xs text-text-muted italic py-8 text-center">No AMC contracts expiring.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {amc.slice(0, 8).map((e) => (
                <li
                  key={e.UInsID}
                  className="flex justify-between py-2 cursor-pointer hover:bg-surface-hover px-1"
                  onClick={() => navigate(`/facilities/${e.UInsID}`)}
                >
                  <span className="truncate text-text">{e.Name}</span>
                  <span className="text-text-muted tabular-nums">{formatDate(parseDate(e.amc_end_date))}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
        <ChartCard title="Overdue action items">
          {overdueActions.length === 0 ? (
            <p className="text-xs text-text-muted italic py-8 text-center">No overdue actions.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {overdueActions.slice(0, 8).map((a) => (
                <li
                  key={a.id}
                  className="flex justify-between py-2 cursor-pointer hover:bg-surface-hover px-1"
                  onClick={() => navigate('/committees')}
                >
                  <span className="truncate text-text">{a.task}</span>
                  <span className="text-text-muted tabular-nums">{formatDate(parseDate(a.deadline))}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </section>
  );
}
