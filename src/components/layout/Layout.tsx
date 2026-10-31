import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Search, Menu, AlertCircle, ChevronDown, ChevronRight, LayoutDashboard, Sparkles, Calendar as CalendarIcon } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import CommandPalette from '../CommandPalette';
import SettingsModal from '../SettingsModal';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { NotificationBell } from '../layout/NotificationBell';
import { useUI } from '../../contexts/UIContext';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { useFeatureControls } from '../../contexts/FeatureControlContext';
import { ROLE_ROUTES } from '../../constants/roleRoutes';
import { ROLE_LABELS } from '../../constants/access';
import { pageTrail } from '../../utils/pageTrail';
import { useDialog } from '../../utils/useDialog';

// UserAccount carries no display name, so derive from the email local part:
// "khare.vivek87@…" → "KV", "vkhare@…" → "VK".
function emailInitials(email = '') {
  const parts = email.split('@')[0].split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '').slice(0, 2);
  return letters.toUpperCase() || 'U';
}

export function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);
  const roleMenuRef = useDialog<HTMLDivElement>(roleSwitcherOpen, () => setRoleSwitcherOpen(false));

  const { user, role, roles, setActiveRole } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const trail = pageTrail(pathname);
  const { isMobile, deviceType } = useUI();
  const { error } = useData();
  const toast = useToast();
  const { canAccess } = useFeatureControls();
  const lastRole = useRef(role);

  // Toast on the role actually changing, not on the click: setActiveRole
  // switches optimistically and silently rolls back if the save fails, so
  // a failed switch shows a second toast naming the role you are still in.
  useEffect(() => {
    if (lastRole.current && role && role !== lastRole.current) {
      toast.push(`Now acting as ${ROLE_LABELS[role]}`);
    }
    lastRole.current = role;
  }, [role, toast]);

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

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans">

      <Sidebar
        isMobile={isMobile}
        deviceType={deviceType}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* TopBar */}
        <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 md:px-6 z-10">
          <div className="flex items-center gap-3 min-w-0">
            {isMobile && (
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 -ml-2 hover:bg-surface-hover rounded-xl text-text transition-colors"
                aria-label="Open menu"
              >
                <Menu size={24} />
              </button>
            )}
            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex items-center gap-1.5 min-w-0">
                {trail.map((c, i) => {
                  const last = i === trail.length - 1;
                  return (
                    <li key={i} className={clsx('flex items-center gap-1.5 min-w-0', !last && 'hidden md:flex')}>
                      {c.to ? (
                        <Link to={c.to} className="text-sm text-text-muted hover:text-text truncate">{c.label}</Link>
                      ) : (
                        <span aria-current="page" className="text-base md:text-xl text-text font-serif truncate">{c.label}</span>
                      )}
                      {!last && <ChevronRight size={14} className="text-text-muted shrink-0" aria-hidden="true" />}
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
              {/* Command Palette Trigger */}
              <button
                onClick={() => setCommandPaletteOpen(true)}
                className="flex items-center gap-2 px-2 md:px-3 py-2 bg-surface-hover text-text-muted rounded-lg border border-border text-sm hover:border-terracotta hover:shadow-[var(--shadow-e1)] transition-all group md:min-w-[240px]"
              >
                <Search size={16} className="group-hover:text-terracotta transition-colors shrink-0" />
                <span className="hidden md:inline flex-1 text-left">Search or jump to…</span>
                <kbd className="hidden lg:inline-block bg-background border border-border rounded px-1.5 text-xs font-mono">⌘K</kbd>
              </button>

              <NotificationBell />

              {/* Role: a switcher for 2+ roles, a plain label otherwise */}
              {roles.length === 1 && role && (
                <span className="hidden sm:inline px-2.5 py-1.5 text-xs font-semibold text-text-muted">{ROLE_LABELS[role]}</span>
              )}
              {roles.length > 1 && (
                <div
                  className="relative"
                  onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setRoleSwitcherOpen(false); }}
                >
                  <button
                    onClick={() => setRoleSwitcherOpen(v => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-hover border border-border rounded-[8px] text-xs font-semibold text-text-muted hover:border-terracotta hover:text-text transition-colors"
                    aria-label={role ? `Acting as ${ROLE_LABELS[role]}. Switch role` : 'Switch role'}
                    aria-expanded={roleSwitcherOpen}
                  >
                    <span className="hidden sm:inline">{role && ROLE_LABELS[role]}</span>
                    <ChevronDown size={13} className={`transition-transform ${roleSwitcherOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {roleSwitcherOpen && (
                    <div ref={roleMenuRef} tabIndex={-1} className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-[10px] shadow-lg z-50 py-1 min-w-[160px] outline-none">
                      {roles.map(r => (
                        <button
                          key={r}
                          onClick={() => {
                            void setActiveRole(r);
                            navigate(ROLE_ROUTES[r]);
                            setRoleSwitcherOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors ${
                            r === role
                              ? 'text-terracotta bg-terracotta/10'
                              : 'text-text-muted hover:text-text hover:bg-surface-hover'
                          }`}
                        >
                          {ROLE_LABELS[r]}
                          {r === role && <span className="ml-2 text-[10px] opacity-60">active</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* User Avatar */}
              <div
                className="h-8 w-8 rounded-full bg-terracotta text-ivory flex items-center justify-center font-bold text-xs ring-1 ring-terracotta-hover shrink-0"
                title={user?.email}
              >
                {emailInitials(user?.email)}
              </div>
          </div>
        </header>

        {/* Error Banner */}
        {error && (
          <div className="px-4 py-2 bg-danger/10 border-b border-danger/30 text-text text-sm flex items-center gap-2">
            <AlertCircle size={14} className="text-danger shrink-0" />
            <span>Data load failed: {error}</span>
          </div>
        )}

        {/* Scrollable Content Viewport */}
        <main className={clsx('flex-1 overflow-auto p-4 md:p-8 bg-background relative', isMobile && 'pb-24')}>
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

        {/* Phone: check-and-approve bar — home inbox, Ask, calendar, full menu */}
        {isMobile && role && (
          <nav
            aria-label="Quick navigation"
            className="fixed inset-x-0 bottom-0 z-30 bg-surface border-t border-border grid grid-flow-col auto-cols-fr pb-[env(safe-area-inset-bottom)]"
          >
            {[
              { to: ROLE_ROUTES[role], label: 'Home', icon: LayoutDashboard, show: true },
              { to: '/ask', label: 'Ask', icon: Sparkles, show: canAccess('/ask') },
              { to: '/calendar', label: 'Calendar', icon: CalendarIcon, show: canAccess('/calendar') },
            ].filter(i => i.show).map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end
                className={({ isActive }) => clsx(
                  'flex flex-col items-center justify-center gap-0.5 py-2 min-h-14 text-[11px] font-medium',
                  isActive ? 'text-terracotta' : 'text-text-muted',
                )}
              >
                <Icon size={20} />
                {label}
              </NavLink>
            ))}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-14 text-[11px] font-medium text-text-muted"
            >
              <Menu size={20} />
              Menu
            </button>
          </nav>
        )}
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
