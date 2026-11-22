import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Sun, Moon, Settings, LogOut, Check, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ROLE_LABELS } from '../../constants/access';
import { ROLE_ROUTES } from '../../constants/roleRoutes';
import { useDialog } from '../../utils/useDialog';

function emailInitials(email = '') {
  const parts = email.split('@')[0].split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '').slice(0, 2);
  return letters.toUpperCase() || 'U';
}

interface WorkspaceMenuProps {
  onOpenSettings: () => void;
}

const DENSITIES = [
  { id: 'compact' as const, label: 'Compact' },
  { id: 'medium' as const, label: 'Balanced' },
  { id: 'relaxed' as const, label: 'Spacious' },
];

/**
 * Unified Account & Workspace popover consolidating role switching, quick theme
 * & density toggles, preferences, and sign out into one calm control.
 */
export function WorkspaceMenu({ onOpenSettings }: WorkspaceMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useDialog<HTMLDivElement>(open, () => setOpen(false));
  const { user, role, roles, setActiveRole, logout } = useAuth();
  const { theme, setTheme, density, setDensity } = useTheme();
  const navigate = useNavigate();

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={role ? `Workspace menu. Acting as ${ROLE_LABELS[role]}` : 'Workspace menu'}
        className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full bg-surface-hover/80 border border-border hover:border-terracotta/60 transition-all"
      >
        <span
          className="h-7 w-7 rounded-full bg-terracotta text-ivory flex items-center justify-center font-semibold text-[11px] shrink-0"
          aria-hidden="true"
        >
          {emailInitials(user?.email)}
        </span>
        {role && (
          <span className="hidden sm:inline text-xs font-medium text-text max-w-[120px] truncate">
            {ROLE_LABELS[role]}
          </span>
        )}
        <ChevronDown
          size={13}
          className={clsx('text-text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] bg-surface-raised border border-border rounded-2xl shadow-[var(--shadow-e4)] dark:shadow-[var(--shadow-e4),var(--shadow-dark-highlight)] z-50 overflow-hidden outline-none"
        >
          {/* Identity header */}
          <div className="px-4 py-3 border-b border-border bg-surface/60">
            <div className="text-xs font-medium text-text truncate" title={user?.email}>
              {user?.email ?? 'Signed in'}
            </div>
            {role && (
              <div className="text-[11px] text-terracotta font-medium mt-0.5 flex items-center gap-1">
                <Sparkles size={11} />
                {ROLE_LABELS[role]}
              </div>
            )}
          </div>

          {/* Role switcher (when user holds 2+ roles) */}
          {roles.length > 1 && (
            <div className="p-2 border-b border-border">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                Switch Role
              </div>
              <div className="space-y-0.5 max-h-44 overflow-y-auto">
                {roles.map(r => {
                  const active = r === role;
                  return (
                    <button
                      key={r}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        void setActiveRole(r);
                        navigate(ROLE_ROUTES[r]);
                        setOpen(false);
                      }}
                      className={clsx(
                        'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left',
                        active
                          ? 'bg-terracotta/12 text-terracotta'
                          : 'text-text-muted hover:text-text hover:bg-surface-hover',
                      )}
                    >
                      <span>{ROLE_LABELS[r]}</span>
                      {active && <Check size={13} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick appearance + density */}
          <div className="p-3 border-b border-border space-y-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted mb-1.5">
                Appearance
              </div>
              <div className="grid grid-cols-2 gap-1.5 bg-background p-1 rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={clsx(
                    'flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all',
                    theme === 'light'
                      ? 'bg-surface-raised text-terracotta shadow-[var(--shadow-e1)]'
                      : 'text-text-muted hover:text-text',
                  )}
                >
                  <Sun size={13} /> Solar
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={clsx(
                    'flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all',
                    theme === 'dark'
                      ? 'bg-surface-raised text-terracotta shadow-[var(--shadow-e1)]'
                      : 'text-text-muted hover:text-text',
                  )}
                >
                  <Moon size={13} /> Night
                </button>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted mb-1.5">
                Density
              </div>
              <div className="grid grid-cols-3 gap-1 bg-background p-1 rounded-lg border border-border">
                {DENSITIES.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDensity(d.id)}
                    className={clsx(
                      'py-1 rounded-md text-[11px] font-medium transition-all',
                      density === d.id
                        ? 'bg-surface-raised text-terracotta shadow-[var(--shadow-e1)]'
                        : 'text-text-muted hover:text-text',
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-1.5 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-text hover:bg-surface-hover transition-colors"
            >
              <Settings size={14} className="text-text-muted" />
              All Preferences…
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void logout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-coral hover:bg-surface-hover transition-colors"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
