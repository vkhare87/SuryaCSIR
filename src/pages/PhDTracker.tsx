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
};
import { useCanEdit } from '../lib/permissions/canEdit';
import { PhDStudentFormModal } from '../components/PhDStudentFormModal';
import type { PhDStudent } from '../types';

export default function PhDTracker() {
  const { phDStudents, staff, isLoading } = useData();
  const { hasPermission } = useAuth();
  const canUpload = hasPermission(['HRAdmin', 'SystemAdmin', 'MasterAdmin']);
  const canEdit = useCanEdit('hr');
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<PhDStudent | null>(null);

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
    ...(canEdit ? [{
      header: '',
      cell: (s: PhDStudent) => (
        <button
          onClick={(e) => { e.stopPropagation(); setEditTarget(s); }}
          className="p-1.5 border border-border rounded-md hover:bg-surface-hover text-text-muted hover:text-text"
          title="Edit student"
        >
          <Edit size={12} />
        </button>
      ),
    }] : []),
  ];

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
          {!isLoading && phDStudents.length === 0 ? (
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
    </div>
  );
}
