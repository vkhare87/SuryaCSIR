import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Users, 
  Briefcase, 
  BookOpen, 
  Microscope,
  X
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import type { StaffMember, Project } from '../types';

export default function CommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const { staff, projects } = useData();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredStaff = staff.filter((s: StaffMember) => s.Name.toLowerCase().includes(query.toLowerCase())).slice(0, 3);
  const filteredProjects = projects.filter((p: Project) => p.ProjectName.toLowerCase().includes(query.toLowerCase())).slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-[12px] shadow-[0px_0px_0px_1px_#f0eee6] dark:shadow-[0px_0px_0px_1px_#30302e] overflow-hidden scale-in duration-200">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border bg-surface-hover">
          <Search className="text-text-muted w-5 h-5" />
          <input 
            autoFocus
            type="text" 
            placeholder="Search for staff, projects, or documents... (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-text text-lg placeholder:text-text-muted/50"
          />
          <button onClick={onClose} className="p-1 hover:bg-surface rounded-lg text-text-muted">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-4">
          {query && (
            <>
              {filteredStaff.length > 0 && (
                <div>
                  <h3 className="px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">Scientific Staff</h3>
                  {filteredStaff.map((s: StaffMember) => (
                    <button 
                      key={s.ID}
                      onClick={() => { navigate(`/staff/${s.ID}`); onClose(); }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-surface-hover rounded-xl text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#f0eee6] flex items-center justify-center text-[#c96442]">
                         <Users size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-text">{s.Name}</div>
                        <div className="text-xs text-text-muted">{s.Designation} • {s.Division}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {filteredProjects.length > 0 && (
                <div>
                  <h3 className="px-3 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">Research Projects</h3>
                  {filteredProjects.map((p: Project) => (
                    <button 
                      key={p.ProjectID}
                      onClick={() => { navigate(`/projects/${p.ProjectID}`); onClose(); }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-surface-hover rounded-xl text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-[8px] bg-[#f0eee6] flex items-center justify-center text-[#5e5d59]">
                         <Briefcase size={16} />
                      </div>
                      <div className="truncate">
                        <div className="text-sm font-bold text-text truncate">{p.ProjectName}</div>
                        <div className="text-xs text-text-muted">{p.ProjectNo} • {p.SponsorerName}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {filteredStaff.length === 0 && filteredProjects.length === 0 && (
                <div className="p-12 text-center">
                   <p className="text-text-muted italic">No matching records found for "{query}"</p>
                </div>
              )}
            </>
          )}

          {!query && (
            <div className="p-8 text-center text-text-muted">
               <div className="flex justify-center gap-8 mb-6">
                  <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => { navigate('/staff'); onClose(); }}>
                    <div className="w-12 h-12 rounded-2xl bg-[#141413] text-[#faf9f5] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><Users /></div>
                    <span className="text-xs font-bold">Staff</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => { navigate('/phd'); onClose(); }}>
                    <div className="w-12 h-12 rounded-2xl bg-[#e8e6dc] text-[#4d4c48] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><BookOpen /></div>
                    <span className="text-xs font-bold">PhD</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => { navigate('/projects'); onClose(); }}>
                    <div className="w-12 h-12 rounded-2xl bg-[#c96442] text-[#faf9f5] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><Microscope /></div>
                    <span className="text-xs font-bold">Research</span>
                  </div>
               </div>
               <p className="text-sm">Type to begin institutional search...</p>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border bg-surface-hover flex justify-between items-center text-[10px] text-text-muted font-bold tracking-tight">
           <div className="flex gap-4">
              <span className="flex items-center gap-1">
                <kbd className="bg-background border border-border px-1 rounded">↑↓</kbd> to navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-background border border-border px-1 rounded">Enter</kbd> to select
              </span>
           </div>
           <div>SURYA Quick Actions v1.0</div>
        </div>
      </div>
    </div>
  );
}
