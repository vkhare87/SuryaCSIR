import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Search, Menu, AlertCircle, ChevronRight, LayoutDashboard,
  Sparkles, Calendar as CalendarIcon, Maximize2, Minimize2,
} from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { WorkspaceMenu } from './WorkspaceMenu';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { useFeatureControls } from '../../contexts/FeatureControlContext';
import { useCopilot } from '../../contexts/CopilotContext';
import { ROLE_ROUTES } from '../../constants/roleRoutes';
import { ROLE_LABELS } from '../../constants/access';
import { pageTrail } from '../../utils/pageTrail';
import { pageEnter } from '../../utils/motion';
import { useEntityBreadcrumb } from '../../hooks/useEntityBreadcrumb';
import { useNavBadges } from '../../hooks/useNavBadges';
import { useRecentRoutes } from '../../hooks/useRecentRoutes';
import { useFocusMode } from '../../hooks/useFocusMode';
import { ErrorBoundary, PageErrorCard } from '../ErrorBoundary';
import { OfflineServiceBanner } from '../ui/OfflineServiceBanner';

// Lazy-loaded overlays — zero bundle/mount cost until opened.
const CommandPalette = lazy(() => import('../CommandPalette'));
const SettingsModal = lazy(() => import('../SettingsModal'));
const AskSuryaDrawer = lazy(() => import('../AskSuryaDrawer'));

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { role } = useAuth();
  const { pathname } = useLocation();
  const resolvedLeaf = useEntityBreadcrumb(pathname);
  const trail = pageTrail(pathname, resolvedLeaf);
  const currentTitle = trail[trail.length - 1]?.label;
  const recentRoutes = useRecentRoutes(pathname, currentTitle);
  const navBadges = useNavBadges();
  const { focusMode, canOfferFocusButton, toggleFocusMode, exitFocusMode } = useFocusMode(pathname);
  const { isMobile, deviceType } = useUI();
  const { error } = useData();
  const toast = useToast();
  const { canAccess, controlsDegraded } = useFeatureControls();
  const copilot = useCopilot();
  const lastRole = useRef(role);
  const canAsk = canAccess('/ask');
  // The round Ask button unmounts while the chat is open, so the chat cannot
  // hand focus back to it; Layout does that once the button mounts again.
  const askFabRef = useRef<HTMLButtonElement>(null);
  const openedFromFab = useRef(false);
  const copilotOpen = copilot?.isOpen ?? false;
  useEffect(() => {
    if (copilotOpen || !openedFromFab.current) return;
    openedFromFab.current = false;
    askFabRef.current?.focus();
  }, [copilotOpen]);

  // Toast on the role actually changing, not on the click: setActiveRole
  // switches optimistically and silently rolls back if the save fails.
  useEffect(() => {
    if (lastRole.current && role && role !== lastRole.current) {
      toast.push(`Now acting as ${ROLE_LABELS[role]}`);
    }
    lastRole.current = role;
  }, [role, toast]);

  // Global keyboard shortcuts: ⌘K / "/" → Command Center, ⌘J → Ask SURYA Drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(v => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j' && canAsk && copilot) {
        e.preventDefault();
        if (copilot.isOpen) copilot.closeCopilot();
        else copilot.openCopilot();
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canAsk, copilot]);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans">
      {!focusMode && (
        <Sidebar
          isMobile={isMobile}
          deviceType={deviceType}
          mobileOpen={mobileMenuOpen}
          badges={navBadges}
          onCloseMobile={() => setMobileMenuOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TopBar (collapses into compact exit strip in Focus Mode) */}
        {focusMode ? (
          <header className="h-11 glass-header flex items-center justify-between px-4 md:px-6 z-20 shrink-0">
            <div className="flex items-center gap-2 min-w-0 text-xs text-text-muted">
              <span className="h-2 w-2 rounded-full bg-terracotta shrink-0" aria-hidden="true" />
              <span className="font-serif text-sm text-text truncate">{currentTitle}</span>
              <span className="hidden sm:inline text-text-muted">· Focus Mode</span>
            </div>
            <button
              type="button"
              onClick={exitFocusMode}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-hover border border-border text-xs font-medium text-text hover:border-terracotta/50 transition-colors"
            >
              <Minimize2 size={13} className="text-terracotta" />
              Exit Focus <kbd className="hidden sm:inline font-mono text-[10px] text-text-muted ml-1">Alt+F</kbd>
            </button>
          </header>
        ) : (
          <header className="h-16 glass-header sticky top-0 flex items-center justify-between px-4 md:px-6 z-20 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="p-2 -ml-2 hover:bg-surface-hover rounded-xl text-text transition-colors"
                  aria-label="Open menu"
                >
                  <Menu size={22} />
                </button>
              )}
              <nav aria-label="Breadcrumb" className="min-w-0">
                <ol className="flex items-center gap-1.5 min-w-0">
                  {trail.map((c, i) => {
                    const last = i === trail.length - 1;
                    return (
                      <li key={i} className={clsx('flex items-center gap-1.5 min-w-0', !last && 'hidden md:flex')}>
                        {c.to ? (
                          <Link to={c.to} className="text-sm text-text-muted hover:text-text transition-colors truncate">
                            {c.label}
                          </Link>
                        ) : (
                          <span aria-current="page" className="text-base md:text-lg text-text font-serif truncate">
                            {c.label}
                          </span>
                        )}
                        {!last && <ChevronRight size={14} className="text-text-muted/70 shrink-0" aria-hidden="true" />}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </div>

            <div className="flex items-center gap-2 md:gap-2.5 shrink-0">
              {/* Command Center Trigger */}
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                aria-label="Open command center"
                className="flex items-center gap-2 px-2.5 md:px-3 py-1.5 bg-surface-hover/80 text-text-muted rounded-lg border border-border text-sm hover:border-terracotta/60 hover:text-text hover:shadow-[var(--shadow-e1)] transition-all group md:min-w-[220px]"
              >
                <Search size={15} className="group-hover:text-terracotta transition-colors shrink-0" />
                <span className="hidden md:inline flex-1 text-left text-xs">Search or jump to…</span>
                <kbd className="hidden lg:inline-block bg-background border border-border rounded px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
              </button>

              {/* Ambient Ask SURYA Copilot trigger */}
              {canAsk && copilot && (
                <button
                  type="button"
                  onClick={() => copilot.openCopilot()}
                  aria-label="Open Ask SURYA Copilot"
                  title="Ask SURYA (⌘J)"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-terracotta/10 border border-terracotta/25 text-terracotta hover:bg-terracotta/15 text-xs font-medium transition-colors"
                >
                  <Sparkles size={14} className="shrink-0" />
                  <span className="hidden xl:inline">Ask</span>
                  <kbd className="hidden xl:inline font-mono text-[10px] opacity-75">⌘J</kbd>
                </button>
              )}

              {/* Focus Mode trigger on authoring/review routes */}
              {canOfferFocusButton && !isMobile && (
                <button
                  type="button"
                  onClick={toggleFocusMode}
                  title="Focus Mode (Alt+F)"
                  aria-label="Enter Focus Mode"
                  className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                >
                  <Maximize2 size={16} />
                </button>
              )}

              <NotificationBell />

              {/* Unified Account, Role, Appearance & Density popover */}
              <WorkspaceMenu onOpenSettings={() => setSettingsOpen(true)} />
            </div>
          </header>
        )}

        <OfflineServiceBanner />

        {/* Error Banner */}
        {error && (
          <div role="alert" className="px-4 py-2 bg-danger/10 border-b border-danger/30 text-text text-sm flex items-center gap-2 shrink-0">
            <AlertCircle size={14} className="text-danger shrink-0" />
            <span>Data load failed: {error}</span>
          </div>
        )}

        {controlsDegraded && (
          <div role="alert" className="px-4 py-2 bg-badge-warning-bg border-b border-border text-badge-warning-fg text-sm flex items-center gap-2 shrink-0">
            <AlertCircle size={14} className="shrink-0" />
            <span>Feature controls unavailable — all features are enabled.</span>
          </div>
        )}

        {/* Scrollable Content Viewport — instant non-blocking route enter (zero 400ms wait) */}
        <main className={clsx('flex-1 overflow-auto p-4 md:p-8 bg-background relative', isMobile && !focusMode && 'pb-24')}>
          <div className={clsx('mx-auto w-full', focusMode ? 'max-w-5xl' : 'max-w-7xl')}>
            <motion.div
              key={pathname}
              initial={pageEnter.initial}
              animate={pageEnter.animate}
              transition={pageEnter.transition}
            >
              {/* Keyed on the route: leaving a crashed page clears the error. */}
              <ErrorBoundary key={pathname} fallback={<PageErrorCard />}>
                <Outlet />
              </ErrorBoundary>
            </motion.div>
          </div>
        </main>

        {/* Phone: frosted check-and-approve bar */}
        {isMobile && !focusMode && role && (
          <nav
            aria-label="Quick navigation"
            className="fixed inset-x-0 bottom-0 z-30 bg-surface/90 backdrop-blur-md border-t border-border grid grid-flow-col auto-cols-fr pb-[env(safe-area-inset-bottom)]"
          >
            {[
              { to: ROLE_ROUTES[role], label: 'Home', icon: LayoutDashboard, show: true },
              { to: '/ask', label: 'Ask', icon: Sparkles, show: canAsk },
              { to: '/calendar', label: 'Calendar', icon: CalendarIcon, show: canAccess('/calendar') },
            ].filter(i => i.show).map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end
                className={({ isActive }) => clsx(
                  'relative flex flex-col items-center justify-center gap-0.5 py-2 min-h-14 text-[11px] font-medium transition-colors',
                  isActive ? 'text-terracotta' : 'text-text-muted',
                )}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute top-0 inset-x-4 h-[2px] rounded-full bg-terracotta" aria-hidden="true" />}
                    <Icon size={20} />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-14 text-[11px] font-medium text-text-muted"
            >
              <Menu size={20} />
              Menu
            </button>
          </nav>
        )}
      </div>

      {commandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            isOpen={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            recentRoutes={recentRoutes}
            onToggleFocusMode={toggleFocusMode}
          />
        </Suspense>
      )}

      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
        </Suspense>
      )}

      {/* Ask SURYA on every page: a round button that opens the chat window */}
      {canAsk && copilot && !copilot.isOpen && !focusMode && !pathname.startsWith('/ask') && (
        <button
          ref={askFabRef}
          type="button"
          onClick={() => { openedFromFab.current = true; copilot.openCopilot(); }}
          aria-label="Ask SURYA"
          title="Ask SURYA (⌘J)"
          className="fixed z-40 right-4 bottom-20 md:right-6 md:bottom-6 h-14 w-14 rounded-full bg-terracotta text-ivory shadow-[var(--shadow-e4)] hover:bg-terracotta-hover inline-flex items-center justify-center transition-colors"
        >
          <Sparkles size={22} />
        </button>
      )}

      {/* Lazy-mounted Ask SURYA chat window */}
      {canAsk && copilot?.isOpen && (
        <Suspense fallback={null}>
          <AskSuryaDrawer />
        </Suspense>
      )}
    </div>
  );
}
