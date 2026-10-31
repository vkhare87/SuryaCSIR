import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Users,
  Briefcase,
  BookOpen,
  Microscope,
  Building2,
  Lightbulb,
  FlaskConical,
  FileText,
  Network,
  Sparkles,
  X,
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useFeatureControls } from '../contexts/FeatureControlContext';
import { ENTITY_META } from '../lib/entities';
import { searchDocuments, getDocumentUrl, openDocumentUrl, type DocumentHit } from '../lib/documents/registry';
import type { StaffMember, Project, PhDStudent, ScientificOutput, IPIntelligence, Equipment, DivisionInfo, Meeting } from '../types';

// ---------------------------------------------------------------------------
// Result-set type
// ---------------------------------------------------------------------------

interface SearchResults {
  staff: StaffMember[];
  projects: Project[];
  phd: PhDStudent[];
  outputs: ScientificOutput[];
  ip: IPIntelligence[];
  equipment: Equipment[];
  divisions: DivisionInfo[];
}

function emptyResults(): SearchResults {
  return { staff: [], projects: [], phd: [], outputs: [], ip: [], equipment: [], divisions: [] };
}

/** Canonical page for a document's parent record; null → open the file itself. */
function documentRoute(d: DocumentHit, meetings: Meeting[]): string | null {
  const id = encodeURIComponent(d.entity_id);
  switch (d.entity_type) {
    case 'proposal':       return `/proposals/${id}`;
    case 'project_report': return `/reports/${id}`;
    case 'pms_report':     return `/pms/reports/${id}`;
    case 'meeting': {
      const m = meetings.find(x => x.id === d.entity_id);
      return m ? `/committees/${m.committee_id}/meetings/${m.id}` : null;
    }
    default: return null;
  }
}

const RESULT_LIMIT = 3;

// ---------------------------------------------------------------------------
// Cross-table search helper — all matching done client-side over DataContext
// ---------------------------------------------------------------------------

function searchAll(
  query: string,
  data: {
    staff: StaffMember[];
    projects: Project[];
    phDStudents: PhDStudent[];
    scientificOutputs: ScientificOutput[];
    ipIntelligence: IPIntelligence[];
    equipment: Equipment[];
    divisions: DivisionInfo[];
  }
): SearchResults {
  const q = query.toLowerCase().trim();
  if (!q) return emptyResults();

  const match = (value: string | undefined | null) =>
    value ? value.toLowerCase().includes(q) : false;

  return {
    staff: data.staff
      .filter(s => match(s.ID) || match(s.Name) || match(s.Designation) || match(s.Division) || match(s.CoreArea) || match(s.Expertise))
      .slice(0, RESULT_LIMIT),

    projects: data.projects
      .filter(p => match(p.ProjectID) || match(p.ProjectName) || match(p.ProjectNo) || match(p.SponsorerName) || match(p.PrincipalInvestigator))
      .slice(0, RESULT_LIMIT),

    phd: data.phDStudents
      .filter(p => match(p.StudentName) || match(p.Specialization) || match(p.SupervisorName) || match(p.ThesisTitle))
      .slice(0, RESULT_LIMIT),

    outputs: data.scientificOutputs
      .filter(o => match(o.title) || match(o.journal) || o.authors.some(a => match(a)))
      .slice(0, RESULT_LIMIT),

    ip: data.ipIntelligence
      .filter(i => match(i.title) || match(i.type) || match(i.status) || i.inventors.some(v => match(v)))
      .slice(0, RESULT_LIMIT),

    equipment: data.equipment
      .filter(e => match(e.UInsID) || match(e.instrument_code) || match(e.Name) || match(e.manufacturer) || match(e.EndUse) || match(e.Division) || match(e.IndenterName) || match(e.OperatorName))
      .slice(0, RESULT_LIMIT),

    divisions: data.divisions
      .filter(d => match(d.divCode) || match(d.divName))
      .slice(0, RESULT_LIMIT),
  };
}

