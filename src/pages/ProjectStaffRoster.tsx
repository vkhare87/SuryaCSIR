import { useState, useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { DataTable } from '../components/ui/DataTable';
import { Card, Badge } from '../components/ui/Cards';
import { EmptyState } from '../components/ui/EmptyState';
import { Search, Filter, UsersRound, X } from 'lucide-react';
import type { ProjectStaff } from '../types';
import { ProjectStaffAnalytics, type Facet } from './ProjectStaffAnalytics';

const FACET_FIELD: Record<Facet['dim'], keyof ProjectStaff> = {
  project: 'ProjectNo',
  pi: 'PIName',
  designation: 'Designation',
  cycle: 'RecruitmentCycle',
};
const FACET_LABEL: Record<Facet['dim'], string> = {
  project: 'Project',
  pi: 'PI',
  designation: 'Designation',
  cycle: 'Cycle',
};

export default function ProjectStaffRoster() {
  const { projectStaff, divisions } = useData();
  const [activeTab, setActiveTab] = useState<'list' | 'analytics'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  const [facet, setFacet] = useState<Facet | null>(null);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return projectStaff.filter((member) => {
      const matchesSearch =
        (member.StaffName?.toLowerCase() || '').includes(q) ||
        (member.Designation?.toLowerCase() || '').includes(q) ||
        (member.ProjectNo?.toLowerCase() || '').includes(q) ||
        (member.PIName?.toLowerCase() || '').includes(q);
      const matchesDivision = selectedDivision === 'ALL' || member.DivisionCode === selectedDivision;
      const matchesFacet = !facet || (member[FACET_FIELD[facet.dim]] || '') === facet.value;
      return matchesSearch && matchesDivision && matchesFacet;
    });
  }, [projectStaff, searchTerm, selectedDivision, facet]);

  const columns = [
    {
      header: 'Name & Designation',
      cell: (m: ProjectStaff) => (
        <div>
          <div className="font-semibold text-text">{m.StaffName}</div>
          <div className="text-xs text-text-muted mt-0.5">{m.Designation || '—'}</div>
        </div>
      ),
    },
    {
      header: 'Project',
      accessorKey: 'ProjectNo' as const,
      cell: (m: ProjectStaff) => <span className="font-mono text-xs text-text-muted">{m.ProjectNo || '—'}</span>,
    },
    {
      header: 'Principal Investigator',
      accessorKey: 'PIName' as const,
      cell: (m: ProjectStaff) => <span className="text-sm text-text">{m.PIName || '—'}</span>,
    },
    {
      header: 'Division',
      accessorKey: 'DivisionCode' as const,
      cell: (m: ProjectStaff) => {
        const div = divisions.find((d) => d.divCode === m.DivisionCode);
        return <Badge variant="info">{div ? div.divCode : m.DivisionCode || '—'}</Badge>;
      },
    },
    {
      header: 'Joining',
      accessorKey: 'DateOfJoining' as const,
      cell: (m: ProjectStaff) => <span className="text-sm text-text-muted">{m.DateOfJoining || '—'}</span>,
    },
  ];

  const tabBtn = (tab: 'list' | 'analytics', label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        activeTab === tab ? 'bg-[#c96442] text-white' : 'text-text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Project Staff</h1>
          <p className="text-text-muted mt-1">Project-funded personnel, separate from permanent staff</p>
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {tabBtn('list', 'List')}
          {tabBtn('analytics', 'Analytics')}
        </div>
      </div>

      {activeTab === 'analytics' ? (
        <ProjectStaffAnalytics
          onFacet={(f) => {
            setFacet(f);
            setActiveTab('list');
          }}
          onDivision={(code) => {
            setSelectedDivision(code);
            setActiveTab('list');
          }}
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
              <input
                type="text"
                placeholder="Search name, project, PI..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm w-full sm:w-64"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
              <select
                value={selectedDivision}
                onChange={(e) => setSelectedDivision(e.target.value)}
                className="pl-9 pr-8 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm appearance-none cursor-pointer"
              >
                <option value="ALL">All Divisions</option>
                {divisions.map((d) => (
                  <option key={d.divCode} value={d.divCode}>
                    {d.divCode} - {d.divName}
                  </option>
                ))}
              </select>
            </div>
            {facet && (
              <button
                onClick={() => setFacet(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#c96442]/10 text-[#c96442] rounded-lg text-xs font-medium"
              >
                {FACET_LABEL[facet.dim]}: {facet.value}
                <X size={12} />
              </button>
            )}
          </div>

          <Card className="p-0 overflow-hidden">
            {projectStaff.length === 0 ? (
              <EmptyState
                icon={UsersRound}
                title="No project staff records"
                description="Project staff data hasn't been loaded yet."
              />
            ) : (
              <DataTable
                data={filtered}
                columns={columns}
                keyExtractor={(item) => item.id}
                itemsPerPage={12}
                className="border-0 shadow-none bg-transparent"
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
