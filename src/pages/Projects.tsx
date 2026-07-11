import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { DataTable } from '../components/ui/DataTable';
import { Card, Badge } from '../components/ui/Cards';
import { EmptyState } from '../components/ui/EmptyState';
import { InsightsStrip } from '../components/viz/InsightsStrip';
import { KpiTile } from '../components/viz/KpiTile';
import { MiniDonut } from '../components/viz/MiniDonut';
import { FilterChip } from '../components/viz/FilterChip';
import { useChartFilter } from '../utils/useChartFilter';
import { applyChartFilter } from '../utils/applyChartFilter';
import { Search, Filter, Briefcase, IndianRupee, PieChart, Users, CheckCircle2, BarChart3, Plus } from 'lucide-react';

const ProjectsAnalytics = lazy(() => import('./ProjectsAnalytics'));

const PROJECT_DIM_LABELS: Record<string, string> = {
  fundType: 'Fund Type',
  status: 'Status',
  sponsorer: 'Sponsorer',
  division: 'Division',
  pi: 'PI',
};
import { useCanEdit } from '../lib/permissions/canEdit';
import { ProjectFormModal } from '../components/ProjectFormModal';
import type { ProjectInfo, ProjectStaff } from '../types';

export default function Projects() {
  const { projects, projectStaff, isLoading, error } = useData();
  const { hasPermission } = useAuth();
  const canUpload = hasPermission(['HRAdmin', 'SystemAdmin', 'MasterAdmin']);
  const canEdit = useCanEdit('hr');
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'projects' | 'staff' | 'analytics'>('projects');
  const { filter, clearFilter } = useChartFilter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);

  const filteredProjects = useMemo(() => {
    const base = projects.filter(p => {
      const searchStr = searchTerm.toLowerCase();
      const matchesSearch =
        (p.ProjectNo?.toLowerCase() || '').includes(searchStr) ||
        (p.ProjectName?.toLowerCase() || '').includes(searchStr) ||
        (p.PrincipalInvestigator?.toLowerCase() || '').includes(searchStr);

      const matchesStatus = statusFilter === 'ALL' || p.ProjectStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
    return applyChartFilter(base, filter, {
      fundType: (p) => p.FundType,
      status: (p) => p.ProjectStatus,
      sponsorer: (p) => p.SponsorerName,
      division: (p) => p.DivisionCode,
      pi: (p) => p.PrincipalInvestigator,
    });
  }, [projects, searchTerm, statusFilter, filter]);

  const filteredStaff = useMemo(() => {
    return projectStaff.filter(s => {
      const searchStr = searchTerm.toLowerCase();
      const ms = 
        (s.StaffName?.toLowerCase() || '').includes(searchStr) || 
        (s.ProjectNo?.toLowerCase() || '').includes(searchStr) ||
        (s.PIName?.toLowerCase() || '').includes(searchStr);
      return ms;
    });
  }, [projectStaff, searchTerm]);

  const activeProjects = projects.filter(p => p.ProjectStatus === 'Active');
  const completedProjects = projects.filter(p => p.ProjectStatus === 'Completed');

  // Calculate total budget (rough estimation for mock data since it's strings)
  const totalBudget = activeProjects.reduce((sum, p) => {
    const val = parseFloat(p.SanctionedCost.replace(/[^0-9.-]+/g,""));
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const fundMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      const k = p.FundType || 'Unspecified';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [projects]);

  const statusMix = [
    { label: 'Active', value: activeProjects.length },
    { label: 'Completed', value: completedProjects.length },
    { label: 'Other', value: projects.length - activeProjects.length - completedProjects.length },
  ];

  const projectScientistCount = useMemo(
    () => projectStaff.filter(s => s.Designation?.includes('Scientist')).length,
    [projectStaff],
  );
  const projectAssociateCount = useMemo(
    () => projectStaff.filter(s => s.Designation?.includes('Associate')).length,
    [projectStaff],
  );

  const columns = [
    {
      header: 'Project No',
      accessorKey: 'ProjectNo' as const,
      className: 'w-32 font-mono font-medium text-[#c96442]',
    },
    {
      header: 'Project Details',
      value: (p: ProjectInfo) => p.ProjectName ?? '',
      cell: (p: ProjectInfo) => (
        <div className="max-w-md">
          <div className="font-semibold text-text truncate" title={p.ProjectName}>{p.ProjectName}</div>
          <div className="text-xs text-text-muted mt-1 flex gap-2">
            <span className="bg-surface border border-border px-1.5 rounded">{p.FundType}</span>
            <span className="truncate">{p.SponsorerName}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Investigator',
      value: (p: ProjectInfo) => p.PrincipalInvestigator ?? '',
      cell: (p: ProjectInfo) => (
        <div>
          <div className="text-sm text-text">{p.PrincipalInvestigator}</div>
          <div className="text-xs text-text-muted mt-0.5">{p.DivisionCode}</div>
        </div>
      )
    },
    {
      header: 'Status',
      value: (p: ProjectInfo) => p.ProjectStatus ?? '',
      cell: (p: ProjectInfo) => {
        let variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' = 'neutral';
        if (p.ProjectStatus === 'Active') variant = 'success';
        if (p.ProjectStatus === 'Completed') variant = 'info';
        if (p.ProjectStatus === 'Closed') variant = 'neutral';
        
        return <Badge variant={variant}>{p.ProjectStatus}</Badge>;
      }
    },
    {
      header: 'Budget',
      cell: (p: ProjectInfo) => (
        <div className="text-sm font-medium">
          {p.SanctionedCost || 'TBD'}
        </div>
      )
    }
  ];

  const staffColumns = [
    {
      header: 'Staff Identity',
      cell: (s: ProjectStaff) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#c96442]/10 text-[#c96442] flex items-center justify-center font-bold text-xs shrink-0">
            {s.StaffName?.charAt(0) || '?'}
          </div>
          <div>
            <div className="font-bold text-text">{s.StaffName}</div>
            <div className="text-xs text-text-muted mt-0.5">{s.Designation}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Project Assignment',
      cell: (s: ProjectStaff) => (
        <div>
          <div className="text-sm font-mono text-[#c96442] font-bold">{s.ProjectNo || 'N/A'}</div>
          <div className="text-xs text-text-muted mt-0.5">PI: {s.PIName || 'Unknown'}</div>
        </div>
      )
    },
    {
      header: 'Recruitment',
      accessorKey: 'RecruitmentCycle' as const,
      className: 'text-sm text-text',
    },
    {
      header: 'Timeline',
      cell: (s: ProjectStaff) => (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="w-8">DOJ:</span> 
            <span className="font-mono text-text">{s.DateOfJoining || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="w-8">End:</span> 
            <span className="font-mono text-text">{s.DateOfProjectDuration || 'N/A'}</span>
          </div>
        </div>
      )
    }
  ];

  const renderProjectCard = (p: ProjectInfo) => (
    <Card className="h-full flex flex-col bg-surface hover:bg-surface-hover hover:border-[#c96442]/50 transition-colors pointer-events-none group-hover:bg-surface-hover">
      <div className="flex justify-between items-start mb-3">
        <span className="font-mono text-xs font-bold text-[#c96442] bg-[#c96442]/10 px-2 py-1 rounded">
          {p.ProjectNo}
        </span>
        <Badge variant={p.ProjectStatus === 'Active' ? 'success' : p.ProjectStatus === 'Completed' ? 'info' : 'neutral'}>
          {p.ProjectStatus}
        </Badge>
      </div>
      <h3 className="font-bold text-text text-lg leading-tight mb-2 line-clamp-2" title={p.ProjectName}>
        {p.ProjectName}
      </h3>
      <div className="text-xs text-text-muted mb-4 flex gap-2">
        <span className="bg-surface border border-border px-1.5 rounded">{p.FundType}</span>
        <span className="truncate">{p.SponsorerName}</span>
      </div>
      
      <div className="mt-auto space-y-3 pt-4 border-t border-border/50">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Principal Investigator</div>
          <div className="text-sm font-medium text-text truncate">{p.PrincipalInvestigator}</div>
        </div>
        <div className="flex justify-between items-end">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Division</div>
            <div className="text-sm text-text">{p.DivisionCode}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Sanctioned Cost</div>
            <div className="text-sm font-bold text-text">{p.SanctionedCost || 'TBD'}</div>
          </div>
        </div>
      </div>
    </Card>
  );

  const renderStaffCard = (s: ProjectStaff) => (
    <Card className="h-full flex flex-col bg-surface hover:bg-surface-hover hover:border-[#c96442]/50 transition-colors">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#c96442]/10 text-[#c96442] flex items-center justify-center font-bold text-sm shrink-0">
          {s.StaffName?.charAt(0) || '?'}
        </div>
        <div>
          <h3 className="font-bold text-text" title={s.StaffName}>{s.StaffName}</h3>
          <div className="text-xs text-[#c96442] font-medium mt-0.5">{s.Designation}</div>
        </div>
      </div>
      
      <div className="space-y-3 mt-auto pt-4 border-t border-border/50">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Project Assignment</div>
          <div className="text-sm font-mono font-medium text-text">{s.ProjectNo || 'N/A'}</div>
          <div className="text-xs text-text-muted mt-0.5">PI: {s.PIName || 'Unknown'}</div>
        </div>
        <div className="flex justify-between gap-2">
          <div className="bg-background rounded-lg p-2 flex-1 border border-border">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Joining Date</div>
            <div className="text-xs font-medium text-text">{s.DateOfJoining || 'N/A'}</div>
          </div>
          <div className="bg-background rounded-lg p-2 flex-1 border border-border">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Project End</div>
            <div className="text-xs font-medium text-text">{s.DateOfProjectDuration || 'N/A'}</div>
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Project Intelligence</h1>
          <p className="text-text-muted mt-1">Research & Sponsored Projects Tracker</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {canEdit && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#c96442] text-[#faf9f5] rounded-lg text-sm font-medium hover:bg-[#b5593b] transition-colors"
            >
              <Plus size={14} /> New Project
            </button>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search ID, name, PI..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm w-full sm:w-64"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-9 pr-8 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm appearance-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
        </div>
      </div>

      <div className="border-b border-border flex gap-6">
        <button 
          onClick={() => setActiveTab('projects')}
          className={`pb-3 text-sm font-bold transition-colors relative ${activeTab === 'projects' ? 'text-[#c96442]' : 'text-text-muted hover:text-text'}`}
        >
          Research Projects
          {activeTab === 'projects' && (
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#c96442] rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('staff')}
          className={`pb-3 text-sm font-bold transition-colors relative ${activeTab === 'staff' ? 'text-[#c96442]' : 'text-text-muted hover:text-text'}`}
        >
          Project Staff
          {activeTab === 'staff' && (
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#c96442] rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 text-sm font-bold transition-colors relative flex items-center gap-1.5 ${activeTab === 'analytics' ? 'text-[#c96442]' : 'text-text-muted hover:text-text'}`}
        >
          <BarChart3 size={14} />
          Analytics
          {activeTab === 'analytics' && (
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#c96442] rounded-t-full" />
          )}
        </button>
      </div>

      <FilterChip filter={filter} onClear={clearFilter} labelMap={PROJECT_DIM_LABELS} />

      {activeTab === 'analytics' ? (
        <Suspense fallback={<div className="text-sm text-text-muted py-12 text-center">Loading analytics…</div>}>
          <ProjectsAnalytics />
        </Suspense>
      ) : activeTab === 'projects' ? (
        <>
          <InsightsStrip className="lg:grid-cols-4 xl:grid-cols-4">
            <KpiTile
              label="Total Projects"
              value={projects.length}
              sublabel="all status"
              icon={<Briefcase size={16} />}
              accent="brand"
            >
              <MiniDonut data={statusMix} size={32} />
            </KpiTile>
            <KpiTile
              label="Active Projects"
              value={activeProjects.length}
              sublabel="in progress"
              icon={<CheckCircle2 size={16} />}
              accent="positive"
            />
            <KpiTile
              label="Funding Mix"
              value={fundMix.length}
              sublabel="fund types"
              icon={<PieChart size={16} />}
              accent="neutral"
            >
              <MiniDonut data={fundMix} size={32} />
            </KpiTile>
            <KpiTile
              label="Extramural Budget"
              value={`₹${totalBudget.toLocaleString()}L+`}
              sublabel="sanctioned (active)"
              icon={<IndianRupee size={16} />}
              accent="warning"
            />
          </InsightsStrip>

          {!isLoading && error && projects.length === 0 ? (
            <EmptyState
              variant="error"
              title="Couldn't load projects"
              description={error}
            />
          ) : !isLoading && projects.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No projects"
              description="Project data hasn't been loaded yet."
              action={canUpload ? { label: 'Upload via Data Management', to: '/data' } : undefined}
            />
          ) : (
            <Card className="p-0 overflow-hidden">
              <DataTable
                data={filteredProjects}
                columns={columns}
                keyExtractor={(item) => item.ProjectID}
                onRowClick={(item) => navigate(`/projects/${item.ProjectID}`)}
                itemsPerPage={12}
                renderGridItem={renderProjectCard}
                enableColumnVisibility
                tableId="projects"
                exportFileName="projects"
                className="border-0 shadow-none bg-transparent"
              />
            </Card>
          )}
        </>
      ) : (
        <>
          <InsightsStrip className="lg:grid-cols-3 xl:grid-cols-3">
            <KpiTile
              label="Total Project Staff"
              value={projectStaff.length}
              sublabel="across all projects"
              icon={<Users size={16} />}
              accent="brand"
            />
            <KpiTile
              label="Project Associates"
              value={projectAssociateCount}
              sublabel="associate roles"
              icon={<Briefcase size={16} />}
              accent="neutral"
            />
            <KpiTile
              label="Project Scientists"
              value={projectScientistCount}
              sublabel="scientist roles"
              icon={<PieChart size={16} />}
              accent="positive"
            />
          </InsightsStrip>

          <Card className="p-0 overflow-hidden">
            <DataTable 
              data={filteredStaff}
              columns={staffColumns}
              keyExtractor={(item) => item.id}
              itemsPerPage={12}
              renderGridItem={renderStaffCard}
              className="border-0 shadow-none bg-transparent"
            />
          </Card>
        </>
      )}

      {canEdit && (
        <ProjectFormModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
