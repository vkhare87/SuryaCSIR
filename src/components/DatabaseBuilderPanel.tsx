import { useState } from 'react';
import { Check, Download, FileSpreadsheet, UploadCloud, PencilLine, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { Card } from './ui/Cards';
import { Button } from './ui/Button';
import { ImportFlow } from './ImportFlow';
import { ManualEntryGrid } from './ManualEntryGrid';
import { useAuth } from '../contexts/AuthContext';
import { generateTemplate, FILE_TYPE_LABELS, type FileType } from '../utils/dataMigration';
import { isProvisioned } from '../utils/supabaseClient';
import { useData } from '../contexts/DataContext';

interface StepDef {
  type: FileType;
  prereqLabel: string | null;
}

// Dependency-ordered: each step's prereq must usually exist before it makes sense.
const STEP_DEFS: StepDef[] = [
  { type: 'divisions',    prereqLabel: null },
  { type: 'staff',        prereqLabel: 'Divisions' },
  { type: 'projects',     prereqLabel: 'Divisions' },
  { type: 'projectStaff', prereqLabel: 'Projects' },
  { type: 'phd',          prereqLabel: 'Staff' },
  { type: 'equipment',    prereqLabel: 'Divisions' },
  { type: 'contractStaff',prereqLabel: 'Staff' },
];

function downloadTemplate(type: FileType, format: 'xlsx' | 'csv') {
  const blob = generateTemplate(type, format);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${type}-template.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}

export function DatabaseBuilderPanel() {
  const data = useData();
  const { divisions, staff, projects, projectStaff, phDStudents, equipment, contractStaff, refreshData } = data;
  const { user } = useAuth();

  const counts: Record<FileType, number> = {
    divisions: divisions.length,
    staff: staff.length,
    projects: projects.length,
    projectStaff: projectStaff.length,
    phd: phDStudents.length,
    equipment: equipment.length,
    contractStaff: contractStaff.length,
  };

  // Prereq satisfied = its corresponding table has rows.
  const prereqCount: Record<FileType, number | null> = {
    divisions: null,
    staff: counts.divisions,
    projects: counts.divisions,
    projectStaff: counts.projects,
    phd: counts.staff,
    equipment: counts.divisions,
    contractStaff: counts.staff,
  };

  const [activeIdx, setActiveIdx] = useState(0);
  const [mode, setMode] = useState<'upload' | 'manual'>('upload');

  const active = STEP_DEFS[activeIdx];
  const prereqMissing = active.prereqLabel !== null && (prereqCount[active.type] ?? 0) === 0;

  const advance = () => {
    refreshData();
    if (activeIdx < STEP_DEFS.length - 1) {
      setActiveIdx((i) => i + 1);
      setMode('upload');
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-muted">
        Seed the database step by step. Download a blank template, or add rows directly in the app.
      </p>

      {!isProvisioned() && (
        <div className="flex items-center gap-3 px-4 py-3 bg-badge-danger-bg border border-danger/30 rounded-xl text-sm text-badge-danger-fg">
          <AlertTriangle size={16} className="shrink-0" />
          Not connected to Supabase. Templates still download, but uploading and saving are disabled until you connect.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Stepper */}
        <Card className="h-fit">
          <ol className="space-y-1">
            {STEP_DEFS.map((s, idx) => {
              const done = counts[s.type] > 0;
              const isActive = idx === activeIdx;
              return (
                <li key={s.type}>
                  <button
                    onClick={() => { setActiveIdx(idx); setMode('upload'); }}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                      isActive ? 'bg-terracotta/10 text-terracotta' : 'hover:bg-surface-hover text-text',
                    )}
                  >
                    <span
                      className={clsx(
                        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0',
                        done
                          ? 'bg-archive-green/10 text-archive-green border-archive-green/30'
                          : isActive
                          ? 'bg-terracotta text-ivory border-terracotta'
                          : 'bg-surface-hover text-text-muted border-border',
                      )}
                    >
                      {done ? <Check size={14} /> : idx + 1}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{FILE_TYPE_LABELS[s.type]}</span>
                      <span className="block text-[11px] text-text-muted">{counts[s.type]} rows</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>

        {/* Active step panel */}
        <div className="space-y-5">
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-text">{FILE_TYPE_LABELS[active.type]}</h2>
                <p className="text-sm text-text-muted">
                  {counts[active.type]} existing row{counts[active.type] !== 1 ? 's' : ''}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => downloadTemplate(active.type, 'xlsx')}>
                  <Download size={14} className="mr-1.5" /> Template (.xlsx)
                </Button>
                <button
                  onClick={() => downloadTemplate(active.type, 'csv')}
                  className="text-xs font-medium text-terracotta hover:underline inline-flex items-center gap-1"
                >
                  <FileSpreadsheet size={12} /> .csv
                </button>
              </div>
            </div>

            {prereqMissing && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-badge-warning-bg border border-turmeric/30 rounded-lg text-badge-warning-fg text-sm">
                <AlertTriangle size={14} className="shrink-0" />
                No {active.prereqLabel} added yet. You can still proceed, but linking records to {active.prereqLabel} will be easier after adding them first.
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setMode('upload')}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  mode === 'upload' ? 'bg-terracotta text-ivory' : 'bg-surface-hover text-text-muted hover:text-text',
                )}
              >
                <UploadCloud size={14} /> Upload Filled File
              </button>
              <button
                onClick={() => setMode('manual')}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  mode === 'manual' ? 'bg-terracotta text-ivory' : 'bg-surface-hover text-text-muted hover:text-text',
                )}
              >
                <PencilLine size={14} /> Add Rows Manually
              </button>
            </div>
          </Card>

          {active.type === 'projects' && user?.activeRole !== 'MasterAdmin' ? (
            <Card>
              <p className="text-sm text-text">
                Project records are kept by the project monitoring office (PME) through each project's file. A bulk
                correction of legacy projects is done by MasterAdmin.
              </p>
            </Card>
          ) : mode === 'upload' ? (
            <ImportFlow key={`import-${active.type}`} type={active.type} onComplete={advance} />
          ) : (
            <Card>
              <ManualEntryGrid key={`grid-${active.type}`} type={active.type} onComplete={advance} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
