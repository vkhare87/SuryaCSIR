import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Users, Briefcase, BookOpen, LogOut, PanelLeftClose, PanelLeftOpen,
  Settings as SettingsIcon, LayoutDashboard, Calendar as CalendarIcon,
  Building2, Handshake, Activity, FileText, Database, Network, Cloud, X,
  ClipboardCheck, Ticket as TicketIcon, CalendarDays, UserCog, UserCheck,
  ScanText, Sparkles, Share2, Microscope,
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Role } from '../../types';
import { ROLE_ROUTES } from '../../constants/roleRoutes';
import { ACCESS_MAP } from '../../constants/access';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  allowedRoles: Role[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { path: '/',             label: 'Dashboard',       icon: LayoutDashboard, allowedRoles: ACCESS_MAP['/'] },
      { path: '/ask',          label: 'Ask SURYA',       icon: Sparkles,        allowedRoles: ACCESS_MAP['/ask'] },
      { path: '/intelligence', label: 'Intelligence',    icon: Microscope,      allowedRoles: ACCESS_MAP['/intelligence'] },
      { path: '/explore',      label: 'Explore Graph',   icon: Share2,          allowedRoles: ACCESS_MAP['/explore'] },
      { path: '/calendar',     label: 'Calendar',        icon: CalendarIcon,    allowedRoles: ACCESS_MAP['/calendar'] },
    ],
  },
  {
    label: 'Unified Human Resource',
    items: [
      { path: '/staff',        label: 'Human Capital',   icon: Users,           allowedRoles: ACCESS_MAP['/staff'] },
      { path: '/staff/project', label: 'Project Staff',   icon: UserCog,         allowedRoles: ACCESS_MAP['/staff/project'] },
      { path: '/phd',          label: 'PhD Tracker',     icon: BookOpen,        allowedRoles: ACCESS_MAP['/phd'] },
      { path: '/divisions',    label: 'Divisions',       icon: Network,         allowedRoles: ACCESS_MAP['/divisions'] },
      { path: '/recruitment',  label: 'Recruitment',     icon: FileText,        allowedRoles: ACCESS_MAP['/recruitment'] },
    ],
  },
  {
    label: 'Research Ops',
    items: [
      { path: '/projects',     label: 'Projects',        icon: Briefcase,       allowedRoles: ACCESS_MAP['/projects'] },
      { path: '/proposals',    label: 'Proposals',       icon: FileText,        allowedRoles: ACCESS_MAP['/proposals'] },
      { path: '/reports',      label: 'Progress Reports',icon: ClipboardCheck,  allowedRoles: ACCESS_MAP['/reports'] },
      { path: '/facilities',   label: 'Instruments',     icon: Building2,       allowedRoles: ACCESS_MAP['/facilities'] },
      { path: '/partnerships', label: 'Partnerships',    icon: Handshake,       allowedRoles: ACCESS_MAP['/partnerships'] },
      { path: '/rnd-monitor',  label: 'R&D Monitor',     icon: Activity,        allowedRoles: ACCESS_MAP['/rnd-monitor'] },
    ],
  },
  {
    label: 'Governance',
    items: [
      { path: '/committees',   label: 'Committees',      icon: Building2,       allowedRoles: ACCESS_MAP['/committees'] },
      { path: '/helpdesk',     label: 'Helpdesk',        icon: TicketIcon,      allowedRoles: ACCESS_MAP['/helpdesk'] },
      { path: '/pms',          label: 'Performance Mgmt',icon: ClipboardCheck,  allowedRoles: ACCESS_MAP['/pms'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { path: '/admin/access-requests', label: 'Access Requests', icon: UserCheck, allowedRoles: ACCESS_MAP['/admin/access-requests'] },
      { path: '/data',         label: 'Data Management', icon: Database,        allowedRoles: ACCESS_MAP['/data'] },
      { path: '/irins-sync',   label: 'IRINS Sync',      icon: Cloud,           allowedRoles: ACCESS_MAP['/irins-sync'] },
      { path: '/admin/rag',    label: 'RAG Ingestion',   icon: ScanText,        allowedRoles: ACCESS_MAP['/admin/rag'] },
      { path: '/admin/holidays', label: 'Holidays',        icon: CalendarDays,    allowedRoles: ACCESS_MAP['/admin/holidays'] },
    ],
  },
];

interface SidebarBodyProps {
  isMobileView: boolean;
  sidebarOpen: boolean;
  onToggleCollapse: () => void;
  filteredSections: NavSection[];
  dashboardPath: string;
  onCloseMobile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

/** The rail's inner chrome. Top-level component (never redefined per render)
 *  so navigating or collapsing never remounts it — no state reset / flicker. */
function SidebarBody({
  isMobileView, sidebarOpen, onToggleCollapse, filteredSections,
  dashboardPath, onCloseMobile, onOpenSettings, onLogout,
}: SidebarBodyProps) {
  const expanded = sidebarOpen || isMobileView;
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-[#30302e]">
        {expanded && (
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-wider text-[#faf9f5] font-serif">SURYA</span>
            <span className="text-xs text-[#b0aea5]/70 ml-1">v1.0</span>
          </div>
        )}
        {!isMobileView && (
          <button onClick={onToggleCollapse} className="p-1 hover:bg-[#30302e] rounded transition-colors">
            {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} className="mx-auto" />}
          </button>
        )}
        {isMobileView && (
          <button onClick={onCloseMobile} className="p-1 hover:bg-[#30302e] rounded transition-colors">
            <X size={24} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {filteredSections.map((section, sectionIdx) => (
          <div
            key={section.label}
            className={clsx(
              'space-y-1',
              sectionIdx > 0 && (expanded ? 'mt-5' : 'mt-3 border-t border-[#30302e]/60 pt-3')
            )}
          >
            {expanded && (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#b0aea5]/55">
                {section.label}
              </div>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === dashboardPath}
                title={expanded ? undefined : item.label}
                onClick={() => { if (isMobileView) onCloseMobile(); }}
                className={({ isActive }) => clsx(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group',
                  isActive
                    ? 'bg-[#30302e] text-[#faf9f5] font-medium shadow-[inset_2px_0_0_var(--color-terracotta),0_0_18px_-6px_rgba(217,119,87,0.7)]'
                    : 'text-[#b0aea5] hover:text-[#faf9f5] hover:bg-[#30302e]/60'
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
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="p-4 border-t border-[#30302e] space-y-2">
        <button
          onClick={() => { onOpenSettings(); if (isMobileView) onCloseMobile(); }}
          title={expanded ? undefined : 'Settings'}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#b0aea5] hover:bg-[#30302e]/60 hover:text-[#faf9f5] w-full transition-colors"
        >
          <SettingsIcon size={20} className={expanded ? 'shrink-0' : 'mx-auto shrink-0'} />
          {expanded && <span>Settings</span>}
        </button>
        <button
          onClick={() => { onLogout(); if (isMobileView) onCloseMobile(); }}
          title={expanded ? undefined : 'Logout'}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#d97757] hover:bg-[#30302e]/60 w-full transition-colors"
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Auto-collapse on tablet, expand on desktop.
  useEffect(() => {
    if (deviceType === 'tablet') setSidebarOpen(false);
    if (deviceType === 'desktop') setSidebarOpen(true);
  }, [deviceType]);

  const dashboardPath = role ? ROLE_ROUTES[role] : '/';
  const filteredSections = NAV_SECTIONS
    .map(section => ({
      ...section,
      items: section.items
        .filter(item => role && item.allowedRoles.includes(role))
        .map(item => (item.path === '/' ? { ...item, path: dashboardPath } : item)),
    }))
    .filter(section => section.items.length > 0);

  const bodyProps = {
    sidebarOpen,
    onToggleCollapse: () => setSidebarOpen(v => !v),
    filteredSections,
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
              className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-[#141413] text-[#faf9f5] z-50 shadow-[0px_0px_0px_1px_#30302e]"
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
        "h-full bg-[#141413] text-[#faf9f5] transition-all duration-300 flex flex-col z-20 shrink-0",
        sidebarOpen ? "w-64" : "w-16"
      )}
    >
      <SidebarBody isMobileView={false} {...bodyProps} />
    </aside>
  );
}
