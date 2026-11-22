import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Users, Briefcase, BookOpen, Microscope, Building2,
  Lightbulb, FlaskConical, FileText, Network, Sparkles, X,
  Clock, Sun, Moon, Layout as LayoutIcon, Maximize2, ArrowRight, Repeat,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFeatureControls } from '../contexts/FeatureControlContext';
import { useCopilot } from '../contexts/CopilotContext';
import { ENTITY_META } from '../lib/entities';
import { ALL_NAV_ITEMS } from '../constants/navigation';
import { ROLE_LABELS } from '../constants/access';
import { ROLE_ROUTES } from '../constants/roleRoutes';
import { searchDocuments, getDocumentUrl, openDocumentUrl, type DocumentHit } from '../lib/documents/registry';
import type { RecentRoute } from '../hooks/useRecentRoutes';
import type {
  StaffMember, Project, PhDStudent, ScientificOutput,
  IPIntelligence, Equipment, DivisionInfo, Meeting,
} from '../types';

interface PaletteItem {
  id: string;
  section: string;
  icon: ReactNode;
  accent?: boolean;
  primary: string;
  secondary?: string;
  badge?: string;
  run: () => void;
}

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

const RESULT_LIMIT = 4;

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
  },
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

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  recentRoutes?: RecentRoute[];
  onToggleFocusMode?: () => void;
}

