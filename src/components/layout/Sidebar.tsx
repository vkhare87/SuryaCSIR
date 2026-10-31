import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Users, Briefcase, BookOpen, LogOut, PanelLeftClose, PanelLeftOpen,
  Settings as SettingsIcon, LayoutDashboard, Calendar as CalendarIcon,
  Building2, Handshake, Activity, FileText, Database, Network, Cloud, X,
  ClipboardCheck, Ticket as TicketIcon, CalendarDays, UserCog, UserCheck,
  ScanText, Sparkles, Share2, Microscope, SlidersHorizontal, ChevronDown, MoreHorizontal,
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatureControls } from '../../contexts/FeatureControlContext';
import { ROLE_ROUTES } from '../../constants/roleRoutes';
import { PRIMARY_NAV } from '../../constants/access';
import { useDialog } from '../../utils/useDialog';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { path: '/',             label: 'Dashboard',       icon: LayoutDashboard },
      { path: '/ask',          label: 'Ask SURYA',       icon: Sparkles },
      { path: '/intelligence', label: 'Intelligence',    icon: Microscope },
      { path: '/explore',      label: 'Explore Graph',   icon: Share2 },
      { path: '/calendar',     label: 'Calendar',        icon: CalendarIcon },
    ],
  },
  {
    label: 'Unified Human Resource',
    items: [
      { path: '/staff',        label: 'Human Capital',   icon: Users },
      { path: '/staff/project', label: 'Project Staff',   icon: UserCog },
      { path: '/phd',          label: 'PhD Tracker',     icon: BookOpen },
      { path: '/divisions',    label: 'Divisions',       icon: Network },
      { path: '/recruitment',  label: 'Recruitment',     icon: FileText },
    ],
  },
  {
    label: 'Research Ops',
    items: [
      { path: '/projects',     label: 'Projects',        icon: Briefcase },
      { path: '/proposals',    label: 'Proposals',       icon: FileText },
      { path: '/reports',      label: 'Progress Reports',icon: ClipboardCheck },
      { path: '/facilities',   label: 'Instruments',     icon: Building2 },
      { path: '/partnerships', label: 'Partnerships',    icon: Handshake },
      { path: '/rnd-monitor',  label: 'R&D Monitor',     icon: Activity },
    ],
  },
  {
    label: 'Governance',
    items: [
      { path: '/committees',   label: 'Committees',      icon: Building2 },
      { path: '/helpdesk',     label: 'Helpdesk',        icon: TicketIcon },
      { path: '/pms',          label: 'Performance Mgmt',icon: ClipboardCheck },
    ],
  },
  {
    label: 'Admin',
    items: [
      { path: '/admin/access-requests', label: 'Access Requests', icon: UserCheck },
      { path: '/admin/features', label: 'Feature Controls', icon: SlidersHorizontal },
      { path: '/data',         label: 'Data Management', icon: Database },
      { path: '/irins-sync',   label: 'IRINS Sync',      icon: Cloud },
      { path: '/admin/rag',    label: 'RAG Ingestion',   icon: ScanText },
      { path: '/admin/holidays', label: 'Holidays',        icon: CalendarDays },
    ],
  },
];

const MORE_OPEN_KEY = 'surya_sidebar_more_open';

interface SidebarLinkProps {
  item: NavItem;
  expanded: boolean;
  dashboardPath: string;
  onNavigate: () => void;
}

