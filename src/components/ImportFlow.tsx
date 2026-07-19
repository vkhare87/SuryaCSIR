import React, { useState, useRef } from 'react';
import { Check, ChevronRight, UploadCloud, FileSpreadsheet, AlertCircle, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { Card } from './ui/Cards';
import { Button } from './ui/Button';
import {
  parseFileRaw,
  applyColumnMapping,
  detectColumnMappings,
  validateRows,
  pushToSupabase,
  FIELD_META,
  type FileType,
  type RowValidationResult,
  TABLE_NAMES,
  FILE_TYPE_LABELS,
} from '../utils/dataMigration';
import { isProvisioned, supabase } from '../utils/supabaseClient';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  fingerprintHeaders,
  lookupSavedMapping,
  saveMapping,
  suggestMappingsViaAI,
} from '../lib/ingest/columnMapping';

const STEPS = [
  { num: 1 as const, label: 'Upload' },
  { num: 2 as const, label: 'Preview' },
  { num: 3 as const, label: 'Confirm' },
];

interface ImportFlowProps {
  /** Locked entity type. Required unless showTypePicker is true. */
  type?: FileType;
  /** Show the entity dropdown (DataManagement) vs lock to `type` (wizard). */
  showTypePicker?: boolean;
  /** Pre-supplied file (e.g. a harvested import) — skips the drag/drop step
   * straight to Step 1 with the file already selected. */
  initialFile?: File;
  /** Called after a successful commit + data refresh. */
  onComplete?: () => void;
}

