import { Building2, Users, Briefcase, Microscope } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { KpiCard } from '../../components/ui/KpiCard';
import { Card } from '../../components/ui/Cards';
import { Stagger } from '../../components/ui/Stagger';
import { isActiveProject } from '../../lib/projects/stage';

export function GuestView() {
  const { divisions, staff, projects, scientificOutputs } = useData();

  const activeDivisions = divisions.filter(d => d.divStatus === 'Active').length;
  const activeProjects = projects.filter(isActiveProject).length;

  return (
    <Stagger className="space-y-8 pb-12">
      <div className="card-contrast border rounded-xl p-5">
        <h1 className="page-title">
          CSIR-AMPRI Overview
        </h1>
        <p className="text-text-muted mt-1 text-sm font-medium">
          Guest view — read-only institute summary
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Divisions" value={activeDivisions} icon={<Building2 size={18} />} sublabel="Active research units" />
        <KpiCard label="Staff" value={staff.length} icon={<Users size={18} />} sublabel="Institute personnel" />
        <KpiCard label="Active Projects" value={activeProjects} icon={<Briefcase size={18} />} sublabel={`of ${projects.length} total`} />
        <KpiCard label="Publications" value={scientificOutputs.length} icon={<Microscope size={18} />} sublabel="Scientific outputs" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border-cream">
          <h2 className="text-base font-semibold text-charcoal-warm uppercase tracking-wide">Research Divisions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="ledger w-full text-sm">
            <thead>
              <tr className="bg-parchment">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Division</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Research Areas</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-stone-gray">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-cream">
              {divisions.map(d => (
                <tr key={d.divCode} className="hover:bg-parchment transition-colors">
                  <td className="px-6 py-3">
                    <div className="font-medium text-charcoal-warm">{d.divName}</div>
                    <div className="text-[11px] text-warm-silver font-mono">{d.divCode}</div>
                  </td>
                  <td className="px-6 py-3 text-stone-gray text-xs max-w-[280px]">{d.divResearchAreas}</td>
                  <td className="px-6 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      d.divStatus === 'Active' ? 'bg-[#f0f8f0] text-[#3a7a3a]' : 'bg-parchment text-stone-gray'
                    }`}>
                      {d.divStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Stagger>
  );
}
