import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { DataTable } from '../components/ui/DataTable';
import { Card, Badge, StatCard } from '../components/ui/Cards';
import { Search, Filter, GraduationCap, Users, FileCheck } from 'lucide-react';

export default function PhDTracker() {
  const { phDStudents, staff } = useData();
  const navigate = useNavigate();

  const findSupervisorId = (name: string) => {
    if (!name) return null;
    const clean = (n: string) => n.toLowerCase().replace(/^(dr\.|sh\.|smt\.)\s+/i, '').trim();
    const cleaned = clean(name);
    return staff.find(s => clean(s.Name) === cleaned)?.ID ?? null;
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredStudents = useMemo(() => {
    return phDStudents.filter(s => {
      const matchesSearch = 
        s.StudentName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        s.SupervisorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.ThesisTitle.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'ALL' || s.CurrentStatus === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [phDStudents, searchTerm, statusFilter]);

  const ongoingCount = phDStudents.filter(s => s.CurrentStatus === 'Ongoing').length;
  const submittedCount = phDStudents.filter(s => s.CurrentStatus === 'Thesis Submitted').length;

  const columns = [
    {
      header: 'Enrollment No',
      accessorKey: 'EnrollmentNo' as const,
      className: 'w-32 font-mono text-text-muted',
    },
    {
      header: 'Student Name',
      cell: (s: any) => (
        <div>
          <div className="font-semibold text-text">{s.StudentName}</div>
          <div className="text-xs text-text-muted mt-0.5">{s.Specialization}</div>
        </div>
      ),
    },
    {
      header: 'Supervisor',
      accessorKey: 'SupervisorName' as const,
      cell: (s: any) => {
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
      cell: (s: any) => (
        <div className="max-w-xs truncate text-xs italic text-text-muted" title={s.ThesisTitle}>
          "{s.ThesisTitle}"
        </div>
      )
    },
    {
      header: 'Status',
      cell: (s: any) => {
        let variant: 'success' | 'warning' | 'info' | 'neutral' = 'neutral';
        if (s.CurrentStatus === 'Ongoing') variant = 'info';
        if (s.CurrentStatus === 'Thesis Submitted') variant = 'success';
        
        return <Badge variant={variant}>{s.CurrentStatus}</Badge>;
      }
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">PhD Progress Tracker</h1>
          <p className="text-text-muted mt-1">Monitoring research scholars and doctoral milestones</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Scholars" value={phDStudents.length} icon={<Users />} />
        <StatCard title="Ongoing Research" value={ongoingCount} icon={<GraduationCap />} />
        <StatCard title="Thesis Submitted" value={submittedCount} valueColor="text-emerald-500" icon={<FileCheck />} />
      </div>

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
    </div>
  );
}
