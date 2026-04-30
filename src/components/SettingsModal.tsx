import { X, Sun, Moon, Maximize, List, Layout as LayoutIcon, Network } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useUI } from '../contexts/UIContext';

export default function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { theme, setTheme, density, setDensity } = useTheme();
  const { viewMode, setViewMode } = useUI();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-surface border border-border rounded-[16px] shadow-[0px_0px_0px_1px_#f0eee6] overflow-hidden scale-in duration-300">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-text flex items-center gap-2">
            <Maximize className="text-[#c96442]" />
            System Preferences
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-surface-hover rounded-xl text-text-muted transition-colors">
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
                className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${theme === 'light' ? 'border-[#c96442] bg-[#c96442]/8 text-[#c96442]' : 'border-border hover:border-text-muted'}`}
              >
                <Sun size={20} />
                <span className="font-bold">Solar Light</span>
              </button>
              <button 
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${theme === 'dark' ? 'border-[#c96442] bg-[#c96442]/8 text-[#c96442]' : 'border-border hover:border-text-muted'}`}
              >
                <Moon size={20} />
                <span className="font-bold">Deep Night</span>
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
                { id: 'relaxed', label: 'Spacious', icon: Maximize }
              ].map((d) => (
                <button 
                  key={d.id}
                  onClick={() => setDensity(d.id as any)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${density === d.id ? 'border-[#c96442] bg-[#c96442]/8 text-[#c96442]' : 'border-border hover:border-text-muted'}`}
                >
                  <d.icon size={18} />
                  <span className="text-xs font-bold">{d.label}</span>
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
                { id: 'MOBILE', label: 'Mobile View', icon: Sun }, // Using placeholder icons for now
                { id: 'DESKTOP', label: 'Desktop View', icon: Maximize }
              ].map((m) => (
                <button 
                  key={m.id}
                  onClick={() => setViewMode(m.id as any)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${viewMode === m.id ? 'border-[#c96442] bg-[#c96442]/8 text-[#c96442]' : 'border-border hover:border-text-muted'}`}
                >
                  <m.icon size={18} />
                  <span className="text-xs font-bold">{m.label}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="p-6 bg-surface-hover border-t border-border flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-[#c96442] text-[#faf9f5] rounded-[8px] font-bold shadow-[0px_0px_0px_1px_#c96442] hover:bg-[#b5593b] transition-all active:scale-95"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
}
