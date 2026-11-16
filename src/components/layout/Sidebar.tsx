import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {Pin, PinOff, RotateCcw, Search, User, FlaskConical, Landmark, ShieldCheck, Users, Briefcase, BookOpen, LogOut, PanelLeftClose, PanelLeftOpen, Settings as SettingsIcon, LayoutDashboard, Calendar as CalendarIcon, Building2, Handshake, Activity, FileText, Database, Network, Cloud, X, ClipboardCheck, Ticket as TicketIcon, CalendarDays, UserCog, UserCheck, ScanText, Sparkles, Share2, Microscope, SlidersHorizontal, ChevronDown, Inbox, Gauge, Lightbulb, Link2, Scale, ClipboardList, TrendingUp, GraduationCap} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { HoverCard } from '../ui/HoverCard';
import { moveIn, readLayout, toggleIn, writeLayout } from '../../utils/sidebarLayout';
import type { SidebarLayout } from '../../utils/sidebarLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useFeatureControls } from '../../contexts/FeatureControlContext';
import { ROLE_ROUTES } from '../../constants/roleRoutes';
import { PRIMARY_NAV } from '../../constants/access';
import { inboxBucket, isReviewer } from '../../lib/contributions/state';
import { useDialog } from '../../utils/useDialog';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

// Grouped by what a person comes to do, in plain words: my own things, the
// people, the research, the running of the institute, the system.
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Me',
    icon: User,
    items: [
      { path: '/',             label: 'Dashboard',       icon: LayoutDashboard },
      { path: '/work',         label: 'My Work',         icon: Inbox },
      { path: '/me',           label: 'My Profile',      icon: UserCog },
      { path: '/calendar',     label: 'Calendar',        icon: CalendarIcon },
      { path: '/ask',          label: 'Ask SURYA',       icon: Sparkles },
    ],
  },
  {
    label: 'People',
    icon: Users,
    items: [
      { path: '/staff',        label: 'Human Capital',   icon: Users },
      { path: '/staff/project', label: 'Project Staff',   icon: UserCog },
      { path: '/staff/posts',  label: 'Sanctioned Posts', icon: ClipboardList },
      { path: '/staff/planning', label: 'Workforce Planning', icon: TrendingUp },
      { path: '/expertise', label: 'Expertise Finder', icon: GraduationCap },
      { path: '/admin/acting', label: 'Acting Charges',  icon: UserCheck },
      { path: '/phd',          label: 'PhD Tracker',     icon: BookOpen },
      { path: '/divisions',    label: 'Divisions',       icon: Network },
      { path: '/recruitment',  label: 'Recruitment',     icon: FileText },
    ],
  },
  {
    label: 'Research',
    icon: FlaskConical,
    items: [
      { path: '/projects',     label: 'Projects',        icon: Briefcase },
      { path: '/proposals',    label: 'Proposals',       icon: FileText },
      { path: '/reports',      label: 'Progress Reports',icon: ClipboardCheck },
      { path: '/portfolio',    label: 'Project Portfolio', icon: Gauge },
      { path: '/facilities',   label: 'Instruments',     icon: Building2 },
      { path: '/partnerships', label: 'Partnerships',    icon: Handshake },
      { path: '/rnd-monitor',  label: 'R&D Monitor',     icon: Activity },
      { path: '/intelligence', label: 'Intelligence',    icon: Microscope },
      { path: '/publication-files', label: 'Publication Files', icon: FileText },
      { path: '/explore',      label: 'Explore Graph',   icon: Share2 },
      { path: '/lessons',      label: 'Lessons Learned', icon: Lightbulb },
    ],
  },
  {
    label: 'Institute',
    icon: Landmark,
    items: [
      { path: '/pms',          label: 'Performance Mgmt',icon: ClipboardCheck },
      { path: '/committees',   label: 'Committees',      icon: Building2 },
      { path: '/helpdesk',     label: 'Helpdesk',        icon: TicketIcon },
    ],
  },
  {
    label: 'Admin',
    icon: ShieldCheck,
    items: [
      { path: '/admin/access-requests', label: 'Access Requests', icon: UserCheck },
      { path: '/admin/features', label: 'Feature Controls', icon: SlidersHorizontal },
      { path: '/data',         label: 'Data Management', icon: Database },
      { path: '/data/links',   label: 'People Links',    icon: Link2 },
      { path: '/admin/rules',  label: 'CSIR Rules',      icon: Scale },
      { path: '/irins-sync',   label: 'IRINS Sync',      icon: Cloud },
      { path: '/admin/rag',    label: 'RAG Ingestion',   icon: ScanText },
      { path: '/admin/holidays', label: 'Holidays',        icon: CalendarDays },
    ],
  },
];

