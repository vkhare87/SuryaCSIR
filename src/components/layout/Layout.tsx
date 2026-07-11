import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Search, Menu, AlertCircle, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CommandPalette from '../CommandPalette';
import SettingsModal from '../SettingsModal';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { NotificationBell } from '../layout/NotificationBell';
import { useUI } from '../../contexts/UIContext';
import { useData } from '../../contexts/DataContext';
import { ROLE_ROUTES } from '../../constants/roleRoutes';

export function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);

  const { user, role, roles, setActiveRole } = useAuth();
  const navigate = useNavigate();
  const { isMobile, deviceType } = useUI();
  const { error } = useData();

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
                className="flex items-center gap-2 px-2 md:px-3 py-2 bg-surface-hover text-text-muted rounded-lg border border-border text-sm hover:border-[#c96442] hover:shadow-[var(--shadow-e1)] transition-all group md:min-w-[240px]"
              >
                <Search size={16} className="group-hover:text-[#c96442] transition-colors shrink-0" />
                <span className="hidden md:inline flex-1 text-left">Search or jump to…</span>
                <kbd className="hidden lg:inline-block bg-background border border-border rounded px-1.5 text-xs font-mono">⌘K</kbd>
              </button>

              <NotificationBell />

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
                          onClick={() => {
                            void setActiveRole(r);
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