export function ImportFlow({ type, showTypePicker = false, initialFile, onComplete }: ImportFlowProps) {
  const { refreshData } = useData();
  const { user } = useAuth();
  const { push: pushToast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedType, setSelectedType] = useState<FileType>(type ?? 'staff');
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
  const [columnMappings, setColumnMappings] = useState<Array<{ raw: string; mapped: string | null }>>([]);
  const [headerFingerprint, setHeaderFingerprint] = useState<string | null>(null);
  // parsedData row i came from rawData row parsedRowToRaw[i] — indexes drift
  // when applyColumnMapping drops rows that are empty under the current mapping.
  const [parsedRowToRaw, setParsedRowToRaw] = useState<number[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [validationResults, setValidationResults] = useState<RowValidationResult[]>([]);

  const [editingCell, setEditingCell] = useState<{ rowIndex: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ upserted: number; failed: number } | null>(null);

  // Keep locked type in sync when the parent changes it (wizard step change).
  const effectiveType = showTypePicker ? selectedType : (type ?? selectedType);

  const totalErrors = validationResults.reduce((sum, r) => sum + r.errors.length, 0);
  const errorRowCount = validationResults.filter((r) => !r.isValid).length;

  const resetFlow = () => {
    setStep(1);
    setFile(null);
    setRawData([]);
    setParsedData([]);
    setValidationResults([]);
    setCommitResult(null);
    setColumnMappings([]);
    setHeaderFingerprint(null);
    setParsedRowToRaw([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setParseError(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0] ?? null;
    if (dropped) {
      setFile(dropped);
      setParseError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
  };

  // Recomputes parsedData/validation from rawData for a given mapping —
  // shared by the initial parse, manual per-column correction, and the AI
  // suggestion merge. Never touches HR tables; still requires Confirm Import.
  const applyMapping = (raw: Record<string, string>[], newMappings: Array<{ raw: string; mapped: string | null }>) => {
    setColumnMappings(newMappings);
    const mappingRecord = Object.fromEntries(newMappings.map((m) => [m.raw, m.mapped]));
    // Row-at-a-time so we can record which raw row each parsed row came from
    // (cell edits write back through this map — see handleCellSave).
    const formatted: Record<string, string>[] = [];
    const rowMap: number[] = [];
    raw.forEach((row, i) => {
      const [mapped] = applyColumnMapping([row], mappingRecord, effectiveType);
      if (mapped) {
        formatted.push(mapped);
        rowMap.push(i);
      }
    });
    setParsedRowToRaw(rowMap);
    setParsedData(formatted);
    setValidationResults(validateRows(formatted, effectiveType));
  };

  const handleNext1 = async () => {
    if (!file) return;
    setIsParsing(true);
    setParseError(null);

    const result = await parseFileRaw(file);

    if (!result.success || !result.data) {
      setParseError(result.error ?? 'Failed to parse file');
      setIsParsing(false);
      return;
    }

    const raw = result.data;
    setRawData(raw);

    const rawHeaders = raw.length > 0 ? Object.keys(raw[0]) : [];
    const detected = detectColumnMappings(rawHeaders, effectiveType);

    // Phase C: a header shape already confirmed before auto-applies, no AI
    // call or re-review of the mapping needed (still a full human review of
    // the row data in Step 2/3 — this only skips re-asking "which column").
    let finalMappings = detected;
    if (supabase && detected.some((m) => m.mapped === null)) {
      // Best-effort: fingerprint needs crypto.subtle (secure contexts only) —
      // on failure fall through to manual/AI mapping instead of a dead spinner.
      try {
        const fp = await fingerprintHeaders(rawHeaders);
        setHeaderFingerprint(fp);
        const saved = await lookupSavedMapping(supabase, effectiveType, fp);
        if (saved) {
          // Skip saved targets that collide with an auto-detected column —
          // one target per header, same rule as the dropdowns.
          const used = new Set(detected.map((m) => m.mapped).filter(Boolean));
          finalMappings = detected.map((m) => {
            if (m.mapped) return m;
            const s = saved[m.raw];
            if (s && !used.has(s)) {
              used.add(s);
              return { raw: m.raw, mapped: s };
            }
            return { raw: m.raw, mapped: null };
          });
        }
      } catch {
        setHeaderFingerprint(null);
      }
    } else {
      setHeaderFingerprint(null);
    }

    applyMapping(raw, finalMappings);
    setIsParsing(false);
    setStep(2);
  };

  const handleMappingSelect = (raw: string, mapped: string | null) => {
    // A target column can back only one header — selecting it here clears it
    // from any other row (applyColumnMapping would otherwise last-write-win).
    applyMapping(rawData, columnMappings.map((m) => {
      if (m.raw === raw) return { raw, mapped };
      return mapped !== null && m.mapped === mapped ? { raw: m.raw, mapped: null } : m;
    }));
  };

  const handleSuggestAI = async () => {
    if (!supabase) return;
    setIsSuggesting(true);
    try {
      const unmapped = columnMappings.filter((m) => m.mapped === null).map((m) => m.raw);
      // Only offer targets no header uses yet — the server dedupes within its
      // own suggestions but can't see the already-mapped columns.
      const usedTargets = new Set(columnMappings.map((m) => m.mapped).filter(Boolean));
      const targetFields = FIELD_META[effectiveType]
        .filter((f) => !usedTargets.has(f.column))
        .map((f) => ({ column: f.column, label: f.label }));
      const suggestions = await suggestMappingsViaAI(supabase, unmapped, targetFields);
      applyMapping(rawData, columnMappings.map((m) => (m.mapped ? m : { raw: m.raw, mapped: suggestions[m.raw] ?? null })));
    } catch (err) {
      pushToast(`AI mapping suggestion failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setIsSuggesting(false);
    }
  };

  const mappedColumns = columnMappings.filter((m): m is { raw: string; mapped: string } => m.mapped !== null);
  const unmappedCount = columnMappings.length - mappedColumns.length;

  const handleCellClick = (rowIndex: number, field: string) => {
    const rowErrors = validationResults[rowIndex]?.errors || [];
    if (!rowErrors.some((e) => e.field === field)) return;
    setEditingCell({ rowIndex, field });
    setEditValue(parsedData[rowIndex][field] || '');
  };

  const handleCellSave = () => {
    if (!editingCell) return;
    const { rowIndex, field } = editingCell;
    const updatedData = parsedData.map((row, idx) => (idx === rowIndex ? { ...row, [field]: editValue } : row));
    setParsedData(updatedData);
    setValidationResults(validateRows(updatedData, effectiveType));
    // Write through to rawData too — applyMapping rebuilds parsedData from
    // rawData, so without this any later mapping change silently discards edits.
    const rawKey = columnMappings.find((m) => m.mapped === field)?.raw;
    const rawIndex = parsedRowToRaw[rowIndex];
    if (rawKey !== undefined && rawIndex !== undefined) {
      setRawData(rawData.map((row, idx) => (idx === rawIndex ? { ...row, [rawKey]: editValue } : row)));
    }
    setEditingCell(null);
  };

  const handleConfirmImport = async () => {
    if (!supabase) return;
    setIsCommitting(true);
    const result = await pushToSupabase(supabase, TABLE_NAMES[effectiveType], parsedData, (msg) => console.log(msg));
    setCommitResult(result);

    if (result.upserted > 0 && user) {
      const { error: eventErr } = await supabase.from('import_events').insert({
        file_type: effectiveType,
        row_count: result.upserted,
        uploaded_by: user.id,
        uploaded_by_email: user.email,
      });
      if (eventErr) pushToast(`Import saved, but the upload log failed: ${eventErr.message}`, 'warning');
    }

    // Phase C: remember this header shape's mapping so the next file from
    // the same source auto-maps. Best-effort — never blocks a completed import.
    if (result.upserted > 0 && user && headerFingerprint && mappedColumns.length > 0) {
      const mappingRecord = Object.fromEntries(mappedColumns.map((m) => [m.raw, m.mapped]));
      saveMapping(supabase, effectiveType, headerFingerprint, mappingRecord, user.id).catch(() => {});
    }

    setIsCommitting(false);
    await refreshData();
    if (result.failed === 0) onComplete?.();
  };

  return (
    <Card>
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
            <span className={clsx('text-sm font-medium', step === num ? 'text-text' : 'text-text-muted')}>
              {label}
            </span>
            {num < 3 && <ChevronRight size={16} className="text-text-muted" />}
          </div>
        ))}
      </div>

      {/* Step 1 — Upload */}
      {step === 1 && (
        <div className="space-y-5">
          {showTypePicker && (
            <div>
              <label className="block text-sm font-bold text-text mb-2">Target Entity</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as FileType)}
                className="w-full bg-surface-hover border border-border text-text text-sm rounded-lg focus:ring-[#3898ec] focus:border-[#3898ec] block p-2.5 outline-none"
              >
                {(Object.keys(FILE_TYPE_LABELS) as FileType[]).map((t) => (
                  <option key={t} value={t}>
                    {FILE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-text mb-2">Data File</label>
            <label
              className="block border-2 border-dashed border-border rounded-xl p-8 text-center hover:bg-surface-hover/50 transition-colors cursor-pointer"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="sr-only"
                onChange={handleFileChange}
              />
              <FileSpreadsheet className="w-12 h-12 text-[#c96442] mb-3 mx-auto opacity-80" />
              <p className="text-sm font-bold text-text mb-1">
                {file ? file.name : 'Click or drag & drop a file here'}
              </p>
              <p className="text-xs text-text-muted">Supports .xlsx, .xls, and .csv</p>
            </label>
          </div>

          {parseError && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
              {parseError}
            </div>
          )}

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

      {/* Step 2 — Preview */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="text-sm text-text-muted bg-surface-hover rounded-lg px-4 py-2 border border-border">
            <span className="font-bold text-text">{parsedData.length}</span> rows parsed from{' '}
            <span className="font-medium text-text">{file?.name}</span>
          </div>

          {totalErrors > 0 && (
            <div className="mb-3 px-4 py-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
              <AlertCircle size={14} />
              <span>
                {totalErrors} error{totalErrors !== 1 ? 's' : ''} found in {errorRowCount} row
                {errorRowCount !== 1 ? 's' : ''}. Click flagged cells to edit inline.
              </span>
            </div>
          )}

          {/* Column mapping — each raw header's target column, human-editable.
             Nothing here writes to HR tables; it only decides how Step 3 will. */}
          {columnMappings.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-surface-hover border-b border-border">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  Column Mapping {unmappedCount > 0 && `— ${unmappedCount} unmapped`}
                </span>
                {unmappedCount > 0 && (
                  <Button variant="secondary" size="sm" onClick={handleSuggestAI} disabled={isSuggesting}>
                    <Sparkles size={13} className="mr-1.5" />
                    {isSuggesting ? 'Suggesting…' : 'Suggest with AI'}
                  </Button>
                )}
              </div>
              <div className="divide-y divide-border max-h-56 overflow-y-auto">
                {columnMappings.map(({ raw, mapped }) => (
                  <div key={raw} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="flex-1 min-w-0 truncate text-text-muted" title={raw}>{raw}</span>
                    <ChevronRight size={14} className="text-text-muted shrink-0" />
                    <select
                      value={mapped ?? ''}
                      onChange={(e) => handleMappingSelect(raw, e.target.value || null)}
                      className={clsx(
                        'flex-1 min-w-0 bg-surface border rounded-lg text-sm p-1.5 outline-none',
                        mapped ? 'border-border text-text' : 'border-amber-300 text-amber-700',
                      )}
                    >
                      <option value="">— Not imported —</option>
                      {FIELD_META[effectiveType].map((f) => (
                        <option key={f.column} value={f.column}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {parsedData.length > 0 && mappedColumns.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-hover border-b border-border">
                    <th className="px-2 pt-3 pb-2 text-left font-medium text-text-muted whitespace-nowrap align-bottom w-8">
                      <span>#</span>
                    </th>
                    {mappedColumns.map(({ mapped }) => (
                      <th key={mapped} className="px-3 py-2 text-left font-medium text-text-muted whitespace-nowrap align-bottom">
                        {mapped}
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
                          rowHasErrors ? 'bg-rose-50' : rowIdx % 2 === 0 ? 'bg-surface' : 'bg-surface-hover/40',
                        )}
                      >
                        <td className="px-2 py-1.5 text-center">
                          {rowHasErrors && (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                              {rowErrors.length}
                            </span>
                          )}
                        </td>
                        {mappedColumns.map(({ mapped }) => {
                          const cellHasError = rowErrors.some((e) => e.field === mapped);
                          const isEditing = editingCell?.rowIndex === rowIdx && editingCell?.field === mapped;

                          return (
                            <td
                              key={mapped}
                              onClick={() => handleCellClick(rowIdx, mapped)}
                              className={clsx(
                                'px-3 py-1.5 text-text whitespace-nowrap max-w-[180px] truncate',
                                cellHasError && 'outline outline-1 outline-red-400',
                                cellHasError && !isEditing && 'cursor-pointer hover:bg-rose-100',
                              )}
                              title={isEditing ? undefined : row[mapped] ?? ''}
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
                                  onBlur={handleCellSave}
                                  className="w-full px-2 py-1 text-sm border border-[#c96442] rounded outline-none focus:ring-1 focus:ring-[#c96442]"
                                />
                              ) : (
                                row[mapped] ?? ''
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

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              variant="primary"
              onClick={() => setStep(3)}
              className="bg-[#c96442] hover:bg-[#b5593b] text-white font-bold px-6"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 — Confirm + Commit */}
      {step === 3 && (
        <div className="space-y-5">
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
                <div className="text-2xl font-bold text-emerald-600">{parsedData.length - errorRowCount}</div>
                <div className="text-text-muted">Valid</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-rose-600">{errorRowCount}</div>
                <div className="text-text-muted">With Errors</div>
              </div>
            </div>
            <p className="text-sm text-text-muted">
              Target table: <code className="bg-surface-hover px-1 rounded">{TABLE_NAMES[effectiveType]}</code>
            </p>
          </Card>

          {errorRowCount > 0 && (
            <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
              <AlertCircle size={14} />
              <span>
                Fix all {totalErrors} error{totalErrors !== 1 ? 's' : ''} in Step 2 before importing.
              </span>
            </div>
          )}

          {commitResult && (
            <Card className="bg-emerald-50 border-emerald-200 space-y-2">
              <h3 className="font-bold text-emerald-800">Import Complete</h3>
              <div className="text-sm text-emerald-700 space-y-1">
                <p>Rows upserted: {commitResult.upserted}</p>
                <p>Rows failed: {commitResult.failed}</p>
                <p>Total: {commitResult.upserted + commitResult.failed}</p>
              </div>
              <Button variant="secondary" onClick={resetFlow}>
                Import Another File
              </Button>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(2)}>
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
    </Card>
  );
}
