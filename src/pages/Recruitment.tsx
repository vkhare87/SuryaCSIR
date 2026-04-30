import { StatCard, Card, Badge } from '../components/ui/Cards';
import { 
  UserPlus, 
  Search, 
  Filter, 
  ChevronRight,
  ClipboardList,
  Users2,
  FileText
} from 'lucide-react';

export default function Recruitment() {
  const vacancies = [
    { id: 'REC/2026/01', position: 'Scientist', group: 'IV(2)', division: 'LWMD', status: 'In Interview', applicants: 12 },
    { id: 'REC/2026/02', position: 'Technical Assistant', group: 'III(1)', division: 'Admin', status: 'Published', applicants: 45 },
    { id: 'REC/2026/03', position: 'Senior Scientist', group: 'IV(3)', division: 'DTC', status: 'Draft', applicants: 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Recruitment Portal</h1>
          <p className="text-text-muted mt-1">Manage institutional vacancies and talent acquisition</p>
        </div>
        
        <div className="flex gap-2">
          <button className="bg-[#c96442] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#b5593b] transition-colors flex items-center gap-2">
            <UserPlus size={16} />
            New Vacancy
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Open Positions" value={vacancies.filter(v => v.status !== 'Draft').length} icon={<Users2 />} />
        <StatCard title="Total Applicants" value={57} icon={<ClipboardList />} />
        <StatCard title="Active Cycles" value={2} icon={<FileText />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-0 overflow-hidden">
          <div className="p-4 border-b border-border flex justify-between items-center bg-surface-hover">
            <h3 className="font-bold text-text">Active Vacancies</h3>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-3.5 h-3.5" />
                <input type="text" placeholder="Search..." className="pl-8 pr-3 py-1.5 bg-surface border border-border rounded-md text-xs outline-none focus:ring-1 focus:ring-[#3898ec]" />
              </div>
              <button className="p-1.5 border border-border rounded-md hover:bg-surface text-text-muted">
                <Filter size={14} />
              </button>
            </div>
          </div>
          <div className="divide-y divide-border">
            {vacancies.map(v => (
              <div key={v.id} className="p-4 hover:bg-surface-hover transition-colors flex items-center justify-between group cursor-pointer">
                <div>
                  <div className="font-semibold text-text">{v.position}</div>
                  <div className="text-xs text-text-muted mt-0.5 flex items-center gap-2">
                    <span className="text-[#c96442] font-mono">{v.id}</span>
                    <span>•</span>
                    <span>{v.division}</span>
                    <span>•</span>
                    <span>{v.group}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-bold text-text">{v.applicants}</div>
                    <div className="text-[10px] text-text-muted uppercase">Applicants</div>
                  </div>
                  <ChevronRight size={16} className="text-text-muted group-hover:text-[#c96442] transition-colors translate-x-0 group-hover:translate-x-1" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold text-text mb-4">Onboarding Pipeline</h3>
          <div className="space-y-4">
             {[
               { name: 'Dr. Anita Roy', role: 'Scientist', status: 'BG Check' },
               { name: 'Sh. Vikram Singh', role: 'Assistant', status: 'Offer Letter' },
             ].map(item => (
               <div key={item.name} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface-hover">
                 <div className="w-10 h-10 rounded-full bg-[#c96442]/10 flex items-center justify-center font-bold text-[#c96442] text-xs">
                   {item.name.split(' ').map(n => n[0]).join('')}
                 </div>
                 <div>
                   <p className="text-sm font-bold text-text">{item.name}</p>
                   <p className="text-[10px] text-text-muted uppercase">{item.role}</p>
                 </div>
                 <div className="ml-auto">
                    <Badge variant="neutral" className="text-[10px]">{item.status}</Badge>
                 </div>
               </div>
             ))}
          </div>
          <button className="w-full mt-6 py-2 border border-dashed border-border rounded-lg text-xs font-medium text-text-muted hover:text-[#c96442] hover:border-[#c96442] transition-all">
            View All Pending Staff
          </button>
        </Card>
      </div>
    </div>
  );
}
