import { Wrench, CheckCircle, AlertTriangle } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from './KpiCard';

export function TechnicianView() {
  const { equipment } = useData();
  const { divisionCode } = useAuth();

  const working = equipment.filter(e => e.WorkingStatus === 'Working').length;
  const nonWorking = equipment.filter(e => e.WorkingStatus !== 'Working').length;

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
          Equipment Dashboard
        </h1>
        <p className="text-[#87867f] mt-1 text-sm font-medium">
          Division: <span className="text-[#c96442] font-semibold">{divisionCode ?? 'All Divisions'}</span>
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Total Equipment"
          value={equipment.length}
          icon={<Wrench size={18} />}
          sublabel="Instruments & machines"
        />
        <KpiCard
          label="Working"
          value={working}
          icon={<CheckCircle size={18} />}
          sublabel="Operational units"
        />
        <KpiCard
          label="Not Working / Maintenance"
          value={nonWorking}
          icon={<AlertTriangle size={18} />}
          sublabel="Requires attention"
        />
      </div>

      {/* Equipment Table */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0eee6]">
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Equipment Inventory</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f5f4ed]">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Name</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Status</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Operator</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Location</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Movable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eee6]">
              {equipment.map(e => (
                <tr key={e.UInsID} className="hover:bg-[#f5f4ed] transition-colors">
                  <td className="px-6 py-3 text-[#4d4c48] font-medium">{e.Name}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        e.WorkingStatus === 'Working'
                          ? 'bg-[#f0f8f0] text-[#3a7a3a]'
                          : 'bg-[#fdf5e8] text-[#a06020]'
                      }`}
                    >
                      {e.WorkingStatus}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-[#87867f]">{e.OperatorName || '—'}</td>
                  <td className="px-6 py-3 text-[#87867f]">{e.Location || '—'}</td>
                  <td className="px-6 py-3 text-[#87867f]">{e.Movable || '—'}</td>
                </tr>
              ))}
              {equipment.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[#87867f] text-xs italic">
                    No equipment records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
