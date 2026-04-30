import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { DataTable } from '../components/ui/DataTable';
import { Card, Badge, StatCard } from '../components/ui/Cards';
import { Search, Filter, Briefcase, IndianRupee, PieChart, Users } from 'lucide-react';

export default function Projects() {
  const { projects, projectStaff } = useData();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'projects' | 'staff'>('projects');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const searchStr = searchTerm.toLowerCase();
      const matchesSearch = 
        (p.ProjectNo?.toLowerCase() || '').includes(searchStr) || 
        (p.ProjectName?.toLowerCase() || '').includes(searchStr) ||
        (p.PrincipalInvestigator?.toLowerCase() || '').includes(searchStr);
      
      const matchesStatus = statusFilter === 'ALL' || p.ProjectStatus === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [projects, searchTerm, statusFilter]);

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
  
  // Calculate total budget (rough estimation for mock data since it's strings)
  const totalBudget = activeProjects.reduce((sum, p) => {
    const val = parseFloat(p.SanctionedCost.replace(/[^0-9.-]+/g,""));
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const columns = [
    {
      header: 'Project No',
      accessorKey: 'ProjectNo' as const,
      className: 'w-32 font-mono font-medium text-[#c96442]',
    },
    {
      header: 'Project Details',
      cell: (p: any) => (
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
      cell: (p: any) => (
        <div>
          <div className="text-sm text-text">{p.PrincipalInvestigator}</div>
          <div className="text-xs text-text-muted mt-0.5">{p.DivisionCode}</div>
        </div>
      )
    },
    {
      header: 'Status',
      cell: (p: any) => {
        let variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' = 'neutral';
        if (p.ProjectStatus === 'Active') variant = 'success';
        if (p.ProjectStatus === 'Completed') variant = 'info';
        if (p.ProjectStatus === 'Closed') variant = 'neutral';
        
        return <Badge variant={variant}>{p.ProjectStatus}</Badge>;
      }
    },
    {
      header: 'Budget',
      cell: (p: any) => (
        <div className="text-sm font-medium">
          {p.SanctionedCost || 'TBD'}
        </div>
      )
    }
  ];

  const staffColumns = [
    {
      header: 'Staff Identity',
      cell: (s: any) => (
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
      cell: (s: any) => (
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
      cell: (s: any) => (
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

  const renderProjectCard = (p: any) => (
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

  const renderStaffCard = (s: any) => (
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
      </div>

      {activeTab === 'projects' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="Total Projects" value={projects.length} icon={<Briefcase />} />
            <StatCard title="Active Projects" value={activeProjects.length} valueColor="text-emerald-500" icon={<PieChart />} />
            <StatCard title="Extramural Budget" value={`₹${totalBudget.toLocaleString()}L+`} icon={<IndianRupee />} />
          </div>

          <Card className="p-0 overflow-hidden">
            <DataTable 
              data={filteredProjects}
              columns={columns}
              keyExtractor={(item) => item.ProjectID}
              onRowClick={(item) => navigate(`/projects/${item.ProjectID}`)}
              itemsPerPage={12}
              renderGridItem={renderProjectCard}
              className="border-0 shadow-none bg-transparent"
            />
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="Total Project Staff" value={projectStaff.length} icon={<Users />} />
            <StatCard title="Project Associates" value={projectStaff.filter(s => s.Designation?.includes('Associate')).length} icon={<Briefcase />} />
            <StatCard title="Project Scientists" value={projectStaff.filter(s => s.Designation?.includes('Scientist')).length} icon={<PieChart />} />
          </div>

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
    </div>
  );
}
