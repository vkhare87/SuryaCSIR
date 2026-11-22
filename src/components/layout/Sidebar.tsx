import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LogOut, PanelLeftClose, PanelLeftOpen, Settings as SettingsIcon,
  X, ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatureControls } from '../../contexts/FeatureControlContext';
import { ROLE_ROUTES } from '../../constants/roleRoutes';
import { PRIMARY_NAV } from '../../constants/access';
import { ALL_NAV_ITEMS, NAV_SECTIONS, type NavItem, type NavSection } from '../../constants/navigation';
import { useDialog } from '../../utils/useDialog';
import { navSpring } from '../../utils/motion';

const OPEN_DOMAIN_KEY = 'surya_sidebar_open_domain';

interface SidebarLinkProps {
  item: NavItem;
  expanded: boolean;
  dashboardPath: string;
  badgeCount?: number;
  onNavigate: () => void;
}

function SidebarLink({ item, expanded, dashboardPath, badgeCount, onNavigate }: SidebarLinkProps) {
  return (
    <NavLink
      to={item.path}
      end={item.path === dashboardPath}
      aria-label={expanded ? undefined : item.label}
      onClick={onNavigate}
      className={({ isActive }) => clsx(
        'relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group',
        isActive
          ? 'text-ivory font-medium'
          : 'text-warm-silver hover:text-ivory hover:bg-dark-surface/60',
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active-pill"
              transition={navSpring}
              aria-hidden="true"
              className="absolute inset-0 rounded-lg bg-dark-surface shadow-[inset_2px_0_0_var(--color-terracotta),0_0_18px_-6px_color-mix(in_srgb,var(--color-coral)_70%,transparent)]"
            />
          )}
          <item.icon
            size={18}
            className={clsx(
              'relative z-10 shrink-0 transition-colors',
              !expanded && 'mx-auto',
              isActive ? 'text-terracotta' : 'group-hover:text-ivory',
            )}
          />
          {expanded && (
            <span className="relative z-10 truncate flex-1">{item.label}</span>
          )}
          {expanded && badgeCount != null && badgeCount > 0 && (
            <span className="relative z-10 ml-auto px-1.5 py-0.5 min-w-[20px] text-center rounded-full bg-terracotta/25 text-coral font-mono tabular-nums text-[10px] font-semibold leading-none">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
          {!expanded && badgeCount != null && badgeCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-2 z-10 h-2 w-2 rounded-full bg-terracotta ring-2 ring-near-black"
            />
          )}
          {/* Crisp custom tooltip when collapsed */}
          {!expanded && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-lg bg-dark-surface border border-warm-silver/20 px-2.5 py-1.5 text-xs font-medium text-ivory shadow-[var(--shadow-e3)] opacity-0 translate-x-[-4px] group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0 transition-all"
            >
              {item.label}
              {badgeCount != null && badgeCount > 0 && (
                <span className="ml-1.5 text-coral font-mono tabular-nums">({badgeCount})</span>
              )}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

interface CollapsedDomainFlyoutProps {
  section: NavSection;
  hasActiveChild: boolean;
  dashboardPath: string;
  badges: Record<string, number>;
  onNavigate: () => void;
}

/** Floating domain flyout for collapsed desktop/tablet rail — replaces the 30-icon vertical dump. */
function CollapsedDomainFlyout({
  section, hasActiveChild, dashboardPath, badges, onNavigate,
}: CollapsedDomainFlyoutProps) {
  const [open, setOpen] = useState(false);
  const sectionBadge = section.items.reduce((sum, item) => sum + (badges[item.path] ?? 0), 0);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={section.label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(v => !v)}
        className={clsx(
          'relative w-full flex items-center justify-center py-2.5 rounded-lg transition-colors',
          hasActiveChild
            ? 'bg-dark-surface text-terracotta'
            : 'text-warm-silver hover:text-ivory hover:bg-dark-surface/60',
        )}
      >
        <section.icon size={18} />
        {(hasActiveChild || sectionBadge > 0) && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full bg-terracotta"
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.14 }}
            className="absolute left-full top-0 pl-2 z-50"
          >
            <div className="w-56 rounded-xl bg-near-black border border-warm-silver/20 p-2 shadow-[var(--shadow-e4)] space-y-1">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-warm-silver/65">
                {section.label}
              </div>
              {section.items.map(item => (
                <SidebarLink
                  key={item.path}
                  item={item}
                  expanded
                  dashboardPath={dashboardPath}
                  badgeCount={badges[item.path]}
                  onNavigate={() => {
                    setOpen(false);
                    onNavigate();
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SidebarBodyProps {
  isMobileView: boolean;
  sidebarOpen: boolean;
  onToggleCollapse: () => void;
  primaryItems: NavItem[];
  domainSections: NavSection[];
  openDomainId: string | null;
  onToggleDomain: (id: string) => void;
  activePath: string;
  dashboardPath: string;
  badges: Record<string, number>;
  onCloseMobile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

/** The rail's inner chrome. Top-level component (never redefined per render)
 *  so navigating or collapsing never remounts it — no state reset / flicker. */
function SidebarBody({
  isMobileView, sidebarOpen, onToggleCollapse, primaryItems, domainSections,
  openDomainId, onToggleDomain, activePath, dashboardPath, badges,
  onCloseMobile, onOpenSettings, onLogout,
}: SidebarBodyProps) {
  const expanded = sidebarOpen || isMobileView;
  const onNavigate = () => { if (isMobileView) onCloseMobile(); };

  return (
    <div className="flex flex-col h-full">
      {/* Brand header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-dark-surface shrink-0">
        {expanded && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full bg-terracotta shrink-0" aria-hidden="true" />
            <span className="font-bold text-lg tracking-wider text-ivory font-serif">SURYA</span>
            <span className="text-[10px] font-mono text-warm-silver/60">AMPRI</span>
          </div>
        )}
        {!isMobileView && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1.5 hover:bg-dark-surface rounded-lg text-warm-silver hover:text-ivory transition-colors mx-auto sm:mx-0"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
        )}
        {isMobileView && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1.5 hover:bg-dark-surface rounded-lg text-warm-silver hover:text-ivory transition-colors"
            aria-label="Close menu"
          >
            <X size={22} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className={clsx('flex-1 py-4 px-2', expanded ? 'overflow-y-auto' : 'overflow-visible')}>
        {/* Tier 1: Role-tailored pinned items */}
        <div className="space-y-0.5">
          {expanded && (
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-warm-silver/55">
              For you
            </div>
          )}
          {primaryItems.map(item => (
            <SidebarLink
              key={item.path}
              item={item}
              expanded={expanded}
              dashboardPath={dashboardPath}
              badgeCount={badges[item.path]}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {/* Tier 2: Compact collapsible domains (expanded) or floating flyouts (collapsed) */}
        {domainSections.length > 0 && (
          <div className="mt-5 pt-4 border-t border-dark-surface/80 space-y-1">
            {expanded && (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-warm-silver/55">
                Explore
              </div>
            )}
            {domainSections.map(section => {
              const hasActiveChild = section.items.some(
                item => activePath === item.path || (item.path !== '/' && activePath.startsWith(`${item.path}/`)),
              );
              const isOpen = openDomainId === section.id;
              const sectionBadge = section.items.reduce((sum, item) => sum + (badges[item.path] ?? 0), 0);

              if (!expanded) {
                return (
                  <CollapsedDomainFlyout
                    key={section.id}
                    section={section}
                    hasActiveChild={hasActiveChild}
                    dashboardPath={dashboardPath}
                    badges={badges}
                    onNavigate={onNavigate}
                  />
                );
              }

              return (
                <div key={section.id}>
                  <button
                    type="button"
                    onClick={() => onToggleDomain(section.id)}
                    aria-expanded={isOpen}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      hasActiveChild && !isOpen
                        ? 'text-ivory bg-dark-surface/50 font-medium'
                        : 'text-warm-silver hover:text-ivory hover:bg-dark-surface/60',
                    )}
                  >
                    <section.icon
                      size={17}
                      className={clsx('shrink-0', hasActiveChild ? 'text-terracotta' : 'text-warm-silver/75')}
                    />
                    <span className="flex-1 text-left truncate">{section.label}</span>
                    {sectionBadge > 0 && !isOpen && (
                      <span className="px-1.5 py-0.5 rounded-full bg-terracotta/25 text-coral font-mono tabular-nums text-[10px] font-semibold leading-none">
                        {sectionBadge}
                      </span>
                    )}
                    {hasActiveChild && !isOpen && sectionBadge === 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-terracotta shrink-0" aria-hidden="true" />
                    )}
                    <ChevronDown
                      size={14}
                      className={clsx('shrink-0 text-warm-silver/60 transition-transform duration-150', isOpen && 'rotate-180')}
                    />
                  </button>

                  {isOpen && (
                    <div className="mt-1 ml-3 pl-2.5 border-l border-dark-surface space-y-0.5">
                      {section.items.map(item => (
                        <SidebarLink
                          key={item.path}
                          item={item}
                          expanded
                          dashboardPath={dashboardPath}
                          badgeCount={badges[item.path]}
                          onNavigate={onNavigate}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>

      {/* Bottom utility chrome (Sign Out lives in WorkspaceMenu on desktop; kept here on mobile drawer) */}
      <div className="p-3 border-t border-dark-surface space-y-1 shrink-0">
        <button
          type="button"
          onClick={() => { onOpenSettings(); if (isMobileView) onCloseMobile(); }}
          aria-label={expanded ? undefined : 'Settings'}
          className="relative group flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-warm-silver hover:bg-dark-surface/60 hover:text-ivory w-full transition-colors"
        >
          <SettingsIcon size={18} className={expanded ? 'shrink-0' : 'mx-auto shrink-0'} />
          {expanded && <span>Preferences</span>}
          {!expanded && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-lg bg-dark-surface border border-warm-silver/20 px-2.5 py-1.5 text-xs font-medium text-ivory shadow-[var(--shadow-e3)] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Preferences
            </span>
          )}
        </button>
        {isMobileView && (
          <button
            type="button"
            onClick={() => { onLogout(); onCloseMobile(); }}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-coral hover:bg-dark-surface/60 w-full transition-colors"
          >
            <LogOut size={18} className="shrink-0" />
            <span>Sign Out</span>
          </button>
        )}
      </div>
    </div>
  );
}

interface SidebarProps {
  isMobile: boolean;
  deviceType: string;
  mobileOpen: boolean;
  badges?: Record<string, number>;
  onCloseMobile: () => void;
  onOpenSettings: () => void;
}

/** Left navigation rail. Owns its own collapse + open-domain state so it is
 *  independent of the surrounding Layout (topbar / main content). */
export function Sidebar({
  isMobile, deviceType, mobileOpen, badges = {}, onCloseMobile, onOpenSettings,
}: SidebarProps) {
  const { role, logout } = useAuth();
  const { canAccess } = useFeatureControls();
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const drawerRef = useDialog<HTMLElement>(isMobile && mobileOpen, onCloseMobile);
  const [openDomainId, setOpenDomainId] = useState<string | null>(() => {
    try { return localStorage.getItem(OPEN_DOMAIN_KEY); } catch { return null; }
  });

  // Auto-collapse on tablet, expand on desktop.
  useEffect(() => {
    if (deviceType === 'tablet') setSidebarOpen(false);
    if (deviceType === 'desktop') setSidebarOpen(true);
  }, [deviceType]);

  const dashboardPath = role ? ROLE_ROUTES[role] : '/';
  const toRoute = (item: NavItem) => (item.path === '/' ? { ...item, path: dashboardPath } : item);
  const primaryPaths: string[] = role ? PRIMARY_NAV[role] : [];

  const primaryItems = primaryPaths
    .map(path => ALL_NAV_ITEMS.find(item => item.path === path))
    .filter((item): item is NavItem => item != null && canAccess(item.path))
    .map(toRoute)
    // EmpoweredCommittee's dashboard *is* /pms — don't list it twice.
    .filter((item, i, items) => items.findIndex(x => x.path === item.path) === i);

  const domainSections = NAV_SECTIONS
    .map(section => ({
      ...section,
      items: section.items
        .filter(item => canAccess(item.path) && !primaryPaths.includes(item.path))
        .map(toRoute),
    }))
    .filter(section => section.items.length > 0);

  const toggleDomain = (id: string) => {
    const next = openDomainId === id ? null : id;
    setOpenDomainId(next);
    try {
      if (next) localStorage.setItem(OPEN_DOMAIN_KEY, next);
      else localStorage.removeItem(OPEN_DOMAIN_KEY);
    } catch { /* storage blocked — state still works */ }
  };

  const bodyProps = {
    sidebarOpen,
    onToggleCollapse: () => setSidebarOpen(v => !v),
    primaryItems,
    domainSections,
    openDomainId,
    onToggleDomain: toggleDomain,
    activePath: pathname,
    dashboardPath,
    badges,
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
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
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
        'h-full bg-near-black text-ivory transition-[width] duration-200 flex flex-col z-30 shrink-0',
        sidebarOpen ? 'w-64' : 'w-16',
      )}
    >
      <SidebarBody isMobileView={false} {...bodyProps} />
    </aside>
  );
}