export default function CommandPalette({
  isOpen, onClose, recentRoutes = [], onToggleFocusMode,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const { role, roles, setActiveRole } = useAuth();
  const { theme, setTheme, density, setDensity } = useTheme();
  const { staff, projects, phDStudents, scientificOutputs, ipIntelligence, equipment, divisions, meetings } = useData();
  const { canAccess } = useFeatureControls();
  const copilot = useCopilot();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<{ query: string; hits: DocumentHit[] }>({ query: '', hits: [] });
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Documents live server-side; debounce, and drop responses for stale queries.
  useEffect(() => {
    if (!isOpen || query.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void searchDocuments(query).then(hits => { if (!cancelled) setDocs({ query, hits }); });
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, isOpen]);

  const docHits = useMemo(() => (docs.query === query ? docs.hits : []), [docs, query]);

  const handleClose = useCallback(() => {
    setQuery('');
    setActiveIndex(0);
    onClose();
  }, [onClose]);

  const go = useCallback((path: string) => {
    navigate(path);
    handleClose();
  }, [navigate, handleClose]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const list: PaletteItem[] = [];
    const dashboardPath = role ? ROLE_ROUTES[role] : '/';

    // 1. Recent visits (when query is empty)
    if (!q && recentRoutes.length > 0) {
      recentRoutes.slice(0, 5).forEach(r => {
        list.push({
          id: `recent:${r.path}`,
          section: 'Recent',
          icon: <Clock size={15} />,
          primary: r.label,
          secondary: r.path,
          run: () => go(r.path),
        });
      });
    }

    // 2. Quick Actions (theme, density, copilot, focus, role switch)
    const actions: PaletteItem[] = [
      {
        id: 'action:theme',
        section: 'Quick Actions',
        icon: theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />,
        primary: theme === 'dark' ? 'Switch to Solar Light theme' : 'Switch to Deep Night theme',
        secondary: 'Appearance',
        run: () => { setTheme(theme === 'dark' ? 'light' : 'dark'); handleClose(); },
      },
      {
        id: 'action:density',
        section: 'Quick Actions',
        icon: <LayoutIcon size={15} />,
        primary: `Cycle density (currently ${density})`,
        secondary: 'Compact · Balanced · Spacious',
        run: () => {
          const order = ['compact', 'medium', 'relaxed'] as const;
          const next = order[(order.indexOf(density) + 1) % order.length];
          setDensity(next);
          handleClose();
        },
      },
    ];
    if (canAccess('/ask') && copilot) {
      actions.push({
        id: 'action:copilot',
        section: 'Quick Actions',
        icon: <Sparkles size={15} />,
        accent: true,
        primary: 'Open Ask SURYA Copilot',
        secondary: 'Contextual Q&A drawer (⌘J)',
        run: () => { handleClose(); copilot.openCopilot(); },
      });
    }
    if (onToggleFocusMode) {
      actions.push({
        id: 'action:focus',
        section: 'Quick Actions',
        icon: <Maximize2 size={15} />,
        primary: 'Toggle Focus Mode',
        secondary: 'Hide navigation chrome (Alt+F)',
        run: () => { onToggleFocusMode(); handleClose(); },
      });
    }
    if (roles.length > 1) {
      roles.filter(r => r !== role).forEach(r => {
        actions.push({
          id: `action:role:${r}`,
          section: 'Quick Actions',
          icon: <Repeat size={15} />,
          primary: `Switch role to ${ROLE_LABELS[r]}`,
          secondary: 'Workspace role',
          run: () => {
            void setActiveRole(r);
            navigate(ROLE_ROUTES[r]);
            handleClose();
          },
        });
      });
    }

    const matchedActions = q
      ? actions.filter(a => `${a.primary} ${a.secondary ?? ''}`.toLowerCase().includes(q))
      : actions.slice(0, 3);

    // 3. Permitted Pages & Navigation
    const permittedNav = ALL_NAV_ITEMS
      .filter(n => canAccess(n.path))
      .map(n => ({ ...n, resolvedPath: n.path === '/' ? dashboardPath : n.path }));

    const matchedNav = q
      ? permittedNav
          .filter(n => `${n.label} ${n.path} ${(n.keywords ?? []).join(' ')}`.toLowerCase().includes(q))
          .slice(0, 5)
      : [];

    matchedNav.forEach(n => {
      const Icon = n.icon;
      list.push({
        id: `nav:${n.resolvedPath}`,
        section: 'Jump to Page',
        icon: <Icon size={15} />,
        primary: n.label,
        secondary: n.resolvedPath,
        badge: 'Page',
        run: () => go(n.resolvedPath),
      });
    });

    // 4. Records & Documents (when typing)
    if (q) {
      const results = searchAll(q, {
        staff: canAccess('/staff') ? staff : [],
        projects: canAccess('/projects') ? projects : [],
        phDStudents: canAccess('/phd') ? phDStudents : [],
        scientificOutputs: canAccess('/intelligence') ? scientificOutputs : [],
        ipIntelligence: canAccess('/intelligence') ? ipIntelligence : [],
        equipment: canAccess('/facilities') ? equipment : [],
        divisions: canAccess('/divisions') ? divisions : [],
      });

      results.staff.forEach(s => list.push({
        id: `staff:${s.ID}`,
        section: 'Scientific Staff',
        icon: <Users size={15} />,
        accent: true,
        primary: s.Name,
        secondary: [s.Designation, s.Division].filter(Boolean).join(' • '),
        run: () => go(`/staff/${encodeURIComponent(s.ID)}`),
      }));

      results.projects.forEach(p => list.push({
        id: `project:${p.ProjectID}`,
        section: 'Research Projects',
        icon: <Briefcase size={15} />,
        primary: p.ProjectName,
        secondary: [p.ProjectNo, p.SponsorerName].filter(Boolean).join(' • '),
        run: () => go(ENTITY_META.project.route(p.ProjectID)),
      }));

      results.phd.forEach(p => list.push({
        id: `phd:${p.EnrollmentNo}`,
        section: 'PhD Students',
        icon: <BookOpen size={15} />,
        primary: p.StudentName,
        secondary: [p.Specialization, p.SupervisorName ? `Supervisor: ${p.SupervisorName}` : ''].filter(Boolean).join(' • '),
        run: () => go('/phd'),
      }));

      results.outputs.forEach(o => list.push({
        id: `output:${o.id}`,
        section: 'Scientific Outputs',
        icon: <Microscope size={15} />,
        accent: true,
        primary: o.title,
        secondary: [o.journal, o.year ? String(o.year) : ''].filter(Boolean).join(' • '),
        run: () => go('/intelligence'),
      }));

      results.ip.forEach(i => list.push({
        id: `ip:${i.id}`,
        section: 'IP & Patents',
        icon: <Lightbulb size={15} />,
        primary: i.title,
        secondary: [i.type, i.status].filter(Boolean).join(' • '),
        run: () => go('/intelligence'),
      }));

      results.equipment.forEach(e => list.push({
        id: `equip:${e.UInsID}`,
        section: 'Equipment & Facilities',
        icon: <FlaskConical size={15} />,
        primary: e.Name,
        secondary: [e.Division, e.WorkingStatus].filter(Boolean).join(' • '),
        run: () => go(`/facilities/${encodeURIComponent(e.UInsID)}`),
      }));

      results.divisions.forEach(d => list.push({
        id: `div:${d.divCode}`,
        section: 'Divisions',
        icon: <Network size={15} />,
        primary: d.divName,
        secondary: d.divCode,
        run: () => go(`/divisions?div=${encodeURIComponent(d.divCode)}`),
      }));

      docHits.forEach(d => {
        const route = documentRoute(d, meetings);
        list.push({
          id: `doc:${d.id}`,
          section: 'Documents · title match',
          icon: <FileText size={15} />,
          primary: d.title,
          secondary: [d.entity_type.replace(/_/g, ' '), d.doc_type.replace(/_/g, ' '), d.created_at.slice(0, 10)].join(' • '),
          run: () => {
            if (route) go(route);
            else { void openDocumentUrl(() => getDocumentUrl(d.storage_path)); handleClose(); }
          },
        });
      });
    }

    // Append Quick Actions after pages/records (or under Recent when empty)
    matchedActions.forEach(a => list.push(a));

    // Full-text Ask SURYA handoff
    if (canAccess('/ask') && q.length >= 2) {
      list.push({
        id: 'ask:query',
        section: 'Ask SURYA',
        icon: <Sparkles size={15} />,
        accent: true,
        primary: `Ask SURYA about “${query.trim()}”`,
        secondary: 'Answers from indexed documents, with page citations',
        run: () => {
          if (copilot) {
            const qText = query.trim();
            handleClose();
            copilot.openCopilot({ question: qText });
          } else {
            go(`/ask?q=${encodeURIComponent(query.trim())}`);
          }
        },
      });
    }

    return list;
  }, [
    query, role, roles, recentRoutes, theme, density, canAccess, copilot, onToggleFocusMode,
    staff, projects, phDStudents, scientificOutputs, ipIntelligence, equipment, divisions, docHits, meetings,
    go, handleClose, navigate, setActiveRole, setDensity, setTheme,
  ]);

  // Clamp activeIndex whenever item list changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query, isOpen]);

  const safeIndex = items.length > 0 ? Math.min(activeIndex, items.length - 1) : -1;

  // Keep active row visible when navigating with arrow keys
  useEffect(() => {
    if (!isOpen || safeIndex < 0) return;
    rowRefs.current[safeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [safeIndex, isOpen]);

  // Keyboard flow: ↑/↓/Home/End/Enter/Esc
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === 'ArrowDown') {
        if (items.length === 0) return;
        e.preventDefault();
        setActiveIndex(i => (i + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        if (items.length === 0) return;
        e.preventDefault();
        setActiveIndex(i => (i - 1 + items.length) % items.length);
      } else if (e.key === 'Home') {
        if (items.length === 0) return;
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        if (items.length === 0) return;
        e.preventDefault();
        setActiveIndex(items.length - 1);
      } else if (e.key === 'Enter') {
        if (safeIndex >= 0 && items[safeIndex]) {
          e.preventDefault();
          items[safeIndex].run();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, items, safeIndex, handleClose]);

  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  if (!isOpen) return null;

  // Group items preserving flattened order for keyboard indices
  const grouped: { section: string; entries: { item: PaletteItem; flatIndex: number }[] }[] = [];
  items.forEach((item, flatIndex) => {
    const existing = grouped.find(g => g.section === item.section);
    if (existing) existing.entries.push({ item, flatIndex });
    else grouped.push({ section: item.section, entries: [{ item, flatIndex }] });
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Center"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-near-black/55 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl bg-surface-raised border border-border rounded-2xl shadow-[var(--shadow-e4)] dark:shadow-[var(--shadow-e4),var(--shadow-dark-highlight)] overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-surface">
          <Search className="text-terracotta w-5 h-5 shrink-0" />
          <input
            autoFocus
            type="text"
            aria-label="Search commands, pages, or records"
            placeholder="Search pages, staff, projects, documents, or actions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-text text-base placeholder:text-text-muted/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs text-text-muted hover:text-text px-1.5 py-0.5 rounded bg-surface-hover"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close command center"
            className="p-1 hover:bg-surface-hover rounded-lg text-text-muted hover:text-text shrink-0 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick-jump strip when empty */}
        {!query && (
          <div className="px-4 py-3 border-b border-border bg-background/50 flex flex-wrap gap-2">
            {[
              { path: '/staff',        label: 'Staff',      icon: Users },
              { path: '/projects',     label: 'Projects',   icon: Briefcase },
              { path: '/pms',          label: 'PMS',        icon: FileText },
              { path: '/facilities',   label: 'Facilities', icon: Building2 },
              { path: '/intelligence', label: 'Outputs',    icon: Microscope },
              { path: '/explore',      label: 'Graph',      icon: Network },
            ].filter(qLink => canAccess(qLink.path)).map(qLink => (
              <button
                key={qLink.path}
                type="button"
                onClick={() => go(qLink.path)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs font-medium text-text hover:border-terracotta/50 hover:text-terracotta transition-colors"
              >
                <qLink.icon size={13} className="text-terracotta" />
                {qLink.label}
              </button>
            ))}
          </div>
        )}

        {/* Unified keyboard-selectable list */}
        <div role="listbox" aria-label="Results" className="max-h-[55vh] overflow-y-auto p-2 space-y-2">
          {grouped.length > 0 ? (
            grouped.map(group => (
              <div key={group.section}>
                <h3 className="px-3 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-[0.14em]">
                  {group.section}
                </h3>
                <div className="space-y-0.5">
                  {group.entries.map(({ item, flatIndex }) => {
                    const active = flatIndex === safeIndex;
                    return (
                      <button
                        key={item.id}
                        ref={el => { rowRefs.current[flatIndex] = el; }}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={item.run}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                          active ? 'bg-terracotta/12 text-text' : 'hover:bg-surface-hover text-text',
                        )}
                      >
                        <div
                          className={clsx(
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                            active || item.accent
                              ? 'bg-terracotta/15 text-terracotta'
                              : 'bg-surface-hover text-text-muted',
                          )}
                        >
                          {item.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-text truncate" title={item.primary}>
                            {item.primary}
                          </div>
                          {item.secondary && (
                            <div className="text-xs text-text-muted truncate" title={item.secondary}>
                              {item.secondary}
                            </div>
                          )}
                        </div>
                        {item.badge && (
                          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-hover text-text-muted shrink-0">
                            {item.badge}
                          </span>
                        )}
                        {active && <ArrowRight size={14} className="text-terracotta shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="p-10 text-center">
              <p className="text-sm text-text-muted italic">No matches found for &ldquo;{query}&rdquo;</p>
              <p className="text-xs text-text-muted/70 mt-1">
                Try a staff name, project code, page title, or command like &ldquo;dark&rdquo;
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border bg-surface flex justify-between items-center text-[10px] text-text-muted font-medium">
          <div className="flex gap-4">
            <span className="flex items-center gap-1">
              <kbd className="bg-background border border-border px-1.5 py-0.5 rounded font-mono">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-background border border-border px-1.5 py-0.5 rounded font-mono">↵</kbd> select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-background border border-border px-1.5 py-0.5 rounded font-mono">Esc</kbd> close
            </span>
          </div>
          <span className="font-mono uppercase tracking-wider">SURYA Command Center</span>
        </div>
      </div>
    </div>
  );
}