const ALL_ITEMS = NAV_SECTIONS.flatMap(section => section.items);
const GROUP_OF = new Map(NAV_SECTIONS.flatMap(s => s.items.map(i => [i.path, s.label] as const)));
const RECENT_SHOWN = 3;
const HEADING = 'px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-warm-silver/55';

function CountBadge({ n }: { n: number }) {
  return (
    <span className="ml-auto shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-terracotta text-ivory text-[11px] font-semibold font-mono flex items-center justify-center">
      {n > 99 ? '99+' : n}
    </span>
  );
}

interface SidebarLinkProps {
  item: NavItem;
  expanded: boolean;
  dashboardPath: string;
  onNavigate: (e: MouseEvent) => void;
  pinned: boolean;
  count?: number;
  onTogglePin?: () => void;
  /** Present on a pinned link that can move: Alt+Up / Alt+Down. */
  onMove?: (delta: -1 | 1) => void;
  /** Touch screens have no hover, so the pin button stays on show. */
  pinAlwaysVisible: boolean;
}

function SidebarLink({ item, expanded, dashboardPath, onNavigate, pinned, count = 0, onTogglePin, onMove, pinAlwaysVisible }: SidebarLinkProps) {
  const to = item.path === '/' ? dashboardPath : item.path;
  const link = (
    <NavLink
      to={to}
      end={to === dashboardPath}
      draggable={false}
      aria-label={expanded ? undefined : item.label}
      aria-keyshortcuts={onMove ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
      onClick={onNavigate}
      onKeyDown={onMove && ((e) => {
        if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        e.preventDefault();
        onMove(e.key === 'ArrowUp' ? -1 : 1);
      })}
      className={({ isActive }) => clsx(
        'relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all group',
        expanded && onTogglePin && 'pr-9',
        isActive
          ? 'bg-dark-surface text-ivory font-medium shadow-[inset_2px_0_0_var(--color-terracotta),0_0_18px_-6px_color-mix(in_srgb,var(--color-coral)_70%,transparent)]'
          : 'text-warm-silver hover:text-ivory hover:bg-dark-surface/60'
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r bg-terracotta" />}
          <span className={clsx('relative', expanded ? 'shrink-0' : 'mx-auto shrink-0')}>
            <item.icon size={19} className={clsx(isActive && 'text-terracotta')} />
            {!expanded && count > 0 && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-terracotta" />}
          </span>
          {expanded && <span className="truncate text-sm">{item.label}</span>}
          {expanded && count > 0 && <CountBadge n={count} />}
          {count > 0 && <span className="sr-only">, {count} waiting</span>}
        </>
      )}
    </NavLink>
  );
  if (!expanded) {
    return (
      <HoverCard
        side="right" openDelay={100} content={count > 0 ? `${item.label} · ${count}` : item.label} className="block"
        panelClassName="px-2.5 py-1.5 text-xs font-medium text-text whitespace-nowrap"
      >
        {link}
      </HoverCard>
    );
  }
  return (
    <div className="relative group/link">
      {link}
      {onTogglePin && (
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
          title={pinned ? 'Unpin' : 'Pin to the top'}
          className={clsx(
            'absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded hover:text-ivory hover:bg-dark-surface transition-opacity',
            pinned ? 'text-terracotta' : 'text-warm-silver',
            !pinAlwaysVisible && 'opacity-0 group-hover/link:opacity-100 focus-visible:opacity-100',
          )}
        >
          {pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
      )}
    </div>
  );
}

interface SidebarBodyProps {
  isMobileView: boolean;
  sidebarOpen: boolean;
  onToggleCollapse: () => void;
  pinnedItems: NavItem[];
  recentItems: NavItem[];
  sections: NavSection[];
  openGroup: string | null;
  onToggleGroup: (label: string) => void;
  counts: Record<string, number>;
  pinsCustomized: boolean;
  onSetPins: (paths: string[] | null) => void;
  dashboardPath: string;
  onCloseMobile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

/** The rail's inner chrome. Top-level component (never redefined per render)
 *  so navigating or collapsing never remounts it — no state reset / flicker. */
function SidebarBody({
  isMobileView, sidebarOpen, onToggleCollapse, pinnedItems, recentItems, sections, openGroup,
  onToggleGroup, counts, pinsCustomized, onSetPins,
  dashboardPath, onCloseMobile, onOpenSettings, onLogout,
}: SidebarBodyProps) {
  const expanded = sidebarOpen || isMobileView;
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  // A drag ends with a click on the link under the pointer; that click must not navigate.
  const dragging = useRef(false);
  const pinPaths = pinnedItems.map(item => item.path);
  const linkProps = {
    expanded,
    dashboardPath,
    pinAlwaysVisible: isMobileView,
    onNavigate: (e: MouseEvent) => {
      if (dragging.current) { e.preventDefault(); return; }
      setQuery('');
      if (isMobileView) onCloseMobile();
    },
  };
  const plainLink = (item: NavItem) => (
    <SidebarLink
      key={item.path} item={item} {...linkProps} pinned={pinPaths.includes(item.path)} count={counts[item.path]}
      onTogglePin={() => onSetPins(toggleIn(pinPaths, item.path))}
    />
  );
  const pinnedLink = (item: NavItem) => (
    <SidebarLink
      item={item} {...linkProps} pinned count={counts[item.path]}
      onTogglePin={() => onSetPins(toggleIn(pinPaths, item.path))}
      onMove={(delta) => onSetPins(moveIn(pinPaths, item.path, delta))}
    />
  );

  const q = query.trim().toLowerCase();
  const found = q ? sections.flatMap(s => s.items).filter(i => i.label.toLowerCase().includes(q)) : [];
  const openFirst = () => {
    const first = found[0];
    if (!first) return;
    navigate(first.path === '/' ? dashboardPath : first.path);
    setQuery('');
    if (isMobileView) onCloseMobile();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-dark-surface">
        {expanded && (
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-wider text-ivory font-serif">SURYA</span>
            <span className="text-xs text-warm-silver/70 ml-1">v1.0</span>
          </div>
        )}
        {!isMobileView && (
          <button onClick={onToggleCollapse} className="p-1 hover:bg-dark-surface rounded transition-colors" aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
            {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} className="mx-auto" />}
          </button>
        )}
        {isMobileView && (
          <button onClick={onCloseMobile} className="p-1 hover:bg-dark-surface rounded transition-colors" aria-label="Close menu">
            <X size={24} />
          </button>
        )}
      </div>

      {/* Find a page */}
      {expanded && (
        <div className="px-2 pt-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-silver/70" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') openFirst(); if (e.key === 'Escape') setQuery(''); }}
              aria-label="Find a page"
              placeholder="Find a page…"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-dark-surface/60 border border-dark-surface text-sm text-ivory placeholder:text-warm-silver/60 outline-none focus:border-terracotta/60 focus:bg-dark-surface transition-colors"
            />
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {q ? (
          <div className="space-y-1">
            <div className={HEADING} aria-live="polite">{found.length === 0 ? 'No page matches' : `${found.length} found · Enter opens the first`}</div>
            {found.map(plainLink)}
          </div>
        ) : (
          <>
            {/* Pinned: the user's own short list, in the user's own order */}
            <div className="relative space-y-1">
              {expanded && <div className={HEADING}>Pinned</div>}
              {expanded && pinsCustomized && (
                <button
                  type="button"
                  onClick={() => onSetPins(null)}
                  aria-label="Reset pinned to the default list"
                  title="Reset to default"
                  className="absolute right-1.5 -top-1.5 p-1.5 rounded text-warm-silver/70 hover:text-ivory hover:bg-dark-surface transition-colors"
                >
                  <RotateCcw size={12} />
                </button>
              )}
              {expanded && pinnedItems.length === 0 && (
                <p className="px-3 py-1 text-xs text-warm-silver/60">Hover a page and press the pin to keep it here.</p>
              )}
              {expanded && !isMobileView ? (
                <Reorder.Group as="div" axis="y" values={pinPaths} onReorder={onSetPins} className="space-y-1">
                  {pinnedItems.map(item => (
                    <Reorder.Item
                      as="div" key={item.path} value={item.path}
                      onDragStart={() => { dragging.current = true; }}
                      onDragEnd={() => { window.setTimeout(() => { dragging.current = false; }); }}
                    >
                      {pinnedLink(item)}
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              ) : pinnedItems.map(item => <div key={item.path}>{pinnedLink(item)}</div>)}
            </div>

            {/* Recent: where the user just was */}
            {expanded && recentItems.length > 0 && (
              <div className="mt-4 space-y-1">
                <div className={HEADING}>Recent</div>
                {recentItems.map(plainLink)}
              </div>
            )}

            {/* Every page, by group. One group is open at a time: the one the user is in. */}
            <div className={clsx(expanded ? 'mt-4 space-y-0.5' : 'mt-3 border-t border-dark-surface/60 pt-3 space-y-1')}>
              {expanded && <div className={HEADING}>All pages</div>}
              {sections.map(section => {
                const open = openGroup === section.label;
                const waiting = section.items.reduce((sum, i) => sum + (counts[i.path] ?? 0), 0);
                if (!expanded) {
                  // The icon rail shows the pages of the group the user is in.
                  return open ? <div key={section.label} className="space-y-1">{section.items.map(plainLink)}</div> : null;
                }
                return (
                  <div key={section.label}>
                    <button
                      type="button"
                      onClick={() => onToggleGroup(section.label)}
                      aria-expanded={open}
                      className={clsx(
                        'flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                        open ? 'text-ivory' : 'text-warm-silver hover:text-ivory hover:bg-dark-surface/60',
                      )}
                    >
                      <section.icon size={17} className={clsx('shrink-0', open && 'text-coral')} />
                      <span className="font-medium">{section.label}</span>
                      <span className="text-[11px] font-mono text-warm-silver/50">{section.items.length}</span>
                      {!open && waiting > 0 && <CountBadge n={waiting} />}
                      <ChevronDown size={14} className={clsx('shrink-0 transition-transform', !(waiting > 0 && !open) && 'ml-auto', !open && '-rotate-90')} />
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="ml-[1.35rem] pl-2 border-l border-dark-surface space-y-0.5 py-1">
                            {section.items.map(plainLink)}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="p-3 border-t border-dark-surface space-y-1">
        <button
          onClick={() => { onOpenSettings(); if (isMobileView) onCloseMobile(); }}
          title={expanded ? undefined : 'Settings'}
          aria-label={expanded ? undefined : 'Settings'}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-warm-silver hover:bg-dark-surface/60 hover:text-ivory w-full transition-colors"
        >
          <SettingsIcon size={19} className={expanded ? 'shrink-0' : 'mx-auto shrink-0'} />
          {expanded && <span>Settings</span>}
        </button>
        <button
          onClick={() => { onLogout(); if (isMobileView) onCloseMobile(); }}
          title={expanded ? undefined : 'Logout'}
          aria-label={expanded ? undefined : 'Logout'}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-coral hover:bg-dark-surface/60 w-full transition-colors"
        >
          <LogOut size={19} className={expanded ? 'shrink-0' : 'mx-auto shrink-0'} />
          {expanded && <span>Logout</span>}
        </button>
      </div>
    </div>
  );
}

interface SidebarProps {
  isMobile: boolean;
  deviceType: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenSettings: () => void;
}

/** Left navigation rail. Owns its own collapse state so it is independent of
 *  the surrounding Layout (topbar / main content) — no shared re-render path. */
export function Sidebar(props: SidebarProps) {
  const { user, role } = useAuth();
  // Each user arranges each role's sidebar on its own; a role switch re-reads it.
  const layoutKey = `surya_sidebar_layout:${user?.id ?? 'anon'}:${role ?? 'none'}`;
  return <SidebarForRole key={layoutKey} layoutKey={layoutKey} {...props} />;
}

function SidebarForRole({ layoutKey, isMobile, deviceType, mobileOpen, onCloseMobile, onOpenSettings }: SidebarProps & { layoutKey: string }) {
  const { user, role, logout } = useAuth();
  const { canAccess } = useFeatureControls();
  const { contributionRequests, dataStewards, tickets } = useData();
  const { pathname } = useLocation();
  const [layout, setLayout] = useState(() => readLayout(layoutKey));
  const [sidebarOpen, setSidebarOpen] = useState(!layout.collapsed);
  const drawerRef = useDialog<HTMLElement>(isMobile && mobileOpen, onCloseMobile);

  const saveLayout = (patch: Partial<SidebarLayout>) => {
    const next = { ...layout, ...patch };
    setLayout(next);
    writeLayout(layoutKey, next);
  };

  // Auto-collapse on tablet; on desktop, the width the user left it at.
  useEffect(() => {
    if (deviceType === 'tablet') setSidebarOpen(false);
    if (deviceType === 'desktop') setSidebarOpen(!layout.collapsed);
  }, [deviceType, layout.collapsed]);

  const dashboardPath = role ? ROLE_ROUTES[role] : '/';
  const resolve = (path: string) => (path === '/' ? dashboardPath : path);

  // The nav page the user is on: the longest nav path that starts the URL.
  const herePath = useMemo(() => {
    const at = (p: string) => (p === '/' ? dashboardPath : p);
    return ALL_ITEMS
      .filter(i => pathname === at(i.path) || pathname.startsWith(`${at(i.path)}/`))
      .sort((a, b) => at(b.path).length - at(a.path).length)[0]?.path ?? null;
  }, [pathname, dashboardPath]);

  // Follow the user: open the group they are in, and remember the page as recent.
  const [openGroup, setOpenGroup] = useState<string | null>(() => (herePath ? GROUP_OF.get(herePath) ?? null : null));
  useEffect(() => {
    if (!herePath) return;
    setOpenGroup(GROUP_OF.get(herePath) ?? null);
    setLayout((prev) => {
      if (prev.recent[0] === herePath) return prev;
      const next = { ...prev, recent: [herePath, ...prev.recent.filter(p => p !== herePath)].slice(0, 8) };
      writeLayout(layoutKey, next);
      return next;
    });
  }, [herePath, layoutKey]);

  const primaryPaths: string[] = layout.pins ?? (role ? PRIMARY_NAV[role] : []);

  // A stored pin or recent path grants nothing: every item still passes canAccess().
  const pinnedItems = primaryPaths
    .map(path => ALL_ITEMS.find(item => item.path === path))
    .filter((item): item is NavItem => item != null && canAccess(item.path))
    // EmpoweredCommittee's dashboard *is* /pms — don't list it twice.
    .filter((item, i, items) => items.findIndex(x => resolve(x.path) === resolve(item.path)) === i);

  const recentItems = layout.recent
    .filter(path => path !== herePath && !primaryPaths.includes(path))
    .map(path => ALL_ITEMS.find(item => item.path === path))
    .filter((item): item is NavItem => item != null && canAccess(item.path))
    .slice(0, RECENT_SHOWN);

  const sections = NAV_SECTIONS
    .map(section => ({ ...section, items: section.items.filter(item => canAccess(item.path)) }))
    .filter(section => section.items.length > 0);

  // Live counts: what waits on this person, from the same rules the pages use.
  const userId = user?.id ?? '';
  const roles = user?.roles;
  const counts = useMemo<Record<string, number>>(() => {
    const none: Record<string, number> = {};
    if (!userId) return none;
    const work = contributionRequests.filter((r) => {
      const bucket = inboxBucket(r, userId, isReviewer(r, userId, roles ?? [], dataStewards));
      return bucket === 'todo' || bucket === 'review';
    }).length;
    const mine = tickets.filter(t => t.assigned_to === userId && (t.status === 'Open' || t.status === 'InProgress')).length;
    return { '/work': work, '/helpdesk': mine };
  }, [contributionRequests, dataStewards, tickets, userId, roles]);

  const bodyProps = {
    sidebarOpen,
    onToggleCollapse: () => {
      if (deviceType === 'desktop') saveLayout({ collapsed: sidebarOpen });
      else setSidebarOpen(v => !v);
    },
    pinnedItems,
    recentItems,
    sections,
    openGroup,
    onToggleGroup: (label: string) => setOpenGroup(g => (g === label ? null : label)),
    counts,
    pinsCustomized: layout.pins !== null,
    onSetPins: (pins: string[] | null) => saveLayout({ pins }),
    dashboardPath,
    onCloseMobile,
    onOpenSettings,
    onLogout: () => { void logout(); },
  };

  if (isMobile) {
    return (
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-near-black/50 z-40 backdrop-blur-sm"
            />
            <motion.aside
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Main menu"
              tabIndex={-1}
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-near-black text-ivory z-50 shadow-ring-dark outline-none"
            >
              <SidebarBody isMobileView {...bodyProps} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    );
  }

  return (
    <aside
      className={clsx(
        "h-full bg-near-black text-ivory transition-all duration-300 flex flex-col z-20 shrink-0",
        sidebarOpen ? "w-64" : "w-16"
      )}
    >
      <SidebarBody isMobileView={false} {...bodyProps} />
    </aside>
  );
}
