import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  Users,
  Briefcase,
  BookOpen,
  Microscope,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
  LayoutDashboard,
  Calendar as CalendarIcon,
  Building2,
  FileText,
  Search,
  Database,
  Network,
  Menu,
  X,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import CommandPalette from '../CommandPalette';
import SettingsModal from '../SettingsModal';

import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { useData } from '../../contexts/DataContext';
import type { Role } from '../../types';
import { ROLE_ROUTES } from '../../constants/roleRoutes';

const ALL_ROLES: Role[] = [
  'Director', 'DivisionHead', 'HOD', 'Scientist', 'Technician',
  'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin',
  'Student', 'ProjectStaff', 'Guest', 'DefaultUser',
];

interface NavItem {
  path: string;
  label: string;
  icon: any;
  allowedRoles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { path: '/',             label: 'Dashboard',       icon: LayoutDashboard, allowedRoles: ALL_ROLES },
  { path: '/staff',        label: 'Human Capital',   icon: Users,           allowedRoles: ['Director', 'DivisionHead', 'HRAdmin', 'SystemAdmin'] },
  { path: '/projects',     label: 'Projects',        icon: Briefcase,       allowedRoles: ['Director', 'DivisionHead', 'Scientist', 'FinanceAdmin', 'SystemAdmin'] },
  { path: '/phd',          label: 'PhD Tracker',     icon: BookOpen,        allowedRoles: ['Director', 'DivisionHead', 'Scientist', 'SystemAdmin'] },
  { path: '/divisions',    label: 'Divisions',       icon: Network,         allowedRoles: ['Director', 'SystemAdmin'] },
  { path: '/intelligence', label: 'Intelligence',    icon: Microscope,      allowedRoles: ['Director', 'DivisionHead', 'Scientist', 'SystemAdmin'] },
  { path: '/facilities',   label: 'Facilities',      icon: Building2,       allowedRoles: ['Director', 'DivisionHead', 'Technician', 'SystemAdmin'] },
  { path: '/recruitment',  label: 'Recruitment',     icon: FileText,        allowedRoles: ['HRAdmin', 'SystemAdmin'] },
  { path: '/calendar',     label: 'Calendar',        icon: CalendarIcon,    allowedRoles: ALL_ROLES },
  { path: '/data',         label: 'Data Import',     icon: Database,        allowedRoles: ['HRAdmin', 'SystemAdmin'] },
];

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);

  const { user, logout, role, roles, setActiveRole } = useAuth();
  const navigate = useNavigate();
  const { isMobile, deviceType } = useUI();
  const { error } = useData();

  const dashboardPath = role ? ROLE_ROUTES[role] : '/';
  const filteredNav = NAV_ITEMS
    .filter(item => role && item.allowedRoles.includes(role))
    .map(item => item.path === '/' ? { ...item, path: dashboardPath } : item);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-close sidebar on smaller screens if not forced
  useEffect(() => {
    if (deviceType === 'tablet') setSidebarOpen(false);
    if (deviceType === 'desktop') setSidebarOpen(true);
  }, [deviceType]);

  const SidebarContent = ({ isMobileView = false }: { isMobileView?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo Area */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-[#30302e]">
        {(sidebarOpen || isMobileView) && (
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-wider text-[#faf9f5] font-serif">SURYA</span>
            <span className="text-xs text-[#b0aea5]/70 ml-1">v1.0</span>
          </div>
        )}
        {!isMobileView && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-[#30302e] rounded transition-colors"
          >
            {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} className="mx-auto" />}
          </button>
        )}
        {isMobileView && (
          <button onClick={() => setMobileMenuOpen(false)} className="p-1 hover:bg-[#30302e] rounded transition-colors">
            <X size={24} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {filteredNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => isMobileView && setMobileMenuOpen(false)}
            className={({ isActive }) => clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group",
              isActive
                ? "bg-[#30302e] text-[#faf9f5] font-medium"
                : "text-[#b0aea5] hover:text-[#faf9f5] hover:bg-[#30302e]/60"
            )}
          >
            <item.icon size={20} className={(sidebarOpen || isMobileView) ? "shrink-0" : "mx-auto shrink-0"} />
            {(sidebarOpen || isMobileView) && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-[#30302e] space-y-2">
         <button
           onClick={() => { setSettingsOpen(true); isMobileView && setMobileMenuOpen(false); }}
           className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#b0aea5] hover:bg-[#30302e]/60 hover:text-[#faf9f5] w-full transition-colors"
         >
            <SettingsIcon size={20} className={(sidebarOpen || isMobileView) ? "shrink-0" : "mx-auto shrink-0"} />
            {(sidebarOpen || isMobileView) && <span>Settings</span>}
          </button>
          <button
            onClick={() => { void logout(); isMobileView && setMobileMenuOpen(false); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#d97757] hover:bg-[#30302e]/60 w-full transition-colors"
          >
            <LogOut size={20} className={(sidebarOpen || isMobileView) ? "shrink-0" : "mx-auto shrink-0"} />
            {(sidebarOpen || isMobileView) && <span>Logout</span>}
          </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans">

      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside
          className={clsx(
            "h-full bg-[#141413] text-[#faf9f5] transition-all duration-300 flex flex-col z-20",
            sidebarOpen ? "w-64" : "w-16"
          )}
        >
          <SidebarContent />
        </aside>
      )}

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobile && mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-[#141413] text-[#faf9f5] z-50 shadow-[0px_0px_0px_1px_#30302e]"
            >
              <SidebarContent isMobileView />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* TopBar */}
        <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 md:px-6 z-10">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 -ml-2 hover:bg-surface-hover rounded-xl text-text transition-colors"
              >
                <Menu size={24} />
              </button>
            )}
            <h1 className="text-sm md:text-xl font-medium md:font-normal text-text truncate uppercase tracking-tight md:tracking-normal font-serif">
              {isMobile ? 'SURYA Platform' : 'CSIR-AMPRI Executive Terminal'}
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
              {/* Command Palette Trigger */}
              <button
                onClick={() => setCommandPaletteOpen(true)}
                className="flex items-center gap-2 px-2 md:px-3 py-1.5 bg-surface-hover text-text-muted rounded-[8px] border border-border text-sm hover:border-[#c96442] transition-colors group"
              >
                <Search size={16} className="group-hover:text-[#c96442] transition-colors" />
                <span className="hidden md:inline">Search</span>
                <kbd className="hidden lg:inline-block bg-background border border-border rounded px-1.5 text-xs font-mono">⌘K</kbd>
              </button>

              {/* Role Switcher — only visible when user has 2+ roles */}
              {roles.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setRoleSwitcherOpen(v => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-hover border border-border rounded-[8px] text-xs font-semibold text-text-muted hover:border-[#c96442] hover:text-text transition-colors"
                  >
                    <span className="hidden sm:inline">{role}</span>
                    <ChevronDown size={13} className={`transition-transform ${roleSwitcherOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {roleSwitcherOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-[10px] shadow-lg z-50 py-1 min-w-[160px]">
                      {roles.map(r => (
                        <button
                          key={r}
                          onClick={async () => {
                            await setActiveRole(r);
                            navigate(ROLE_ROUTES[r]);
                            setRoleSwitcherOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors ${
                            r === role
                              ? 'text-[#c96442] bg-[#fdf0e8]'
                              : 'text-text-muted hover:text-text hover:bg-surface-hover'
                          }`}
                        >
                          {r}
                          {r === role && <span className="ml-2 text-[10px] opacity-60">active</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* User Avatar */}
              <div className="h-8 w-8 rounded-full bg-[#c96442] text-[#faf9f5] flex items-center justify-center font-bold text-sm shadow-[0px_0px_0px_1px_#b5593b] uppercase shrink-0">
                {user?.activeRole?.charAt(0) || 'U'}
              </div>
          </div>
        </header>

        {/* Error Banner */}
        {error && (
          <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-700 text-sm flex items-center gap-2">
            <AlertCircle size={14} />
            <span>Data load failed: {error}</span>
          </div>
        )}

        {/* Scrollable Content Viewport */}
        <main className="flex-1 overflow-auto p-4 md:p-8 bg-background relative">
           <div className="mx-auto max-w-7xl w-full">
             <AnimatePresence mode="wait">
               <motion.div
                 key={window.location.hash}
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -10 }}
                 transition={{ duration: 0.2 }}
               >
                 <Outlet />
               </motion.div>
             </AnimatePresence>
           </div>
        </main>
      </div>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
