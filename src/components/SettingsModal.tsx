import { X, Sun, Moon, Maximize, List, Layout as LayoutIcon, Network, Smartphone, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useUI } from '../contexts/UIContext';
import { useDialog } from '../utils/useDialog';

export default function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const panelRef = useDialog<HTMLDivElement>(isOpen, onClose);
  const { theme, setTheme, density, setDensity } = useTheme();
  const { viewMode, setViewMode } = useUI();

  if (!isOpen) return null;

  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Settings" tabIndex={-1} className="outline-none fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-surface-raised border border-border rounded-2xl shadow-[var(--shadow-e4)] dark:shadow-[var(--shadow-e4),var(--shadow-dark-highlight)] overflow-hidden scale-in duration-300">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-serif font-medium text-text flex items-center gap-2">
            <Maximize className="text-terracotta" size={20} />
            System Preferences
          </h2>
          <button onClick={onClose} aria-label="Close settings" className="p-2 hover:bg-surface-hover rounded-xl text-text-muted transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-8">
          {/* Appearance Section */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Aesthetics</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setTheme('light')}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${theme === 'light' ? 'border-terracotta bg-terracotta/10 text-terracotta' : 'border-border text-text hover:border-text-muted'}`}
              >
                <Sun size={20} />
                <span className="font-semibold">Solar Light</span>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${theme === 'dark' ? 'border-terracotta bg-terracotta/10 text-terracotta' : 'border-border text-text hover:border-text-muted'}`}
              >
                <Moon size={20} />
                <span className="font-semibold">Deep Night</span>
              </button>
            </div>
          </section>

          {/* UI Density Section */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Data Density</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'compact', label: 'Compact', icon: List },
                { id: 'medium', label: 'Balanced', icon: LayoutIcon },
                { id: 'relaxed', label: 'Spacious', icon: Maximize },
              ].map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDensity(d.id as 'compact' | 'medium' | 'relaxed')}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${density === d.id ? 'border-terracotta bg-terracotta/10 text-terracotta' : 'border-border text-text hover:border-text-muted'}`}
                >
                  <d.icon size={18} />
                  <span className="text-xs font-semibold">{d.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* View Interface Section */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Device Interface</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'AUTO', label: 'Auto Detect', icon: Network },
                { id: 'MOBILE', label: 'Mobile View', icon: Smartphone },
                { id: 'DESKTOP', label: 'Desktop View', icon: Monitor },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setViewMode(m.id as 'AUTO' | 'MOBILE' | 'DESKTOP')}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${viewMode === m.id ? 'border-terracotta bg-terracotta/10 text-terracotta' : 'border-border text-text hover:border-text-muted'}`}
                >
                  <m.icon size={18} />
                  <span className="text-xs font-semibold">{m.label}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="p-6 bg-surface-hover border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-terracotta text-ivory rounded-lg font-semibold hover:bg-terracotta-hover transition-all active:scale-95"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
}
