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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { useChartFilter } from '../utils/useChartFilter';
import { applyChartFilter } from '../utils/applyChartFilter';
import { Search, Filter, GraduationCap, Users, FileCheck, Award, BarChart3, Plus, Edit } from 'lucide-react';

const PhDAnalytics = lazy(() => import('./PhDAnalytics'));

const PHD_DIM_LABELS: Record<string, string> = {
  status: 'Status',
  supervisor: 'Supervisor',
  specialization: 'Specialization',
  division: 'Division',
};
import { useCanEdit } from '../lib/permissions/canEdit';
import { PhDStudentFormModal } from '../components/PhDStudentFormModal';
import { PhDMilestonePanel } from '../components/PhDMilestonePanel';
import { scholarProgress } from '../lib/phd/progress';
import type { PhDStudent, PhDMilestone } from '../types';

export default function PhDTracker() {
  const { phDStudents, phdMilestones, staff, isLoading, error } = useData();
  const { hasPermission } = useAuth();
  const canUpload = hasPermission(['HRAdmin', 'SystemAdmin', 'MasterAdmin']);
  const canEdit = useCanEdit('hr');
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<PhDStudent | null>(null);
  const [milestoneTarget, setMilestoneTarget] = useState<PhDStudent | null>(null);

  const milestonesByScholar = useMemo(() => {
    const m = new Map<string, PhDMilestone[]>();
    for (const row of phdMilestones) {
      const list = m.get(row.enrollmentNo) ?? [];
      list.push(row);
      m.set(row.enrollmentNo, list);
    }
    return m;
  }, [phdMilestones]);

  const findSupervisorId = (name: string) => {
    if (!name) return null;
    const clean = (n: string) => n.toLowerCase().replace(/^(dr\.|sh\.|smt\.)\s+/i, '').trim();
    const cleaned = clean(name);
    return staff.find(s => clean(s.Name) === cleaned)?.ID ?? null;
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const { filter, clearFilter } = useChartFilter();

  const filteredStudents = useMemo(() => {
    const base = phDStudents.filter(s => {
      const matchesSearch =
        s.StudentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.SupervisorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.ThesisTitle.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'ALL' || s.CurrentStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
    return applyChartFilter(base, filter, {
      status: (s) => s.CurrentStatus,
      supervisor: (s) => s.SupervisorName,
      specialization: (s) => s.Specialization,
      division: (s) => s.DivisionCode,
    });
  }, [phDStudents, searchTerm, statusFilter, filter]);

  const ongoingCount = phDStudents.filter(s => s.CurrentStatus === 'Ongoing').length;
  const submittedCount = phDStudents.filter(s => s.CurrentStatus === 'Thesis Submitted').length;
  const awardedCount = phDStudents.filter(s => s.CurrentStatus === 'Awarded').length;

  const statusMix = useMemo(
    () => [
      { label: 'Ongoing', value: ongoingCount },
      { label: 'Submitted', value: submittedCount },
      { label: 'Awarded', value: awardedCount },
    ],
    [ongoingCount, submittedCount, awardedCount],
  );

  const columns = [
    {
      header: 'Enrollment No',
      accessorKey: 'EnrollmentNo' as const,
      className: 'w-32 font-mono text-text-muted',
    },
    {
      header: 'Student Name',
      cell: (s: PhDStudent) => (
        <div>
          <div className="font-semibold text-text">{s.StudentName}</div>
          <div className="text-xs text-text-muted mt-0.5">{s.Specialization}</div>
        </div>
      ),
    },
    {
      header: 'Supervisor',
      accessorKey: 'SupervisorName' as const,
      cell: (s: PhDStudent) => {
        const supId = findSupervisorId(s.SupervisorName);
        const coSupId = s.CoSupervisorName !== 'None' ? findSupervisorId(s.CoSupervisorName) : null;
        return (
          <div className="text-sm">
            {supId ? (
              <button onClick={() => navigate(`/staff/${supId}`)} className="text-[#c96442] hover:underline font-medium text-left">
                {s.SupervisorName}
              </button>
            ) : (
              <div className="text-text">{s.SupervisorName}</div>
            )}
            {s.CoSupervisorName && s.CoSupervisorName !== 'None' && (
              coSupId ? (
                <button onClick={() => navigate(`/staff/${coSupId}`)} className="text-xs text-[#c96442] hover:underline block mt-0.5">
                  Co: {s.CoSupervisorName}
                </button>
              ) : (
                <div className="text-xs text-text-muted mt-0.5">Co: {s.CoSupervisorName}</div>
              )
            )}
          </div>
        );
      }
    },
    {
      header: 'Thesis Title',
      cell: (s: PhDStudent) => (
        <div className="max-w-xs truncate text-xs italic text-text-muted" title={s.ThesisTitle}>
          "{s.ThesisTitle}"
        </div>
      )
    },
    {
      header: 'Status',
      cell: (s: PhDStudent) => {
        let variant: 'success' | 'warning' | 'info' | 'neutral' = 'neutral';
        if (s.CurrentStatus === 'Ongoing') variant = 'info';
        if (s.CurrentStatus === 'Thesis Submitted') variant = 'success';

        return <Badge variant={variant}>{s.CurrentStatus}</Badge>;
      }
    },
    {
      header: 'Milestones',
      cell: (s: PhDStudent) => {
        const p = scholarProgress(milestonesByScholar.get(s.EnrollmentNo) ?? []);
        return (
          <button
            onClick={(e) => { e.stopPropagation(); setMilestoneTarget(s); }}
            className="w-32 text-left group"
            title={p.next ? `Next: ${p.next}` : 'All milestones complete'}
          >
            <div className="h-1.5 rounded bg-surface-hover">
              <div className="h-1.5 rounded bg-brand-blue" style={{ width: `${p.percent}%` }} />
            </div>
            <div className="mt-1 flex items-center gap-1 text-[10px] text-text-muted group-hover:text-text">
              <span>{p.percent}%</span>
              {p.overdue.length > 0 && <Badge variant="warning">{p.overdue.length} overdue</Badge>}
            </div>
          </button>
        );
      },
    },
    ...(canEdit ? [{
      header: '',
      cell: (s: PhDStudent) => (
        <button
          onClick={(e) => { e.stopPropagation(); setEditTarget(s); }}
          className="p-2 border border-border rounded-md hover:bg-surface-hover text-text-muted hover:text-text"
          title="Edit student"
        >
          <Edit size={12} />
        </button>
      ),
    }] : []),
  ];

  const renderStudentCard = (s: PhDStudent) => {
    let variant: 'success' | 'warning' | 'info' | 'neutral' = 'neutral';
    if (s.CurrentStatus === 'Ongoing') variant = 'info';
    if (s.CurrentStatus === 'Thesis Submitted') variant = 'success';
    return (
      <Card className="h-full flex flex-col bg-surface hover:bg-surface-hover hover:border-[#c96442]/50 transition-colors">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="font-bold text-text truncate" title={s.StudentName}>{s.StudentName}</h3>
            <div className="text-xs text-text-muted mt-0.5 truncate">{s.Specialization}</div>
          </div>
          <Badge variant={variant}>{s.CurrentStatus}</Badge>
        </div>
        <div className="text-xs italic text-text-muted line-clamp-2 mb-3" title={s.ThesisTitle}>
          "{s.ThesisTitle}"
        </div>
        <div className="pt-3 border-t border-border/50 text-xs text-text-muted space-y-1.5 mt-auto">
          <div className="flex items-center justify-between gap-2">
            <span>Enrollment</span>
            <span className="font-mono text-text">{s.EnrollmentNo}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Supervisor</span>
            <span className="text-text truncate max-w-[160px]" title={s.SupervisorName}>{s.SupervisorName}</span>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">PhD Progress Tracker</h1>
          <p className="text-text-muted mt-1">Monitoring research scholars and doctoral milestones</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {canEdit && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#c96442] text-[#faf9f5] rounded-lg text-sm font-medium hover:bg-[#b5593b] transition-colors"
            >
              <Plus size={14} /> New Student
            </button>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search student, supervisor..." 
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
              <option value="Ongoing">Ongoing</option>
              <option value="Thesis Submitted">Thesis Submitted</option>
              <option value="Awarded">Awarded</option>
            </select>
          </div>
        </div>
      </div>

      <InsightsStrip className="lg:grid-cols-4 xl:grid-cols-4">
        <KpiTile
          label="Total Scholars"
          value={phDStudents.length}
          sublabel="enrolled"
          icon={<Users size={16} />}
          accent="brand"
        >
          <MiniDonut data={statusMix} size={32} />
        </KpiTile>
        <KpiTile
          label="Ongoing"
          value={ongoingCount}
          sublabel="active research"
          icon={<GraduationCap size={16} />}
          accent="brand"
        />
        <KpiTile
          label="Thesis Submitted"
          value={submittedCount}
          sublabel="awaiting defence"
          icon={<FileCheck size={16} />}
          accent="warning"
        />
        <KpiTile
          label="Awarded"
          value={awardedCount}
          sublabel="degrees granted"
          icon={<Award size={16} />}
          accent="positive"
        />
      </InsightsStrip>

      <Tabs defaultValue="table">
        <TabsList>
          <TabsTrigger value="table">Table</TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 size={12} className="inline mr-1" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-4 space-y-3">
          <FilterChip filter={filter} onClear={clearFilter} labelMap={PHD_DIM_LABELS} />
          {!isLoading && error && phDStudents.length === 0 ? (
            <EmptyState
              variant="error"
              title="Couldn't load PhD students"
              description={error}
            />
          ) : !isLoading && phDStudents.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="No PhD students"
              description="Student records haven't been loaded yet."
              action={canUpload ? { label: 'Upload via Data Management', to: '/data' } : undefined}
            />
          ) : (
            <Card className="p-0 overflow-hidden">
              <DataTable
                data={filteredStudents}
                columns={columns}
                keyExtractor={(item) => item.EnrollmentNo}
                renderGridItem={renderStudentCard}
              />

              <div className="p-4 border-t border-border bg-surface-hover text-xs text-text-muted">
                Showing {filteredStudents.length} scholars
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <Suspense fallback={<div className="text-sm text-text-muted py-12 text-center">Loading analytics…</div>}>
            <PhDAnalytics />
          </Suspense>
        </TabsContent>
      </Tabs>

      {canEdit && (
        <>
          <PhDStudentFormModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
          <PhDStudentFormModal isOpen={!!editTarget} onClose={() => setEditTarget(null)} student={editTarget} />
        </>
      )}

      {milestoneTarget && (
        <PhDMilestonePanel student={milestoneTarget} canEdit={canEdit} onClose={() => setMilestoneTarget(null)} />
      )}
    </div>
  );
}
