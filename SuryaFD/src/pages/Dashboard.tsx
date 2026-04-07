import { useState, useMemo } from 'react';
import { StatCard, Card, Badge } from '../components/ui/Cards';
import { useData } from '../contexts/DataContext';
import { parseDate, getRetirementDate, isWithinMonths, diffInDays } from '../utils/dateUtils';
import { 
  Users, 
  Briefcase, 
  BookOpen, 
  TrendingUp,
  PieChart as PieChartIcon,
  Calendar,
  UserCheck,
  Award,
  Clock,
  ArrowUpRight,
  Filter
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';


export default function Dashboard() {
  const { staff, projects, projectStaff, phDStudents, divisions, isBackendProvisioned } = useData();
  const [retirementPeriod, setRetirementPeriod] = useState<number>(0.5); // Years (0.5 = 6 months)

  // --- 1. Human Capital Metrics ---
  const humanCapitalStats = useMemo(() => {
    const permanent = staff.length;
    const project = projectStaff.length;
    const phd = phDStudents.length;
    
    const groups = {
      Scientific: staff.filter(s => s.Group?.toLowerCase() === 'scientific').length,
      Technical: staff.filter(s => s.Group?.toLowerCase() === 'technical').length,
      Admin: staff.filter(s => s.Group?.toLowerCase() === 'admin').length
    };

    return { permanent, project, phd, groups };
  }, [staff, projectStaff, phDStudents]);

  // --- 2. Demographics & Distribution ---
  const demographicData = useMemo(() => {
    const now = new Date();
    
    // Age distribution
    const ageBuckets = { 'Under 35': 0, '35-45': 0, '45-55': 0, '55+': 0 };
    staff.forEach(s => {
      const dob = parseDate(s.DOB);
      if (dob) {
        const age = now.getFullYear() - dob.getFullYear();
        if (age < 35) ageBuckets['Under 35']++;
        else if (age < 45) ageBuckets['35-45']++;
        else if (age < 55) ageBuckets['45-55']++;
        else ageBuckets['55+']++;
      }
    });

    const genderDist = [
      { name: 'Male', value: staff.filter(s => s.Gender === 'Male').length, color: '#0B4DA2' },
      { name: 'Female', value: staff.filter(s => s.Gender === 'Female').length, color: '#EC4899' }
    ];

    const levelDist = divisions.map(div => ({
      name: div.divCode,
      scientists: staff.filter(s => s.Division === div.divCode && s.Group === 'Scientific').length,
      technical: staff.filter(s => s.Division === div.divCode && s.Group === 'Technical').length
    }));

    return { ageBuckets: Object.entries(ageBuckets).map(([name, value]) => ({ name, value })), genderDist, levelDist };
  }, [staff, divisions]);

  // --- 3. Project Visuals ---
  const projectStats = useMemo(() => {
    const categories: Record<string, number> = {};
    let totalValue = 0;
    let totalTenureMonths = 0;
    const now = new Date();
    const endingSoon = projects.filter(p => {
      const end = parseDate(p.CompletioDate);
      return end && diffInDays(end, now) <= 30 && diffInDays(end, now) > 0;
    }).slice(0, 5);

    projects.forEach(p => {
      categories[p.ProjectCategory] = (categories[p.ProjectCategory] || 0) + 1;
      const val = parseFloat(p.SanctionedCost) || 0;
      totalValue += val;
      
      const start = parseDate(p.StartDate);
      const end = parseDate(p.CompletioDate);
      if (start && end) {
        totalTenureMonths += (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      }
    });

    const categoryData = Object.entries(categories).map(([name, value]) => ({ 
      name, 
      value,
      color: name === 'R&D' ? '#0B4DA2' : name === 'Consultancy' ? '#FFD700' : '#10b981'
    }));

    return { 
      categoryData, 
      avgValue: projects.length ? (totalValue / projects.length / 100000).toFixed(2) : 0, // Lakhs
      avgTenure: projects.length ? (totalTenureMonths / projects.length / 12).toFixed(1) : 0, // Years
      endingSoon
    };
  }, [projects]);

  // --- 4. Retirement Forecaster ---
  const retirementList = useMemo(() => {
    const now = new Date();
    return staff.map(s => ({
      ...s,
      retirementDate: getRetirementDate(s.DOB)
    })).filter(s => {
      if (!s.retirementDate) return false;
      return s.retirementDate > now && isWithinMonths(s.retirementDate, retirementPeriod * 12);
    }).sort((a, b) => a.retirementDate!.getTime() - b.retirementDate!.getTime()).slice(0, 8);
  }, [staff, retirementPeriod]);

  // --- 5. Project Staff Analytics ---
  const projectStaffStats = useMemo(() => {
    const recruitmentYears: Record<string, number> = {};
    const postDist: Record<string, number> = {};
    const tenureAlerts = projectStaff.filter(s => {
      const end = parseDate(s.DateOfProjectDuration);
      return end && isWithinMonths(end, 3);
    }).slice(0, 5);

    projectStaff.forEach(s => {
      const year = s.RecruitmentCycle || 'Unknown';
      recruitmentYears[year] = (recruitmentYears[year] || 0) + 1;
      const postCategory = s.Designation?.split(' ')[0] || 'Unknown';
      postDist[postCategory] = (postDist[postCategory] || 0) + 1;
    });

    return {
      recruitmentData: Object.entries(recruitmentYears).map(([name, value]) => ({ name, value })),
      postData: Object.entries(postDist).map(([name, value]) => ({ name, value })),
      tenureAlerts
    };
  }, [projectStaff]);

  // --- 6. PhD Scholar Pipeline ---
  const phdPipeline = useMemo(() => {
    const statusData = [
      { name: 'Coursework', value: phDStudents.filter(s => s.CurrentStatus === 'Coursework').length, color: '#FFD700' },
      { name: 'Ongoing', value: phDStudents.filter(s => s.CurrentStatus === 'Ongoing').length, color: '#3B82F6' },
      { name: 'Thesis Submitted', value: phDStudents.filter(s => s.CurrentStatus === 'Thesis Submitted').length, color: '#10B981' }
    ];
    return statusData;
  }, [phDStudents]);

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif">Institutional Intelligence Dashboard</h1>
          <p className="text-text-muted mt-1 font-medium">Visualization of CSIR-AMPRI Strategic Performance Metrics</p>
        </div>
        <div className={`hidden lg:flex items-center gap-3 border px-6 py-3 rounded-2xl ${isBackendProvisioned ? 'bg-surface border-border' : 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'}`}>
           <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${isBackendProvisioned ? 'bg-emerald-500' : 'bg-amber-400'}`} />
           <span className={`text-xs font-semibold uppercase tracking-widest ${isBackendProvisioned ? 'text-text' : 'text-amber-700 dark:text-amber-400'}`}>
             {isBackendProvisioned ? 'Cloud Vault Connected' : 'Demo Mode — Mock Data'}
           </span>
        </div>
      </div>

      {/* Primary Metrics Group */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
         <StatCard 
            title="Total Human Capital" 
            value={humanCapitalStats.permanent + humanCapitalStats.project + humanCapitalStats.phd} 
            subtitle={`${humanCapitalStats.permanent} Permanent | ${humanCapitalStats.project} Project | ${humanCapitalStats.phd} PhD`}
            icon={<Users className="text-[#c96442]" />}
          />
         <StatCard 
            title="Research Portfolio" 
            value={projects.length} 
            subtitle={`${projects.filter(p => p.ProjectStatus === 'Active').length} Active Missions`}
            icon={<Briefcase className="text-[#d97757]" />}
          />
         <StatCard 
            title="S&T Output" 
            value="N/A" 
            subtitle="Publications & IP Pending"
            icon={<Award className="text-emerald-500" />} 
          />
         <StatCard 
            title="Utilization Index" 
            value="100%" 
            subtitle="System Resources Healthy"
            icon={<TrendingUp className="text-[#5e5d59]" />} 
          />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Human Capital Pulse Card */}
        <Card className="lg:col-span-2 p-8 border-none ring-1 ring-border bg-surface relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 bg-[#c96442]/5 rounded-full blur-3xl" />
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#c96442]/10 flex items-center justify-center text-[#c96442]">
                <Users size={20} />
              </div>
              <h3 className="text-xl font-[500] text-text uppercase tracking-tight font-serif">Staff Demographics & Distribution</h3>
            </div>
            <div className="flex gap-2">
               <Badge variant="success" className="px-3 py-1 text-[10px] font-black uppercase tracking-widest leading-none">Live Census</Badge>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
               <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={demographicData.ageBuckets} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                      <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                      <YAxis fontSize={10} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: '12px', fontSize: '10px' }} />
                      <Bar dataKey="value" fill="#c96442" radius={[4, 4, 0, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
               </div>
               <div className="text-center">
                 <p className="text-[10px] font-black uppercase text-text-muted tracking-widest">Age-wise Distribution (Institutional)</p>
               </div>
            </div>

            <div className="flex flex-col justify-center gap-8">
               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-background/80 p-4 rounded-2xl border border-border">
                     <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-1">Scientists</div>
                     <div className="text-2xl font-semibold text-[#c96442]">{humanCapitalStats.groups.Scientific}</div>
                  </div>
                  <div className="bg-background/80 p-4 rounded-2xl border border-border">
                     <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-1">Technical</div>
                     <div className="text-2xl font-semibold text-emerald-500">{humanCapitalStats.groups.Technical}</div>
                  </div>
                  <div className="bg-background/80 p-4 rounded-2xl border border-border">
                     <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-1">Admin Staff</div>
                     <div className="text-2xl font-semibold text-[#5e5d59]">{humanCapitalStats.groups.Admin}</div>
                  </div>
                  <div className="bg-background/80 p-4 rounded-2xl border border-border flex flex-col items-center justify-center overflow-hidden relative">
                    <div className="absolute inset-0 opacity-10">
                      <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                            <Pie data={demographicData.genderDist} dataKey="value" stroke="none">
                               {demographicData.genderDist.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                            </Pie>
                         </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1 relative z-10">Gender Parity</div>
                    <div className="text-sm font-black text-text relative z-10">
                      M {demographicData.genderDist[0].value} / F {demographicData.genderDist[1].value}
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </Card>

        {/* PhD Pipeline Tracker */}
        <Card className="p-8 border-none ring-1 ring-border bg-surface relative">
           <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-[#c96442]/10 flex items-center justify-center text-[#c96442]">
                    <BookOpen size={20} />
                 </div>
                 <h3 className="text-xl font-[500] text-text uppercase tracking-tight font-serif">PhD Scholar Pipeline</h3>
              </div>
           </div>
           
           <div className="h-[250px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                    <Pie
                      data={phdPipeline}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {phdPipeline.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px' }} />
                 </PieChart>
              </ResponsiveContainer>
           </div>
           
           <div className="space-y-3 mt-6">
              {phdPipeline.map(item => (
                <div key={item.name} className="flex items-center justify-between p-3 bg-background rounded-xl border border-border">
                   <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">{item.name}</span>
                   </div>
                   <span className="text-sm font-black text-text">{item.value}</span>
                </div>
              ))}
           </div>
        </Card>

        {/* Project Intelligence Card */}
        <Card className="lg:col-span-2 p-8 border-none ring-1 ring-border bg-surface overflow-hidden">
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-[#c96442]/10 flex items-center justify-center text-[#c96442]">
                    <PieChartIcon size={20} />
                 </div>
                 <div>
                    <h3 className="text-xl font-[500] text-text uppercase tracking-tight font-serif">Project Financial Overview</h3>
                    <p className="text-[10px] font-semibold text-text-muted tracking-widest uppercase mt-0.5">Category distribution & performance</p>
                 </div>
              </div>
              <div className="flex gap-4">
                 <div className="text-right">
                    <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-1">Avg Project Value</div>
                    <div className="text-lg font-semibold text-[#c96442]">₹{projectStats.avgValue}L</div>
                 </div>
                 <div className="text-right border-l border-border pl-4">
                    <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-1">Avg Tenure</div>
                    <div className="text-lg font-semibold text-[#d97757]">{projectStats.avgTenure}Y</div>
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="h-[250px]">
                 <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                       <Pie data={projectStats.categoryData} innerRadius={50} outerRadius={70} dataKey="value" startAngle={90} endAngle={450}>
                          {projectStats.categoryData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                       </Pie>
                       <Tooltip />
                    </PieChart>
                 </ResponsiveContainer>
              </div>
              <div className="space-y-4">
                 <div className="text-[10px] font-semibold text-[#c96442] uppercase tracking-[0.2em] mb-4">Missions ending in 30 Days</div>
                 {projectStats.endingSoon.length > 0 ? projectStats.endingSoon.map(p => (
                   <div key={p.ProjectID} className="flex items-center justify-between p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl group hover:bg-rose-500/10 transition-colors">
                      <div className="min-w-0">
                         <div className="text-[10px] font-black text-rose-500 uppercase font-mono">{p.ProjectNo}</div>
                         <div className="text-xs font-bold text-text truncate max-w-[180px]">{p.ProjectName}</div>
                      </div>
                      <Badge variant="danger" className="text-[8px] font-black">{diffInDays(parseDate(p.CompletioDate)!, new Date())}D LEFT</Badge>
                   </div>
                 )) : (
                    <div className="text-center py-6 text-xs text-text-muted italic border-2 border-dashed border-border rounded-xl">
                       No projects nearing termination.
                    </div>
                 )}
              </div>
           </div>
        </Card>

        {/* Retirement Pulse Forecaster */}
        <Card className="p-8 border-none ring-1 ring-border bg-surface">
           <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                    <Calendar size={20} />
                 </div>
                 <h3 className="text-xl font-[500] text-text uppercase tracking-tight font-serif">Retirement Pulse</h3>
              </div>
              <div className="relative">
                 <select 
                    value={retirementPeriod} 
                    onChange={(e) => setRetirementPeriod(Number(e.target.value))}
                    className="appearance-none bg-background border border-border rounded-lg pl-3 pr-8 py-1.5 text-[10px] font-semibold uppercase text-text-muted focus:ring-2 focus:ring-[#3898ec] outline-none cursor-pointer"
                 >
                    <option value={0.5}>6 Months</option>
                    <option value={1}>1 Year</option>
                    <option value={3}>3 Years</option>
                    <option value={5}>5 Years</option>
                 </select>
                 <Filter size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
           </div>

           <div className="space-y-4 max-h-[400px] overflow-y-auto stylish-scrollbar pr-2">
              {retirementList.length > 0 ? retirementList.map(s => (
                <div key={s.ID} className="p-4 rounded-2xl bg-background border border-border group hover:border-[#c96442]/30 transition-all">
                   <div className="flex items-center gap-4 mb-3">
                      <div className="w-10 h-10 rounded-full bg-[#f0eee6] flex items-center justify-center font-semibold text-[#c96442] text-sm uppercase">
                         {s.Name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                         <div className="text-xs font-semibold text-text truncate uppercase lg:group-hover:text-[#c96442] transition-colors">{s.Name}</div>
                         <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider truncate">{s.Designation}</div>
                      </div>
                   </div>
                   <div className="flex items-center justify-between pt-3 border-t border-border/50">
                      <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Retires On</div>
                      <div className="text-[11px] font-semibold font-mono text-[#c96442] py-1 px-3 bg-[#c96442]/5 rounded-lg border border-[#c96442]/10">
                        {s.retirementDate?.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.')}
                      </div>
                   </div>
                </div>
              )) : (
                <div className="text-center py-12 text-xs text-text-muted italic border-2 border-dashed border-border rounded-2xl bg-background/50">
                   Zero institutional retirements<br/>scheduled for this period.
                </div>
              )}
           </div>
        </Card>

        {/* Project Staff Intelligence Card */}
        <Card className="lg:col-span-3 p-8 border-none ring-1 ring-border bg-surface overflow-hidden relative">
          <div className="absolute top-0 left-0 w-64 h-64 bg-[#c96442]/5 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#c96442] text-white flex items-center justify-center">
                <UserCheck size={24} />
              </div>
              <div>
                <h3 className="text-2xl font-[500] text-text uppercase tracking-tight font-serif">Project Personnel Analytics</h3>
                <p className="text-xs font-medium text-text-muted uppercase tracking-[0.2em] mt-1">Contractual workforce dynamics & transitions</p>
              </div>
            </div>
            <div className="flex gap-4 pb-4 md:pb-0">
               <div className="px-6 py-2 bg-background border border-border rounded-xl text-center min-w-[120px]">
                  <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-1">Active Pool</div>
                  <div className="text-xl font-semibold text-text">{projectStaff.length}</div>
               </div>
               <div className="px-6 py-2 bg-background border border-border rounded-xl text-center min-w-[120px]">
                  <div className="text-[10px] font-semibold text-[#5e5d59] uppercase tracking-widest mb-1">New Gen (2024)</div>
                  <div className="text-xl font-semibold text-[#5e5d59]">{projectStaff.filter(s => s.RecruitmentCycle === '2024').length}</div>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 items-start relative z-10">
             
             {/* Year distribution */}
             <div>
                <div className="text-[11px] font-semibold text-text uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                  <div className="h-4 w-1 bg-[#c96442] rounded-full" />
                  Recruitment Trend
                </div>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={projectStaffStats.recruitmentData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                      <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                      <YAxis fontSize={10} axisLine={false} tickLine={false} />
                      <Bar dataKey="value" fill="#c96442" radius={[4, 4, 0, 0]} barSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
             </div>

             {/* Post Distribution */}
             <div>
                <div className="text-[11px] font-semibold text-text uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                  <div className="h-4 w-1 bg-[#d97757] rounded-full" />
                  Designation Matrix
                </div>
                <div className="space-y-3">
                  {projectStaffStats.postData.map(item => (
                    <div key={item.name} className="flex flex-col gap-1.5">
                       <div className="flex justify-between items-center text-[10px] font-medium uppercase tracking-widest">
                          <span className="text-text-muted">{item.name}s</span>
                          <span className="text-text font-semibold">{item.value} Units</span>
                       </div>
                       <div className="h-1.5 w-full bg-[#f0eee6] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#c96442] rounded-full transition-all duration-1000"
                            style={{ width: `${(item.value / projectStaff.length) * 100}%` }}
                          />
                       </div>
                    </div>
                  ))}
                </div>
             </div>

             {/* Tenure Alerts (3 months) */}
             <div>
                <div className="text-[11px] font-black text-rose-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                  <div className="h-4 w-1 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
                  Tenure Alerts (90 Days)
                </div>
                <div className="space-y-3">
                  {projectStaffStats.tenureAlerts.length > 0 ? projectStaffStats.tenureAlerts.map(s => (
                    <div key={s.id} className="group p-4 bg-background border border-border rounded-2xl flex items-center justify-between hover:border-rose-500/30 hover:bg-rose-500/5 transition-all">
                       <div className="min-w-0">
                          <div className="text-xs font-black text-text truncate uppercase group-hover:text-rose-600 transition-colors">{s.StaffName}</div>
                          <div className="text-[10px] font-bold text-text-muted uppercase font-mono mt-0.5">{s.ProjectNo}</div>
                       </div>
                       <div className="text-right">
                         <div className="inline-flex items-center gap-1.5 text-rose-600 font-bold">
                            <Clock size={12} strokeWidth={3} />
                            <span className="text-[9px] uppercase tracking-widest">Expires</span>
                         </div>
                         <div className="text-[10px] font-semibold text-[#141413] mt-0.5">{s.DateOfProjectDuration.replace(/-/g, '.')}</div>
                       </div>
                    </div>
                  )) : (
                    <div className="text-center py-10 px-8 text-xs text-text-muted italic border-2 border-dashed border-border rounded-2xl bg-background/50">
                       No contractual transitions<br/>impending this quarter.
                    </div>
                  )}
                </div>
                {projectStaffStats.tenureAlerts.length > 0 && (
                   <button className="w-full mt-4 flex items-center justify-center gap-2 text-[10px] font-semibold text-[#c96442] uppercase tracking-widest hover:text-[#b5593b] transition-all">
                      Review Advanced Pipeline <ArrowUpRight size={14} />
                   </button>
                )}
             </div>

          </div>
        </Card>

      </div>
      {/* Division Staffing Overview */}
      {divisions.length > 0 && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <Users size={24} />
              </div>
              <div>
                <h3 className="text-2xl font-[500] text-text uppercase tracking-tight font-serif">Divisional Staffing Status</h3>
                <p className="text-xs font-bold text-text-muted uppercase tracking-[0.2em] mt-1">
                  Sanctioned vs. current strength across all divisions
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="px-4 py-2 bg-background border border-border rounded-xl text-center">
                <div className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Total Sanctioned</div>
                <div className="text-xl font-black text-text">
                  {divisions.reduce((s, d) => s + (d.divSanctionedstrength || 0), 0)}
                </div>
              </div>
              <div className="px-4 py-2 bg-background border border-border rounded-xl text-center">
                <div className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Total Vacant</div>
                <div className="text-xl font-black text-amber-500">
                  {divisions.reduce((s, d) => s + Math.max(0, (d.divSanctionedstrength || 0) - (d.divCurrentStrength || 0)), 0)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {divisions.map(div => {
              const gap = Math.max(0, (div.divSanctionedstrength || 0) - (div.divCurrentStrength || 0));
              const pct = div.divSanctionedstrength
                ? Math.round(((div.divCurrentStrength || 0) / div.divSanctionedstrength) * 100)
                : 100;
              return (
                <Card key={div.divCode} className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-[#c96442] uppercase tracking-widest">{div.divCode}</div>
                      <div className="text-sm font-bold text-text mt-0.5 leading-tight">{div.divName}</div>
                    </div>
                    {gap > 0 ? (
                      <span className="text-[10px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap shrink-0">
                        {gap} vacant
                      </span>
                    ) : (
                      <span className="text-[10px] font-black px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 whitespace-nowrap shrink-0">
                        Full
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-text-muted mb-1.5">
                      <span>{div.divCurrentStrength} / {div.divSanctionedstrength} filled</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct < 70 ? 'bg-rose-500' : pct < 90 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