function totalHits(results: SearchResults): number {
  return (
    results.staff.length +
    results.projects.length +
    results.phd.length +
    results.outputs.length +
    results.ip.length +
    results.equipment.length +
    results.divisions.length
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const { staff, projects, phDStudents, scientificOutputs, ipIntelligence, equipment, divisions, meetings } = useData();
  const { canAccess } = useFeatureControls();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<{ query: string; hits: DocumentHit[] }>({ query: '', hits: [] });

  // Documents live server-side; debounce, and drop responses for stale queries.
  useEffect(() => {
    if (!isOpen || query.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void searchDocuments(query).then(hits => { if (!cancelled) setDocs({ query, hits }); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, isOpen]);
  const docHits = docs.query === query ? docs.hits : [];

  // Search only the record types whose feature this user may open.
  const results = searchAll(query, {
    staff: canAccess('/staff') ? staff : [],
    projects: canAccess('/projects') ? projects : [],
    phDStudents: canAccess('/phd') ? phDStudents : [],
    scientificOutputs: canAccess('/intelligence') ? scientificOutputs : [],
    ipIntelligence: canAccess('/intelligence') ? ipIntelligence : [],
    equipment: canAccess('/facilities') ? equipment : [],
    divisions: canAccess('/divisions') ? divisions : [],
  });
  const hasResults = totalHits(results) + docHits.length > 0;

  const handleClose = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Reset query when closed externally
  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  if (!isOpen) return null;

  const go = (path: string) => {
    navigate(path);
    handleClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Search" className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-[12px] shadow-[0px_0px_0px_1px_#f0eee6] dark:shadow-[0px_0px_0px_1px_#30302e] overflow-hidden scale-in duration-200">

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border bg-surface-hover">
          <Search className="text-text-muted w-5 h-5 shrink-0" />
          <input
            autoFocus
            type="text"
            aria-label="Search records"
            placeholder="Search by name or ID: staff, projects, equipment, documents… (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-text text-base placeholder:text-text-muted/50"
          />
          <button onClick={handleClose} aria-label="Close search" className="p-1 hover:bg-surface rounded-lg text-text-muted shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
          {query ? (
            <>
              {/* --- Staff --- */}
              {results.staff.length > 0 && (
                <ResultSection label="Scientific Staff">
                  {results.staff.map((s) => (
                    <ResultRow
                      key={s.ID}
                      icon={<Users size={15} />}
                      iconBg="#f0eee6"
                      iconColor="#c96442"
                      primary={s.Name}
                      secondary={[s.Designation, s.Division].filter(Boolean).join(' • ')}
                      onClick={() => go(`/staff/${s.ID}`)}
                    />
                  ))}
                </ResultSection>
              )}

              {/* --- Projects --- */}
              {results.projects.length > 0 && (
                <ResultSection label="Research Projects">
                  {results.projects.map((p) => (
                    <ResultRow
                      key={p.ProjectID}
                      icon={<Briefcase size={15} />}
                      iconBg="#f0eee6"
                      iconColor="#5e5d59"
                      primary={p.ProjectName}
                      secondary={[p.ProjectNo, p.SponsorerName].filter(Boolean).join(' • ')}
                      onClick={() => go(ENTITY_META.project.route(p.ProjectID))}
                    />
                  ))}
                </ResultSection>
              )}

              {/* --- PhD Students --- */}
              {results.phd.length > 0 && (
                <ResultSection label="PhD Students">
                  {results.phd.map((p) => (
                    <ResultRow
                      key={p.EnrollmentNo}
                      icon={<BookOpen size={15} />}
                      iconBg="#f0eee6"
                      iconColor="#7c6f5b"
                      primary={p.StudentName}
                      secondary={[p.Specialization, p.SupervisorName ? `Supervisor: ${p.SupervisorName}` : ''].filter(Boolean).join(' • ')}
                      onClick={() => go('/phd')}
                    />
                  ))}
                </ResultSection>
              )}

              {/* --- Scientific Outputs --- */}
              {results.outputs.length > 0 && (
                <ResultSection label="Scientific Outputs">
                  {results.outputs.map((o) => (
                    <ResultRow
                      key={o.id}
                      icon={<Microscope size={15} />}
                      iconBg="#f0eee6"
                      iconColor="#c96442"
                      primary={o.title}
                      secondary={[o.journal, o.year ? String(o.year) : ''].filter(Boolean).join(' • ')}
                      onClick={() => go('/intelligence')}
                    />
                  ))}
                </ResultSection>
              )}

              {/* --- IP Intelligence --- */}
              {results.ip.length > 0 && (
                <ResultSection label="IP & Patents">
                  {results.ip.map((i) => (
                    <ResultRow
                      key={i.id}
                      icon={<Lightbulb size={15} />}
                      iconBg="#f0eee6"
                      iconColor="#8b6f47"
                      primary={i.title}
                      secondary={[i.type, i.status].filter(Boolean).join(' • ')}
                      onClick={() => go('/intelligence')}
                    />
                  ))}
                </ResultSection>
              )}

              {/* --- Equipment --- */}
              {results.equipment.length > 0 && (
                <ResultSection label="Equipment & Facilities">
                  {results.equipment.map((e) => (
                    <ResultRow
                      key={e.UInsID}
                      icon={<FlaskConical size={15} />}
                      iconBg="#f0eee6"
                      iconColor="#5e5d59"
                      primary={e.Name}
                      secondary={[e.Division, e.WorkingStatus].filter(Boolean).join(' • ')}
                      onClick={() => go(`/facilities/${encodeURIComponent(e.UInsID)}`)}
                    />
                  ))}
                </ResultSection>
              )}

              {/* --- Divisions --- */}
              {results.divisions.length > 0 && (
                <ResultSection label="Divisions">
                  {results.divisions.map((d) => (
                    <ResultRow
                      key={d.divCode}
                      icon={<Network size={15} />}
                      iconBg="#f0eee6"
                      iconColor="#7a4a1e"
                      primary={d.divName}
                      secondary={d.divCode}
                      onClick={() => go(`/divisions?div=${encodeURIComponent(d.divCode)}`)}
                    />
                  ))}
                </ResultSection>
              )}

              {/* --- Documents (title match, RLS-scoped) --- */}
              {docHits.length > 0 && (
                <ResultSection label="Documents · title match">
                  {docHits.map((d) => {
                    const route = documentRoute(d, meetings);
                    return (
                      <ResultRow
                        key={d.id}
                        icon={<FileText size={15} />}
                        iconBg="#f0eee6"
                        iconColor="#5e5d59"
                        primary={d.title}
                        secondary={[d.entity_type.replace(/_/g, ' '), d.doc_type.replace(/_/g, ' '), d.created_at.slice(0, 10)].join(' • ')}
                        onClick={() => {
                          if (route) go(route);
                          else { void openDocumentUrl(() => getDocumentUrl(d.storage_path)); handleClose(); }
                        }}
                      />
                    );
                  })}
                </ResultSection>
              )}

              {/* Empty state */}
              {!hasResults && (
                <div className="p-12 text-center">
                  <p className="text-text-muted italic">No records found for &ldquo;{query}&rdquo;</p>
                  <p className="text-xs text-text-muted/60 mt-1">Searched names and IDs you have access to, and document titles</p>
                </div>
              )}

              {/* Full-text questions go to Ask SURYA, which cites its sources */}
              {canAccess('/ask') && query.trim().length >= 2 && (
                <ResultSection label="Search inside documents">
                  <ResultRow
                    icon={<Sparkles size={15} />}
                    iconBg="#f0eee6"
                    iconColor="#c96442"
                    primary={`Ask SURYA about “${query.trim()}”`}
                    secondary="Answers from indexed documents, with page citations"
                    onClick={() => go(`/ask?q=${encodeURIComponent(query.trim())}`)}
                  />
                </ResultSection>
              )}
            </>
          ) : (
            /* Quick-navigate grid */
            <div className="p-8 text-center text-text-muted">
              <div className="flex flex-wrap justify-center gap-6 mb-6">
                {canAccess('/staff') && <QuickLink icon={<Users />} label="Staff"     iconBg="#141413" iconFg="#faf9f5" onClick={() => go('/staff')} />}
                {canAccess('/phd') && <QuickLink icon={<BookOpen />} label="PhD"     iconBg="#e8e6dc" iconFg="#4d4c48" onClick={() => go('/phd')} />}
                {canAccess('/projects') && <QuickLink icon={<Briefcase />} label="Projects" iconBg="#c96442" iconFg="#faf9f5" onClick={() => go('/projects')} />}
                {canAccess('/intelligence') && <QuickLink icon={<Microscope />} label="Outputs" iconBg="#f0eee6" iconFg="#5e5d59" onClick={() => go('/intelligence')} />}
                {canAccess('/intelligence') && <QuickLink icon={<Lightbulb />} label="IP"      iconBg="#f0eee6" iconFg="#8b6f47" onClick={() => go('/intelligence')} />}
                {canAccess('/facilities') && <QuickLink icon={<Building2 />} label="Equipment" iconBg="#f0eee6" iconFg="#5e5d59" onClick={() => go('/facilities')} />}
              </div>
              <p className="text-sm">Type to search across all institute records...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-surface-hover flex justify-between items-center text-[10px] text-text-muted font-bold tracking-tight">
          <div className="flex gap-4">
            <span className="flex items-center gap-1">
              <kbd className="bg-background border border-border px-1 rounded">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-background border border-border px-1 rounded">Enter</kbd> select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-background border border-border px-1 rounded">Esc</kbd> close
            </span>
          </div>
          <div>SURYA Institute Search</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ResultSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">{label}</h3>
      {children}
    </div>
  );
}

interface ResultRowProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  primary: string;
  secondary: string;
  onClick: () => void;
}

function ResultRow({ icon, iconBg, iconColor, primary, secondary, onClick }: ResultRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 hover:bg-surface-hover rounded-xl text-left transition-colors"
    >
      <div
        className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0"
        style={{ backgroundColor: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-text truncate" title={primary}>{primary}</div>
        {secondary && <div className="text-xs text-text-muted truncate" title={secondary}>{secondary}</div>}
      </div>
    </button>
  );
}

interface QuickLinkProps {
  icon: React.ReactNode;
  label: string;
  iconBg: string;
  iconFg: string;
  onClick: () => void;
}

function QuickLink({ icon, label, iconBg, iconFg, onClick }: QuickLinkProps) {
  return (
    <div
      className="flex flex-col items-center gap-2 cursor-pointer group"
      onClick={onClick}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"
        style={{ backgroundColor: iconBg, color: iconFg }}
      >
        {icon}
      </div>
      <span className="text-xs font-bold">{label}</span>
    </div>
  );
}
