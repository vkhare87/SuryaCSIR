import React, { useState, useRef } from 'react';
import { Check, ChevronRight, UploadCloud, FileSpreadsheet, AlertCircle, MapPin, Tags } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '../components/ui/Cards';
import { Button } from '../components/ui/Button';
import {
  parseFile,
  detectColumnMappings,
  validateRows,
  pushToSupabase,
  type FileType,
  type RowValidationResult,
  TABLE_NAMES,
} from '../utils/dataMigration';
import { isProvisioned, supabase } from '../utils/supabaseClient';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import type { DivisionInfo, ProjectStaff, PhDStudent, ContractStaff } from '../types';

// ---------------------------------------------------------------------------
// StaffMappingPanel
// ---------------------------------------------------------------------------

type MappingSubTab = 'projectStaff' | 'phd' | 'contract';

interface StaffMappingPanelProps {
  divisions: DivisionInfo[];
  staff: import('../types').StaffMember[];
  projectStaff: ProjectStaff[];
  phDStudents: PhDStudent[];
  contractStaff: ContractStaff[];
  onSaved: () => Promise<void>;
}

function StaffMappingPanel({ divisions, staff, projectStaff, phDStudents, contractStaff, onSaved }: StaffMappingPanelProps) {
  const [subTab, setSubTab] = useState<MappingSubTab>('projectStaff');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftDivision, setDraftDivision] = useState('');
  const [draftAttached, setDraftAttached] = useState('');

  const openRow = (id: string, currentDivision: string, currentAttached: string) => {
    setExpandedId(id); setDraftDivision(currentDivision); setDraftAttached(currentAttached);
  };
  const closeRow = () => { setExpandedId(null); setDraftDivision(''); setDraftAttached(''); };

  const saveProjectStaff = async (id: string) => {
    if (!supabase) return;
    setSavingId(id);
    await supabase.from('project_staff').update({ DivisionCode: draftDivision, PIName: draftAttached }).eq('id', id);
    await onSaved(); setSavingId(null); closeRow();
  };
  const savePhD = async (enrollmentNo: string) => {
    if (!supabase) return;
    setSavingId(enrollmentNo);
    await supabase.from('phd_students').update({ DivisionCode: draftDivision, SupervisorName: draftAttached }).eq('EnrollmentNo', enrollmentNo);
    await onSaved(); setSavingId(null); closeRow();
  };
  const saveContract = async (id: string) => {
    if (!supabase) return;
    setSavingId(id);
    await supabase.from('contract_staff').update({ Division: draftDivision, AttachedToStaffID: draftAttached }).eq('id', id);
    await onSaved(); setSavingId(null); closeRow();
  };

  const SUB_TABS: { key: MappingSubTab; label: string; count: number }[] = [
    { key: 'projectStaff', label: 'Project Staff', count: projectStaff.filter((p) => !p.DivisionCode).length },
    { key: 'phd', label: 'PhD Students', count: phDStudents.filter((p) => !p.DivisionCode).length },
    { key: 'contract', label: 'Contract Staff', count: contractStaff.filter((c) => !c.Division).length },
  ];

  const divSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white border border-border text-text text-sm rounded-lg p-2.5 outline-none focus:ring-[#3898ec] focus:border-[#3898ec]">
      <option value="">— Select Division —</option>
      {divisions.map((d) => <option key={d.divCode} value={d.divCode}>{d.divCode} — {d.divName}</option>)}
    </select>
  );
  const staffSelect = (value: string, onChange: (v: string) => void, useId = false) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white border border-border text-text text-sm rounded-lg p-2.5 outline-none focus:ring-[#3898ec] focus:border-[#3898ec]">
      <option value="">— Select Staff —</option>
      {staff.map((s) => <option key={s.ID} value={useId ? s.ID : s.Name}>{s.Name} ({s.Designation})</option>)}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {SUB_TABS.map(({ key, label, count }) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={clsx('px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
              subTab === key ? 'bg-[#c96442] text-white' : 'bg-surface-hover text-text-muted hover:text-text')}>
            {label}
            {count > 0 && <span className={clsx('w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center',
              subTab === key ? 'bg-white/30 text-white' : 'bg-amber-500 text-white')}>{count > 9 ? '9+' : count}</span>}
          </button>
        ))}
      </div>

      {subTab === 'projectStaff' && (
        <Card><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm">
          <thead><tr className="bg-surface-hover border-b border-border text-left">
            {['Name','Designation','Project','PI','Division',''].map(h => <th key={h} className="px-4 py-3 font-medium text-text-muted">{h}</th>)}
          </tr></thead>
          <tbody>{projectStaff.map((ps) => (
            <React.Fragment key={ps.id}>
              <tr className="border-b border-border last:border-0 hover:bg-surface-hover/50">
                <td className="px-4 py-3 font-medium text-text">{ps.StaffName}</td>
                <td className="px-4 py-3 text-text-muted">{ps.Designation}</td>
                <td className="px-4 py-3 text-text-muted">{ps.ProjectNo}</td>
                <td className="px-4 py-3 text-text-muted">{ps.PIName || '—'}</td>
                <td className="px-4 py-3">{ps.DivisionCode
                  ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{ps.DivisionCode}</span>
                  : <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Untagged</span>}</td>
                <td className="px-4 py-3"><button onClick={() => expandedId === ps.id ? closeRow() : openRow(ps.id, ps.DivisionCode || '', ps.PIName || '')}
                  className="text-xs font-medium text-[#c96442] hover:underline">{expandedId === ps.id ? 'Cancel' : 'Edit'}</button></td>
              </tr>
              {expandedId === ps.id && <tr className="border-b border-border bg-[#faf9f5]"><td colSpan={6} className="px-4 py-4">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[200px] space-y-1"><label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Division</label>{divSelect(draftDivision, setDraftDivision)}</div>
                  <div className="flex-1 min-w-[200px] space-y-1"><label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">PI Name</label>{staffSelect(draftAttached, setDraftAttached)}</div>
                  <button onClick={() => saveProjectStaff(ps.id)} disabled={savingId === ps.id}
                    className="px-5 py-2.5 bg-[#c96442] hover:bg-[#b5593b] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">{savingId === ps.id ? 'Saving...' : 'Save'}</button>
                </div>
              </td></tr>}
            </React.Fragment>
          ))}</tbody>
        </table></div></Card>
      )}

      {subTab === 'phd' && (
        <Card><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm">
          <thead><tr className="bg-surface-hover border-b border-border text-left">
            {['Student','Specialization','Supervisor','Division',''].map(h => <th key={h} className="px-4 py-3 font-medium text-text-muted">{h}</th>)}
          </tr></thead>
          <tbody>{phDStudents.map((phd) => (
            <React.Fragment key={phd.EnrollmentNo}>
              <tr className="border-b border-border last:border-0 hover:bg-surface-hover/50">
                <td className="px-4 py-3 font-medium text-text">{phd.StudentName}</td>
                <td className="px-4 py-3 text-text-muted">{phd.Specialization}</td>
                <td className="px-4 py-3 text-text-muted">{phd.SupervisorName || '—'}</td>
                <td className="px-4 py-3">{phd.DivisionCode
                  ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{phd.DivisionCode}</span>
                  : <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Untagged</span>}</td>
                <td className="px-4 py-3"><button onClick={() => expandedId === phd.EnrollmentNo ? closeRow() : openRow(phd.EnrollmentNo, phd.DivisionCode || '', phd.SupervisorName || '')}
                  className="text-xs font-medium text-[#c96442] hover:underline">{expandedId === phd.EnrollmentNo ? 'Cancel' : 'Edit'}</button></td>
              </tr>
              {expandedId === phd.EnrollmentNo && <tr className="border-b border-border bg-[#faf9f5]"><td colSpan={5} className="px-4 py-4">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[200px] space-y-1"><label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Division</label>{divSelect(draftDivision, setDraftDivision)}</div>
                  <div className="flex-1 min-w-[200px] space-y-1"><label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Supervisor</label>{staffSelect(draftAttached, setDraftAttached)}</div>
                  <button onClick={() => savePhD(phd.EnrollmentNo)} disabled={savingId === phd.EnrollmentNo}
                    className="px-5 py-2.5 bg-[#c96442] hover:bg-[#b5593b] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">{savingId === phd.EnrollmentNo ? 'Saving...' : 'Save'}</button>
                </div>
              </td></tr>}
            </React.Fragment>
          ))}</tbody>
        </table></div></Card>
      )}

      {subTab === 'contract' && (
        <Card><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm">
          <thead><tr className="bg-surface-hover border-b border-border text-left">
            {['Name','Designation','Lab Code','Attached To','Division',''].map(h => <th key={h} className="px-4 py-3 font-medium text-text-muted">{h}</th>)}
          </tr></thead>
          <tbody>
            {contractStaff.map((cs) => (
              <React.Fragment key={cs.id}>
                <tr className="border-b border-border last:border-0 hover:bg-surface-hover/50">
                  <td className="px-4 py-3 font-medium text-text">{cs.Name}</td>
                  <td className="px-4 py-3 text-text-muted">{cs.Designation}</td>
                  <td className="px-4 py-3 text-text-muted">{cs.LabCode}</td>
                  <td className="px-4 py-3 text-text-muted">{cs.AttachedToStaffID || '—'}</td>
                  <td className="px-4 py-3">{cs.Division
                    ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{cs.Division}</span>
                    : <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Untagged</span>}</td>
                  <td className="px-4 py-3"><button onClick={() => expandedId === cs.id ? closeRow() : openRow(cs.id, cs.Division || '', cs.AttachedToStaffID || '')}
                    className="text-xs font-medium text-[#c96442] hover:underline">{expandedId === cs.id ? 'Cancel' : 'Edit'}</button></td>
                </tr>
                {expandedId === cs.id && <tr className="border-b border-border bg-[#faf9f5]"><td colSpan={6} className="px-4 py-4">
                  <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px] space-y-1"><label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Division</label>{divSelect(draftDivision, setDraftDivision)}</div>
                    <div className="flex-1 min-w-[200px] space-y-1"><label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Attached To (Staff)</label>{staffSelect(draftAttached, setDraftAttached, true)}</div>
                    <button onClick={() => saveContract(cs.id)} disabled={savingId === cs.id}
                      className="px-5 py-2.5 bg-[#c96442] hover:bg-[#b5593b] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">{savingId === cs.id ? 'Saving...' : 'Save'}</button>
                  </div>
                </td></tr>}
              </React.Fragment>
            ))}
            {contractStaff.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted text-sm">No contract staff records yet. Import them via the Data Import tab.</td></tr>}
          </tbody>
        </table></div></Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataManagement() {
  const { divisions, staff, projectStaff, phDStudents, contractStaff, refreshData } = useData();
  useAuth(); // ensure context is available

  const [activeTab, setActiveTab] = useState<'import' | 'mapping'>('import');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedType, setSelectedType] = useState<FileType>('staff');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
  const [columnMappings, setColumnMappings] = useState<Array<{ raw: string; mapped: string | null }>>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validation state
  const [validationResults, setValidationResults] = useState<RowValidationResult[]>([]);

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Commit state
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ upserted: number; failed: number } | null>(null);

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const totalErrors = validationResults.reduce((sum, r) => sum + r.errors.length, 0);
  const errorRowCount = validationResults.filter(r => !r.isValid).length;
  const untaggedProjectStaff = projectStaff.filter((p) => !p.DivisionCode).length;
  const untaggedPhD = phDStudents.filter((p) => !p.DivisionCode).length;
  const untaggedContract = contractStaff.filter((c) => !c.Division).length;
  const totalUntagged = untaggedProjectStaff + untaggedPhD + untaggedContract;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setParseError(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0] ?? null;
    if (dropped) {
      setFile(dropped);
      setParseError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleNext1 = async () => {
    if (!file) return;
    setIsParsing(true);
    setParseError(null);

    const result = await parseFile(file, selectedType);

    if (!result.success || !result.data) {
      setParseError(result.error ?? 'Failed to parse file');
      setIsParsing(false);
      return;
    }

    const data = result.data;
    setParsedData(data);

    // Detect column mappings from first row headers
    const rawHeaders = data.length > 0 ? Object.keys(data[0]) : [];
    const mappings = detectColumnMappings(rawHeaders, selectedType);
    setColumnMappings(mappings);

    // Run validation
    const results = validateRows(data, selectedType);
    setValidationResults(results);

    setIsParsing(false);
    setStep(2);
  };

  const handleBack1 = () => {
    setStep(1);
    setParseError(null);
  };

  const handleNext2 = () => {
    setStep(3);
  };

  const handleBack2 = () => {
    setStep(2);
  };

  // Inline cell editing
  const handleCellClick = (rowIndex: number, field: string) => {
    const rowErrors = validationResults[rowIndex]?.errors || [];
    const hasError = rowErrors.some(e => e.field === field);
    if (!hasError) return; // only flagged cells are editable
    setEditingCell({ rowIndex, field });
    setEditValue(parsedData[rowIndex][field] || '');
  };

  const handleCellSave = () => {
    if (!editingCell) return;
    const { rowIndex, field } = editingCell;

    // Update parsedData with the new value
    const updatedData = parsedData.map((row, idx) => {
      if (idx !== rowIndex) return row;
      return { ...row, [field]: editValue };
    });
    setParsedData(updatedData);

    // Re-run full validation on updated data
    const newResults = validateRows(updatedData, selectedType);
    setValidationResults(newResults);

    setEditingCell(null);
  };

  const handleConfirmImport = async () => {
    if (!supabase) return;
    setIsCommitting(true);
    const tableName = TABLE_NAMES[selectedType];
    const result = await pushToSupabase(supabase, tableName, parsedData, (msg) => console.log(msg));
    setCommitResult(result);
    setIsCommitting(false);
    // Refresh DataContext to show new data across the app
    await refreshData();
  };

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const FILE_TYPE_LABELS: Record<FileType, string> = {
    staff:         'Human Capital (Staff Directory)',
    divisions:     'Divisions',
    projects:      'Research Projects',
    projectStaff:  'Project Staff',
    phd:           'PhD Scholars',
    equipment:     'Facilities / Equipment',
    contractStaff: 'Contract Staff',
  };

  const STEPS = [
    { num: 1 as const, label: 'Upload' },
    { num: 2 as const, label: 'Preview' },
    { num: 3 as const, label: 'Confirm' },
  ];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-[500] text-text font-serif">Data Management</h1>
        <p className="text-text-muted mt-1">Import data and manage division assignments</p>
      </div>

      {/* Untagged banner */}
      {totalUntagged > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm cursor-pointer hover:bg-amber-100 transition-colors"
          onClick={() => setActiveTab('mapping')}>
          <Tags size={16} className="text-amber-600 shrink-0" />
          <span className="text-amber-800 font-medium">
            {totalUntagged} record{totalUntagged !== 1 ? 's' : ''} have no division assigned
            ({untaggedProjectStaff} project staff, {untaggedPhD} PhD students, {untaggedContract} contract staff).
          </span>
          <span className="ml-auto text-amber-600 font-semibold text-xs uppercase tracking-wide">Fix →</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        <button onClick={() => setActiveTab('import')}
          className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'import' ? 'border-[#c96442] text-[#c96442]' : 'border-transparent text-text-muted hover:text-text')}>
          Data Import
        </button>
        <button onClick={() => setActiveTab('mapping')}
          className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
            activeTab === 'mapping' ? 'border-[#c96442] text-[#c96442]' : 'border-transparent text-text-muted hover:text-text')}>
          <MapPin size={14} />
          Staff Mapping
          {totalUntagged > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
              {totalUntagged > 9 ? '9+' : totalUntagged}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'mapping' && (
        <StaffMappingPanel divisions={divisions} staff={staff} projectStaff={projectStaff}
          phDStudents={phDStudents} contractStaff={contractStaff} onSaved={refreshData} />
      )}

      {activeTab === 'import' && <Card>
        {/* Connection status badge */}
        <div className="flex items-center gap-2 mb-4">
          {isProvisioned() ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Not Connected
            </span>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-6">
          {STEPS.map(({ num, label }) => (
            <div key={num} className="flex items-center gap-2">
              <div
                className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2',
                  step === num
                    ? 'bg-[#c96442] text-white border-[#c96442]'
                    : step > num
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                    : 'bg-surface-hover text-text-muted border-border',
                )}
              >
                {step > num ? <Check size={14} /> : num}
              </div>
              <span
                className={clsx(
                  'text-sm font-medium',
                  step === num ? 'text-text' : 'text-text-muted',
                )}
              >
                {label}
              </span>
              {num < 3 && <ChevronRight size={16} className="text-text-muted" />}
            </div>
          ))}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Step 1 — Upload */}
        {/* ------------------------------------------------------------------ */}
        {step === 1 && (
          <div className="space-y-5">
            {/* Entity type selector */}
            <div>
              <label className="block text-sm font-bold text-text mb-2">Target Entity</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as FileType)}
                className="w-full bg-surface-hover border border-border text-text text-sm rounded-lg focus:ring-[#3898ec] focus:border-[#3898ec] block p-2.5 outline-none"
              >
                {(Object.keys(FILE_TYPE_LABELS) as FileType[]).map((type) => (
                  <option key={type} value={type}>
                    {FILE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>

            {/* File upload zone */}
            <div>
              <label className="block text-sm font-bold text-text mb-2">Data File</label>
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:bg-surface-hover/50 transition-colors cursor-pointer"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <FileSpreadsheet className="w-12 h-12 text-[#c96442] mb-3 mx-auto opacity-80" />
                <p className="text-sm font-bold text-text mb-1">
                  {file ? file.name : 'Click or drag & drop a file here'}
                </p>
                <p className="text-xs text-text-muted">Supports .xlsx, .xls, and .csv</p>
              </div>
            </div>

            {/* Parse error */}
            {parseError && (
              <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
                {parseError}
              </div>
            )}

            {/* Next button */}
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={handleNext1}
                disabled={!file || isParsing || !isProvisioned()}
                className="bg-[#c96442] hover:bg-[#b5593b] text-white font-bold px-6"
              >
                {isParsing ? 'Parsing...' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step 2 — Preview */}
        {/* ------------------------------------------------------------------ */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Row count banner */}
            <div className="text-sm text-text-muted bg-surface-hover rounded-lg px-4 py-2 border border-border">
              <span className="font-bold text-text">{parsedData.length}</span> rows parsed from{' '}
              <span className="font-medium text-text">{file?.name}</span>
            </div>

            {/* Error count banner */}
            {totalErrors > 0 && (
              <div className="mb-3 px-4 py-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle size={14} />
                <span>
                  {totalErrors} error{totalErrors !== 1 ? 's' : ''} found in{' '}
                  {errorRowCount} row{errorRowCount !== 1 ? 's' : ''}. Click flagged cells to edit inline.
                </span>
              </div>
            )}

            {/* Preview table */}
            {parsedData.length > 0 && columnMappings.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-hover border-b border-border">
                      {/* Error badge column header */}
                      <th className="px-2 pt-3 pb-2 text-left font-medium text-text-muted whitespace-nowrap align-bottom w-8">
                        <div className="mb-1.5 h-[22px]" />
                        <span>#</span>
                      </th>
                      {columnMappings.map(({ raw, mapped }) => (
                        <th
                          key={raw}
                          className="px-3 pt-3 pb-2 text-left font-medium text-text-muted whitespace-nowrap align-bottom"
                        >
                          {/* Column mapping chip */}
                          <div className="mb-1.5">
                            {mapped !== null ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#c96442]/10 text-[#c96442] border border-[#c96442]/30 whitespace-nowrap">
                                Mapped: {mapped}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#e8e6dc] text-[#5e5d59] border border-[#d4d2c8] whitespace-nowrap">
                                Unmapped
                              </span>
                            )}
                          </div>
                          {/* Raw header */}
                          <span>{raw}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 100).map((row, rowIdx) => {
                      const rowValidation = validationResults[rowIdx];
                      const rowHasErrors = rowValidation && !rowValidation.isValid;
                      const rowErrors = rowValidation?.errors || [];

                      return (
                        <tr
                          key={rowIdx}
                          className={clsx(
                            'border-b border-border last:border-0',
                            rowHasErrors
                              ? 'bg-rose-50'
                              : rowIdx % 2 === 0
                              ? 'bg-surface'
                              : 'bg-surface-hover/40',
                          )}
                        >
                          {/* Error badge cell */}
                          <td className="px-2 py-1.5 text-center">
                            {rowHasErrors && (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                                {rowErrors.length}
                              </span>
                            )}
                          </td>
                          {columnMappings.map(({ raw }) => {
                            const cellHasError = rowErrors.some(e => e.field === raw);
                            const isEditing =
                              editingCell?.rowIndex === rowIdx && editingCell?.field === raw;

                            return (
                              <td
                                key={raw}
                                onClick={() => handleCellClick(rowIdx, raw)}
                                className={clsx(
                                  'px-3 py-1.5 text-text whitespace-nowrap max-w-[180px] truncate',
                                  cellHasError && 'outline outline-1 outline-red-400',
                                  cellHasError && !isEditing && 'cursor-pointer hover:bg-rose-100',
                                )}
                                title={isEditing ? undefined : (row[raw] ?? '')}
                              >
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === 'Tab') {
                                        e.preventDefault();
                                        handleCellSave();
                                      } else if (e.key === 'Escape') {
                                        setEditingCell(null);
                                      }
                                    }}
                                    onBlur={() => handleCellSave()}
                                    className="w-full px-2 py-1 text-sm border border-[#c96442] rounded outline-none focus:ring-1 focus:ring-[#c96442]"
                                  />
                                ) : (
                                  row[raw] ?? ''
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {parsedData.length > 100 && (
                  <div className="px-4 py-2 text-xs text-text-muted bg-surface-hover border-t border-border">
                    Showing first 100 of {parsedData.length} rows
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
              <Button variant="secondary" onClick={handleBack1}>
                Back
              </Button>
              <Button
                variant="primary"
                onClick={handleNext2}
                className="bg-[#c96442] hover:bg-[#b5593b] text-white font-bold px-6"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step 3 — Confirm + Commit */}
        {/* ------------------------------------------------------------------ */}
        {step === 3 && (
          <div className="space-y-5">
            {/* Import summary card */}
            <Card className="space-y-4">
              <div className="flex items-center gap-3 mb-1">
                <UploadCloud size={20} className="text-[#c96442]" />
                <h3 className="font-bold text-text">Import Summary</h3>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-text">{parsedData.length}</div>
                  <div className="text-text-muted">Total Rows</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-600">
                    {parsedData.length - errorRowCount}
                  </div>
                  <div className="text-text-muted">Valid</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-rose-600">{errorRowCount}</div>
                  <div className="text-text-muted">With Errors</div>
                </div>
              </div>
              <p className="text-sm text-text-muted">
                Target table:{' '}
                <code className="bg-surface-hover px-1 rounded">{TABLE_NAMES[selectedType]}</code>
              </p>
            </Card>

            {/* Errors remaining warning */}
            {errorRowCount > 0 && (
              <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle size={14} />
                <span>
                  Fix all {totalErrors} error{totalErrors !== 1 ? 's' : ''} in Step 2 before importing.
                </span>
              </div>
            )}

            {/* Commit result */}
            {commitResult && (
              <Card className="bg-emerald-50 border-emerald-200 space-y-2">
                <h3 className="font-bold text-emerald-800">Import Complete</h3>
                <div className="text-sm text-emerald-700 space-y-1">
                  <p>Rows upserted: {commitResult.upserted}</p>
                  <p>Rows failed: {commitResult.failed}</p>
                  <p>Total: {commitResult.upserted + commitResult.failed}</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStep(1);
                    setFile(null);
                    setParsedData([]);
                    setValidationResults([]);
                    setCommitResult(null);
                    setColumnMappings([]);
                  }}
                >
                  Import Another File
                </Button>
              </Card>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
              <Button variant="secondary" onClick={handleBack2}>
                Back
              </Button>
              <Button
                variant="primary"
                disabled={errorRowCount > 0 || isCommitting || commitResult !== null}
                onClick={handleConfirmImport}
                className="bg-[#c96442] hover:bg-[#b5593b] text-white font-bold px-6"
              >
                {isCommitting ? 'Importing...' : 'Confirm Import'}
              </Button>
            </div>
          </div>
        )}
      </Card>}
    </div>
  );
}
