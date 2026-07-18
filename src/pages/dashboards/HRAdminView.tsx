import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Network, UserCheck, Briefcase, Wrench, BarChart3, CalendarClock } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { Card } from '../../components/ui/Cards';
import { InsightsStrip } from '../../components/viz/InsightsStrip';
import { KpiTile } from '../../components/viz/KpiTile';
import { MiniDonut } from '../../components/viz/MiniDonut';
import { MiniBar } from '../../components/viz/MiniBar';

const RENEWAL_HORIZON_DAYS = 90;
const MS_PER_DAY = 86400000;

export function HRAdminView() {
  const { staff, divisions, contractStaff } = useData();
  const navigate = useNavigate();

  const renewalQueue = useMemo(() => {
    const now = new Date().getTime();
    return contractStaff
      .map(c => ({ ...c, daysLeft: Math.floor((Date.parse(c.ContractEndDate) - now) / MS_PER_DAY) }))
      .filter(c => Number.isFinite(c.daysLeft) && c.daysLeft >= 0 && c.daysLeft <= RENEWAL_HORIZON_DAYS)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [contractStaff]);

  const groupMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of staff) {
      const k = s.Group || 'Unspecified';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [staff]);

  const divisionLoad = useMemo(() => {
    return divisions
      .map(d => ({
        label: d.divCode,
        value: staff.filter(s => s.Division === d.divCode).length,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [divisions, staff]);

  const scientistCount = useMemo(
    () => staff.filter(s => s.Designation?.toLowerCase().includes('scientist')).length,
    [staff],
  );
  const technicalCount = useMemo(
    () =>
      staff.filter(s =>
        (s.Group || '').toLowerCase().includes('iii') ||
        (s.Group || '').toLowerCase().includes('ii') ||
        (s.Designation || '').toLowerCase().includes('technical'),
      ).length,
    [staff],
  );
  const totalSanctioned = useMemo(
    () => divisions.reduce((s, d) => s + (d.divSanctionedstrength || 0), 0),
    [divisions],
  );
  const fillPct = totalSanctioned > 0 ? Math.round((staff.length / totalSanctioned) * 100) : 0;

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
            HR Administration
          </h1>
          <p className="text-[#87867f] mt-1 text-sm font-medium">
            Manage staff records and personnel information
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/staff/analytics')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-surface border border-border text-text text-sm font-semibold rounded-[8px] hover:bg-surface-hover transition-colors"
          >
            <BarChart3 size={14} />
            Analytics
          </button>
          <button
            onClick={() => navigate('/staff')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#c96442] text-[#faf9f5] text-sm font-semibold rounded-[8px] hover:bg-[#b5593b] transition-colors shadow-[0px_0px_0px_1px_#b5593b]"
          >
            + Add Staff
          </button>
        </div>
      </div>

      {/* Insight Strip */}
      <InsightsStrip>
        <KpiTile
          label="Total Staff"
          value={staff.length}
          sublabel={`${fillPct}% of ${totalSanctioned} sanctioned`}
          icon={<Users size={16} />}
          accent="brand"
        >
          <MiniDonut data={groupMix} size={32} />
        </KpiTile>
        <KpiTile
          label="Scientists"
          value={scientistCount}
          sublabel="scientific cadre"
          icon={<UserCheck size={16} />}
          accent="positive"
        />
        <KpiTile
          label="Technical"
          value={technicalCount}
          sublabel="group ii / iii"
          icon={<Wrench size={16} />}
          accent="neutral"
        />
        <KpiTile
          label="Divisions"
          value={divisions.length}
          sublabel="active divisions"
          icon={<Network size={16} />}
          accent="neutral"
        >
          <MiniBar data={divisionLoad} height={28} />
        </KpiTile>
        <KpiTile
          label="Sanctioned"
          value={totalSanctioned}
          sublabel="total posts"
          icon={<Briefcase size={16} />}
          accent="warning"
        />
      </InsightsStrip>

      {/* Contract Renewal Queue */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0eee6] flex items-center gap-2">
          <CalendarClock size={16} className="text-[#c96442]" />
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">
            Contract Renewals — next {RENEWAL_HORIZON_DAYS} days
          </h2>
        </div>
        {renewalQueue.length === 0 ? (
          <p className="text-xs text-[#87867f] italic py-8 text-center">No contracts ending in this window.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f4ed]">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Name</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Designation</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Division</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Ends</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Days Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eee6]">
                {renewalQueue.map(c => (
                  <tr key={c.id} className="hover:bg-[#f5f4ed] transition-colors">
                    <td className="px-6 py-3 text-[#4d4c48] font-medium">{c.Name}</td>
                    <td className="px-6 py-3 text-[#87867f]">{c.Designation}</td>
                    <td className="px-6 py-3 text-[#87867f] font-mono text-xs">{c.Division}</td>
                    <td className="px-6 py-3 text-right text-[#87867f] text-xs">{c.ContractEndDate}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        c.daysLeft <= 14 ? 'bg-[#fde2e2] text-[#991b1b]' : 'bg-[#fdf5e8] text-[#a06020]'
                      }`}>
                        {c.daysLeft}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Staff Table */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0eee6]">
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">All Staff</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f5f4ed]">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Name</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Designation</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Division</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Group</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Email</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eee6]">
              {staff.map(s => (
                <tr key={s.ID} className="hover:bg-[#f5f4ed] transition-colors">
                  <td className="px-6 py-3 text-[#4d4c48] font-medium">{s.Name}</td>
                  <td className="px-6 py-3 text-[#87867f]">{s.Designation}</td>
                  <td className="px-6 py-3 text-[#87867f] font-mono text-xs">{s.Division}</td>
                  <td className="px-6 py-3 text-[#87867f]">{s.Group}</td>
                  <td className="px-6 py-3 text-[#87867f] font-mono text-xs">{s.Email}</td>
                  <td className="px-6 py-3">
                    <button
                      onClick={() => navigate(`/staff/${s.ID}`)}
                      className="text-[#c96442] text-xs font-semibold hover:text-[#b5593b] hover:underline transition-colors"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[#87867f] text-xs italic">
                    No staff records found.
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
