import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { Card, Badge } from '../components/ui/Cards';
import { DataTable } from '../components/ui/DataTable';
import {
  Search, Crown, Target, Phone, Users, Lightbulb, Info,
  Briefcase, Settings2, BookOpen, ChevronRight, AlertTriangle,
  CheckCircle2, Clock, ExternalLink
} from 'lucide-react';
import clsx from 'clsx';

export default function Divisions() {
  const { divisions, staff, projects, equipment, scientificOutputs, ipIntelligence } = useData();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivCode, setSelectedDivCode] = useState<string | null>(
    divisions.length > 0 ? divisions[0].divCode : null
  );

  const filteredDivisions = divisions.filter(div => {
    const s = searchQuery.toLowerCase();
    return (div.divCode?.toLowerCase() || '').includes(s) ||
      (div.divName?.toLowerCase() || '').includes(s);
  });

  const selectedDiv = divisions.find(d => d.divCode === selectedDivCode) || divisions[0];

  const divStaff = useMemo(() => {
    if (!selectedDiv) return [];
    return staff.filter(s => s.Division === selectedDiv.divCode);
  }, [selectedDiv, staff]);

  const hod = useMemo(() => {
    if (!selectedDiv) return null;
    return staff.find(s => s.ID === selectedDiv.divHoDID);
  }, [selectedDiv, staff]);

  const researchAreas = useMemo(() => {
    if (!selectedDiv?.divResearchAreas) return [];
    return selectedDiv.divResearchAreas.split(',').map(s => s.trim()).filter(Boolean);
  }, [selectedDiv]);

  // ── New relationship data ──
  const divProjects = useMemo(() => {
    if (!selectedDiv) return [];
    return projects.filter(p => p.DivisionCode === selectedDiv.divCode);
  }, [projects, selectedDiv]);

  const divEquipment = useMemo(() => {
    if (!selectedDiv) return [];
    return equipment.filter(e => e.Division === selectedDiv.divCode);
  }, [equipment, selectedDiv]);

  const divPublications = useMemo(() => {
    if (!selectedDiv) return [];
    return scientificOutputs.filter(p => p.divisionCode === selectedDiv.divCode);
  }, [scientificOutputs, selectedDiv]);

  const divIP = useMemo(() => {
    if (!selectedDiv) return [];
    return ipIntelligence.filter(ip => ip.divisionCode === selectedDiv.divCode);
  }, [ipIntelligence, selectedDiv]);

  const vacancyGap = selectedDiv
    ? (selectedDiv.divSanctionedstrength || 0) - (selectedDiv.divCurrentStrength || 0)
    : 0;

  // Derived counts
  const scientistsCount = divStaff.filter(
    s => s.Group?.toLowerCase().includes('iv') || s.Designation?.toLowerCase().includes('scientist')
  ).length;
  const technicalCount = divStaff.filter(
    s => s.Group?.toLowerCase().includes('iii') || s.Group?.toLowerCase().includes('ii') ||
      s.Designation?.toLowerCase().includes('technical')
  ).length;

  const staffColumns = [
    {
      header: 'Officer Identity',
      cell: (s: any) => {
        const isHoD = s.ID === selectedDiv?.divHoDID;
        return (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#c96442]/10 text-[#c96442] flex items-center justify-center font-bold text-sm shrink-0">
              {isHoD ? <Crown size={16} className="text-amber-500" /> : s.Name?.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-text">{s.Name}</span>
                {isHoD && <Badge variant="warning" className="text-[9px] py-0 px-1.5 h-4">HOD</Badge>}
              </div>
              <div className="text-xs text-text-muted mt-0.5">{s.Designation}</div>
            </div>
          </div>
        );
      }
    },
    {
      header: 'Scientific Competence',
      cell: (s: any) => (
        <div>
          <div className="text-xs font-bold text-text uppercase tracking-wide">{s.CoreArea || 'General Ops'}</div>
          <div className="text-[11px] text-text-muted mt-1 italic leading-tight line-clamp-1">
            "{s.Expertise || 'Administrative Support'}"
          </div>
        </div>
      )
    },
    {
      header: 'Group',
      cell: (s: any) => (
        <Badge variant={s.Group === 'Scientific' ? 'success' : 'neutral'}>{s.Group}</Badge>
      )
    },
    {
      header: 'Service Commenced',
      accessorKey: 'DOJ' as const,
      className: 'font-mono text-xs text-text-muted'
    }
  ];

  const renderStaffCard = (s: any) => {
    const isHoD = s.ID === selectedDiv?.divHoDID;
    return (
      <div
        onClick={() => navigate(`/staff/${s.ID}`)}
        className="cursor-pointer rounded-2xl border border-border bg-surface hover:bg-surface-hover hover:border-[#c96442]/50 transition-colors p-5 flex flex-col h-full"
      >
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-[#c96442]/10 text-[#c96442] flex items-center justify-center font-bold text-lg shrink-0">
            {isHoD ? <Crown size={24} className="text-amber-500" /> : s.Name?.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-text truncate">{s.Name}</h3>
              {isHoD && <Badge variant="warning" className="text-[9px] py-0 h-4">HOD</Badge>}
            </div>
            <div className="text-sm text-[#c96442] font-medium mt-0.5 truncate">{s.Designation}</div>
          </div>
        </div>
        <div className="space-y-3 mt-auto mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Expertise</div>
            <div className="text-xs font-medium text-text">{s.CoreArea || 'Institutional Support'}</div>
          </div>
          <Badge variant={s.Group === 'Scientific' ? 'success' : 'neutral'}>{s.Group}</Badge>
        </div>
        <div className="pt-4 border-t border-border/50 text-xs text-text-muted flex justify-between items-center mt-auto">
          <span>Joined: {s.DOJ || 'N/A'}</span>
          <span className="font-mono text-[10px] bg-background px-2 py-0.5 rounded border border-border">{s.ID}</span>
        </div>
      </div>
    );
  };

  if (!selectedDiv) {
    return <div className="p-8 text-center text-text-muted">No divisions found.</div>;
  }

  return (
    <div className="flex h-[calc(100vh-theme(spacing.16)-theme(spacing.16))] -m-8 overflow-hidden">

      {/* Sidebar */}
      <div className="w-80 border-r border-border bg-surface flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
            <input
              type="text"
              placeholder="Filter Divisions..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3898ec]/50 text-text transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto stylish-scrollbar">
          {filteredDivisions.map(div => {
            const isSelected = div.divCode === selectedDivCode;
            const gap = (div.divSanctionedstrength || 0) - (div.divCurrentStrength || 0);
            return (
              <button
                key={div.divCode}
                onClick={() => setSelectedDivCode(div.divCode)}
                className={clsx(
                  'w-full text-left p-5 border-b border-border/50 transition-all relative group',
                  isSelected ? 'bg-[#c96442]/5' : 'hover:bg-surface-hover'
                )}
              >
                {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#c96442]" />}
                <div className="flex justify-between items-start mb-2">
                  <span className={clsx('text-sm font-bold tracking-tight', isSelected ? 'text-[#c96442]' : 'text-text')}>
                    {div.divCode}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={clsx(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full',
                      isSelected ? 'bg-[#c96442] text-white' : 'bg-surface-hover text-text-muted group-hover:bg-border transition-colors'
                    )}>
                      {div.divCurrentStrength || 0}
                    </span>
                    {gap > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        -{gap}
                      </span>
                    )}
                  </div>
                </div>
                <h4 className={clsx(
                  'text-[11px] font-medium leading-relaxed tracking-wide transition-colors',
                  isSelected ? 'text-[#c96442]/80' : 'text-text-muted group-hover:text-text'
                )}>
                  {div.divName}
                </h4>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-background/50 p-8 space-y-8 stylish-scrollbar">

        {/* Header */}
        <div className="relative p-12 rounded-[32px] overflow-hidden border border-border glass">
          <div className="absolute inset-0 bg-gradient-to-br from-[#c96442]/10 via-transparent to-[#d97757]/5" />
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Info size={120} className="rotate-12 text-[#c96442]" />
          </div>
          <div className="relative z-10 max-w-4xl space-y-6">
            <div className="flex items-center gap-3">
              <Badge variant="info" className="uppercase tracking-widest text-[10px] font-black px-3 py-1">Institutional Division</Badge>
              {vacancyGap > 0 && (
                <Badge variant="warning" className="uppercase tracking-widest text-[10px] font-black px-3 py-1 flex items-center gap-1">
                  <AlertTriangle size={10} /> {vacancyGap} open position{vacancyGap > 1 ? 's' : ''}
                </Badge>
              )}
              <div className="h-px flex-1 bg-border" />
            </div>
            <h1 className="text-5xl font-[500] tracking-tight text-text uppercase font-serif">{selectedDiv.divName}</h1>
            <p className="text-lg text-text-muted italic font-medium leading-relaxed max-w-3xl border-l-4 border-[#c96442] pl-6">
              "{selectedDiv.divDescription || 'No description available for this division.'}"
            </p>
            {/* Strength bar */}
            <div className="flex items-center gap-4">
              <div className="text-[10px] font-black text-text-muted uppercase tracking-widest whitespace-nowrap">
                Strength {selectedDiv.divCurrentStrength}/{selectedDiv.divSanctionedstrength}
              </div>
              <div className="flex-1 h-2 bg-border/60 rounded-full overflow-hidden max-w-xs">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all',
                    vacancyGap > 3 ? 'bg-amber-500' : 'bg-emerald-500'
                  )}
                  style={{ width: `${Math.min(100, Math.round(((selectedDiv.divCurrentStrength || 0) / (selectedDiv.divSanctionedstrength || 1)) * 100))}%` }}
                />
              </div>
              <div className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                {Math.round(((selectedDiv.divCurrentStrength || 0) / (selectedDiv.divSanctionedstrength || 1)) * 100)}% filled
              </div>
            </div>
          </div>
        </div>

        {/* HoD + Research Areas */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* HoD */}
          <Card className="p-8 border-none ring-1 ring-border bg-surface relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-all" />
            <div className="flex items-center gap-2 mb-8 uppercase text-[10px] font-black text-amber-500 tracking-[0.2em]">
              <Crown size={18} />
              <span>Head of Division</span>
            </div>
            {hod ? (
              <div>
                <div className="flex gap-8 items-start mb-8">
                  <div className="w-24 h-24 rounded-2xl bg-[#c96442]/5 border border-[#c96442]/10 text-[#c96442] flex items-center justify-center text-4xl font-semibold shrink-0">
                    {hod.Name.charAt(0)}
                  </div>
                  <div className="space-y-3 py-1">
                    <h3 className="text-2xl font-[500] text-text tracking-tight font-serif">{hod.Name}</h3>
                    <p className="text-[#c96442] font-bold text-sm uppercase tracking-widest bg-[#c96442]/5 inline-block px-3 py-1 rounded-lg">
                      {hod.Designation}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-4">
                      <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-background text-[11px] font-bold text-text-muted border border-border shadow-sm">
                        ID: {hod.ID}
                      </span>
                      <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-background text-[11px] font-bold text-[#c96442] border border-[#c96442]/10">
                        {hod.Email || 'No Email'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-auto pt-6 border-t border-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-text-muted">
                      <Phone size={18} />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-0.5">Communication</div>
                      <p className="text-sm font-bold text-text">Ext: {hod.Ext || 'N/A'}</p>
                    </div>
                  </div>
                  <Link
                    to={`/staff/${hod.ID}`}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-[#c96442] hover:underline"
                  >
                    Full Profile <ChevronRight size={12} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-text-muted italic">
                No Head of Division assigned.
              </div>
            )}
          </Card>

          {/* Research Framework */}
          <Card className="p-8 border-none ring-1 ring-border bg-surface relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 bg-[#c96442]/5 rounded-full blur-3xl group-hover:bg-[#c96442]/10 transition-all" />
            <div className="flex items-center gap-2 mb-8 uppercase text-[10px] font-semibold text-[#5e5d59] tracking-[0.2em]">
              <Target size={18} />
              <span>Research Framework</span>
            </div>
            {researchAreas.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {researchAreas.map((area, idx) => (
                  <div key={idx} className="group/item relative">
                    <div className="absolute -inset-1 bg-gradient-to-r from-[#c96442] to-[#d97757] rounded-full opacity-0 group-hover/item:opacity-20 blur transition-opacity" />
                    <div className="relative flex items-center gap-3 text-xs font-semibold text-text uppercase tracking-widest border border-border px-5 py-3 rounded-2xl bg-surface hover:border-[#c96442]/40 transition-all">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[#c96442]/10 text-[#c96442]">
                        <Lightbulb size={14} />
                      </div>
                      {area}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-text-muted italic">
                No research frameworks documented.
              </div>
            )}
          </Card>
        </div>

        {/* Personnel Registry */}
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border">
            <div className="flex items-center gap-4 text-text">
              <div className="w-12 h-12 rounded-2xl bg-[#c96442] text-white flex items-center justify-center">
                <Users size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-[500] uppercase tracking-tight font-serif">Personnel Registry</h2>
                <p className="text-xs text-text-muted font-bold tracking-[0.1em] mt-1 uppercase">Active Division Members</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="px-6 py-2.5 rounded-2xl bg-surface border border-border shadow-sm flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#c96442] animate-pulse" />
                <span className="text-xs font-black text-text uppercase whitespace-nowrap">{scientistsCount} Scientists</span>
              </div>
              <div className="px-6 py-2.5 rounded-2xl bg-surface border border-border shadow-sm flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-black text-text uppercase whitespace-nowrap">{technicalCount} Technical</span>
              </div>
              {vacancyGap > 0 && (
                <div className="px-6 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 shadow-sm flex items-center gap-3">
                  <AlertTriangle size={14} className="text-amber-500" />
                  <span className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase whitespace-nowrap">{vacancyGap} Vacant</span>
                </div>
              )}
            </div>
          </div>
          <DataTable
            data={divStaff}
            columns={staffColumns}
            keyExtractor={item => item.ID}
            itemsPerPage={10}
            renderGridItem={renderStaffCard}
            onRowClick={item => navigate(`/staff/${item.ID}`)}
          />
        </div>

        {/* Divisional Projects */}
        {divProjects.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
              <div className="w-10 h-10 rounded-xl bg-[#c96442] text-white flex items-center justify-center">
                <Briefcase size={20} />
              </div>
              <div>
                <h2 className="text-xl font-[500] uppercase tracking-tight text-text font-serif">Divisional Projects</h2>
                <p className="text-xs text-text-muted font-bold tracking-widest uppercase mt-0.5">{divProjects.length} research grants</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {divProjects.map(proj => (
                <Link
                  key={proj.ProjectID}
                  to={`/projects/${proj.ProjectID}`}
                  className="flex items-start gap-4 p-4 rounded-2xl border border-border bg-surface hover:border-[#c96442]/40 hover:bg-surface-hover transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-[#c96442]">{proj.ProjectNo}</span>
                      <Badge variant={proj.ProjectStatus === 'Active' ? 'success' : 'neutral'} className="text-[9px]">
                        {proj.ProjectStatus}
                      </Badge>
                    </div>
                    <p className="text-sm font-bold text-text truncate group-hover:text-[#c96442] transition-colors">{proj.ProjectName}</p>
                    <p className="text-xs text-text-muted mt-1">{proj.PrincipalInvestigator} • {proj.SponsorerName}</p>
                  </div>
                  <ChevronRight size={16} className="text-text-muted group-hover:text-[#c96442] group-hover:translate-x-1 transition-all shrink-0 mt-1" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Lab Equipment */}
        {divEquipment.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
              <div className="w-10 h-10 rounded-xl bg-[#5e5d59] text-white flex items-center justify-center">
                <Settings2 size={20} />
              </div>
              <div>
                <h2 className="text-xl font-[500] uppercase tracking-tight text-text font-serif">Lab Equipment</h2>
                <p className="text-xs text-text-muted font-bold tracking-widest uppercase mt-0.5">{divEquipment.length} instruments</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {divEquipment.map(eq => {
                const statusVariant: 'success' | 'warning' | 'neutral' =
                  eq.WorkingStatus === 'Working' ? 'success' :
                    eq.WorkingStatus === 'Under Maintenance' ? 'warning' : 'neutral';
                const StatusIcon = eq.WorkingStatus === 'Working' ? CheckCircle2 :
                  eq.WorkingStatus === 'Under Maintenance' ? Clock : AlertTriangle;
                return (
                  <div key={eq.UInsID} className="p-4 rounded-2xl border border-border bg-surface hover:bg-surface-hover transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-text truncate">{eq.Name}</p>
                        <p className="text-xs text-text-muted font-mono mt-0.5">{eq.UInsID}</p>
                        <p className="text-xs text-text-muted mt-1">{eq.Location}</p>
                      </div>
                      <Badge variant={statusVariant} className="flex items-center gap-1 shrink-0">
                        <StatusIcon size={10} />
                        {eq.WorkingStatus}
                      </Badge>
                    </div>
                    <div className="flex gap-3 mt-3 text-[10px] text-text-muted">
                      <span>Manager: {eq.IndenterName}</span>
                      <span>• Op: {eq.OperatorName}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Publications */}
        {divPublications.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
              <div className="w-10 h-10 rounded-xl bg-[#5e5d59] text-white flex items-center justify-center">
                <BookOpen size={20} />
              </div>
              <div>
                <h2 className="text-xl font-[500] uppercase tracking-tight text-text font-serif">Research Publications</h2>
                <p className="text-xs text-text-muted font-bold tracking-widest uppercase mt-0.5">{divPublications.length} journals</p>
              </div>
            </div>
            <div className="space-y-3">
              {divPublications.map(pub => (
                <div key={pub.id} className="p-4 rounded-2xl border border-border bg-surface hover:bg-surface-hover transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-text leading-snug">{pub.title}</p>
                      <p className="text-xs text-text-muted italic mt-1">{pub.journal} ({pub.year})</p>
                      <p className="text-xs text-text-muted mt-0.5">{pub.authors.join(', ')}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 items-end shrink-0">
                      <Badge variant="info">IF: {pub.impactFactor}</Badge>
                      <Badge variant="neutral">Cit: {pub.citationCount}</Badge>
                    </div>
                  </div>
                  {pub.doi && (
                    <a
                      href={`https://doi.org/${pub.doi}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[10px] text-[#c96442] hover:underline mt-2"
                    >
                      <ExternalLink size={10} /> {pub.doi}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* IP Portfolio */}
        {divIP.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center">
                <Lightbulb size={20} />
              </div>
              <div>
                <h2 className="text-xl font-[500] uppercase tracking-tight text-text font-serif">IP Portfolio</h2>
                <p className="text-xs text-text-muted font-bold tracking-widest uppercase mt-0.5">{divIP.length} intellectual property assets</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {divIP.map(ip => {
                const sv: 'success' | 'info' | 'warning' =
                  ip.status === 'Granted' ? 'success' : ip.status === 'Published' ? 'info' : 'warning';
                return (
                  <div key={ip.id} className="p-4 rounded-2xl border border-border bg-surface hover:bg-surface-hover transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-text leading-snug">{ip.title}</p>
                        <p className="text-xs text-text-muted mt-1">{ip.inventors.join(', ')}</p>
                        <p className="text-[10px] text-text-muted font-mono mt-1">Filed: {ip.filingDate}</p>
                      </div>
                      <div className="flex flex-col gap-1.5 items-end shrink-0">
                        <Badge variant="neutral">{ip.type}</Badge>
                        <Badge variant={sv}>{ip.status}</Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