function SidebarLink({ item, expanded, dashboardPath, onNavigate }: SidebarLinkProps) {
  return (
    <NavLink
      to={item.path}
      end={item.path === dashboardPath}
      title={expanded ? undefined : item.label}
      aria-label={expanded ? undefined : item.label}
      onClick={onNavigate}
      className={({ isActive }) => clsx(
        'relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group',
        isActive
          ? 'bg-dark-surface text-ivory font-medium shadow-[inset_2px_0_0_var(--color-terracotta),0_0_18px_-6px_color-mix(in_srgb,var(--color-coral)_70%,transparent)]'
          : 'text-warm-silver hover:text-ivory hover:bg-dark-surface/60'
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r bg-terracotta" />}
          <item.icon size={20} className={clsx(expanded ? 'shrink-0' : 'mx-auto shrink-0', isActive && 'text-terracotta')} />
          {expanded && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

interface SidebarBodyProps {
  isMobileView: boolean;
  sidebarOpen: boolean;
  onToggleCollapse: () => void;
  primaryItems: NavItem[];
  moreSections: NavSection[];
  moreOpen: boolean;
  onToggleMore: () => void;
  dashboardPath: string;
  onCloseMobile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

/** The rail's inner chrome. Top-level component (never redefined per render)
 *  so navigating or collapsing never remounts it — no state reset / flicker. */
function SidebarBody({
  isMobileView, sidebarOpen, onToggleCollapse, primaryItems, moreSections, moreOpen,
  onToggleMore, dashboardPath, onCloseMobile, onOpenSettings, onLogout,
}: SidebarBodyProps) {
  const expanded = sidebarOpen || isMobileView;
  const linkProps = { expanded, dashboardPath, onNavigate: () => { if (isMobileView) onCloseMobile(); } };
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

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <div className="space-y-1">
          {expanded && (
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-warm-silver/55">
              For you
            </div>
          )}
          {primaryItems.map(item => <SidebarLink key={item.path} item={item} {...linkProps} />)}
        </div>

        {moreSections.length > 0 && (
          <div className={clsx(expanded ? 'mt-5' : 'mt-3 border-t border-dark-surface/60 pt-3')}>
            <button
              onClick={onToggleMore}
              aria-expanded={moreOpen}
              title={expanded ? undefined : 'More'}
              aria-label={expanded ? undefined : 'More'}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-warm-silver hover:text-ivory hover:bg-dark-surface/60 w-full transition-colors"
            >
              {expanded ? (
                <>
                  <span className="flex-1 text-left text-[10px] font-semibold uppercase tracking-[0.12em]">More</span>
                  <ChevronDown size={16} className={clsx('shrink-0 transition-transform', moreOpen && 'rotate-180')} />
                </>
              ) : (
                <MoreHorizontal size={20} className="mx-auto shrink-0" />
              )}
            </button>

            {moreOpen && moreSections.map((section, sectionIdx) => (
              <div
                key={section.label}
                className={clsx(
                  'space-y-1',
                  expanded ? 'mt-3' : sectionIdx > 0 && 'mt-3 border-t border-dark-surface/60 pt-3'
                )}
              >
                {expanded && (
                  <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-warm-silver/55">
                    {section.label}
                  </div>
                )}
                {section.items.map(item => <SidebarLink key={item.path} item={item} {...linkProps} />)}
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="p-4 border-t border-dark-surface space-y-2">
        <button
          onClick={() => { onOpenSettings(); if (isMobileView) onCloseMobile(); }}
          title={expanded ? undefined : 'Settings'}
              aria-label={expanded ? undefined : 'Settings'}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-warm-silver hover:bg-dark-surface/60 hover:text-ivory w-full transition-colors"
        >
          <SettingsIcon size={20} className={expanded ? 'shrink-0' : 'mx-auto shrink-0'} />
          {expanded && <span>Settings</span>}
        </button>
        <button
          onClick={() => { onLogout(); if (isMobileView) onCloseMobile(); }}
          title={expanded ? undefined : 'Logout'}
              aria-label={expanded ? undefined : 'Logout'}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-coral hover:bg-dark-surface/60 w-full transition-colors"
        >
          <LogOut size={20} className={expanded ? 'shrink-0' : 'mx-auto shrink-0'} />
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
export function Sidebar({ isMobile, deviceType, mobileOpen, onCloseMobile, onOpenSettings }: SidebarProps) {
  const { role, logout } = useAuth();
  const { canAccess } = useFeatureControls();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const drawerRef = useDialog<HTMLElement>(isMobile && mobileOpen, onCloseMobile);
  const [moreOpen, setMoreOpen] = useState(() => {
    try { return localStorage.getItem(MORE_OPEN_KEY) === '1'; } catch { return false; }
  });

  // Auto-collapse on tablet, expand on desktop.
  useEffect(() => {
    if (deviceType === 'tablet') setSidebarOpen(false);
    if (deviceType === 'desktop') setSidebarOpen(true);
  }, [deviceType]);

  const dashboardPath = role ? ROLE_ROUTES[role] : '/';
  const toRoute = (item: NavItem) => (item.path === '/' ? { ...item, path: dashboardPath } : item);
  const primaryPaths: string[] = role ? PRIMARY_NAV[role] : [];
  const allItems = NAV_SECTIONS.flatMap(section => section.items);

  const primaryItems = primaryPaths
    .map(path => allItems.find(item => item.path === path))
    .filter((item): item is NavItem => item != null && canAccess(item.path))
    .map(toRoute)
    // EmpoweredCommittee's dashboard *is* /pms — don't list it twice.
    .filter((item, i, items) => items.findIndex(x => x.path === item.path) === i);

  const moreSections = NAV_SECTIONS
    .map(section => ({
      ...section,
      items: section.items
        .filter(item => canAccess(item.path) && !primaryPaths.includes(item.path))
        .map(toRoute),
    }))
    .filter(section => section.items.length > 0);

  const toggleMore = () => {
    const next = !moreOpen;
    setMoreOpen(next);
    try { localStorage.setItem(MORE_OPEN_KEY, next ? '1' : '0'); } catch { /* storage blocked — state still works */ }
  };

  const bodyProps = {
    sidebarOpen,
    onToggleCollapse: () => setSidebarOpen(v => !v),
    primaryItems,
    moreSections,
    moreOpen,
    onToggleMore: toggleMore,
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
