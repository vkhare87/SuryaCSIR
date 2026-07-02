import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Plus, Edit2, Trash2, RefreshCw, ChevronUp, ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';
import { Card } from './ui/Cards';
import { EntityEditModal, PK_FIELD } from './EntityEditModal';
import { supabase } from '../utils/supabaseClient';
import {
  TABLE_NAMES,
  FILE_TYPE_LABELS,
  FIELD_META,
  type FileType,
} from '../utils/dataMigration';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortDir = 'asc' | 'desc';

interface SortState {
  col: string;
  dir: SortDir;
}

// ---------------------------------------------------------------------------
// Delete Confirm Modal
// ---------------------------------------------------------------------------

function DeleteConfirmModal({
  label,
  onConfirm,
  onCancel,
  deleting,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
            <Trash2 size={18} className="text-rose-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text">Delete Record?</h3>
            <p className="text-sm text-text-muted mt-1">
              <span className="font-medium text-text">{label}</span> will be permanently removed.
              This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text border border-border rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

interface EntityRecordsPanelProps {
  type: FileType;
}

export function EntityRecordsPanel({ type }: EntityRecordsPanelProps) {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);
  const [editRecord, setEditRecord] = useState<Record<string, unknown> | null | undefined>(
    undefined,
  ); // undefined = closed, null = new, object = edit
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fields = FIELD_META[type];
  const pk = PK_FIELD[type];
  // Show at most 6 columns in the table (PK + 5 most useful)
  const visibleFields = useMemo(() => {
    const pkField = fields.find(f => f.column === pk);
    const rest = fields.filter(f => f.column !== pk).slice(0, 5);
    return pkField ? [pkField, ...rest] : rest.slice(0, 6);
  }, [fields, pk]);

  const loadRecords = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from(TABLE_NAMES[type])
      .select('*')
      .order(pk, { ascending: true });
    if (e) {
      setError(e.message);
    } else {
      setRecords((data ?? []) as Record<string, unknown>[]);
    }
    setLoading(false);
  }, [type, pk]);

  useEffect(() => {
    loadRecords();
    setSearch('');
    setSort(null);
  }, [loadRecords]);

  // Search across all string fields
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return records;
    return records.filter(row =>
      Object.values(row).some(v => String(v ?? '').toLowerCase().includes(q)),
    );
  }, [records, search]);

  // Sort
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const va = String(a[sort.col] ?? '');
      const vb = String(b[sort.col] ?? '');
      return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [filtered, sort]);

  const toggleSort = (col: string) => {
    setSort(prev =>
      prev?.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' },
    );
  };

  const handleDelete = async () => {
    if (!supabase || !deleteTarget) return;
    setDeleting(true);
    const { error: e } = await supabase
      .from(TABLE_NAMES[type])
      .delete()
      .eq(pk, deleteTarget[pk]);
    setDeleting(false);
    if (e) {
      alert(`Delete failed: ${e.message}`);
    } else {
      setDeleteTarget(null);
      loadRecords();
    }
  };

  const recordLabel = (row: Record<string, unknown>): string => {
    // Try to get a human-readable label from the record
    const nameField = fields.find(f =>
      ['Name', 'StudentName', 'StaffName', 'ProjectName', 'divName'].includes(f.column),
    );
    if (nameField && row[nameField.column]) return String(row[nameField.column]);
    return String(row[pk] ?? 'this record');
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Edit modal */}
      {editRecord !== undefined && (
        <EntityEditModal
          type={type}
          record={editRecord}
          onClose={() => setEditRecord(undefined)}
          onSaved={loadRecords}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteConfirmModal
          label={recordLabel(deleteTarget)}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder={`Search ${FILE_TYPE_LABELS[type].toLowerCase()}…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#c96442]/30"
            />
          </div>
          <button
            onClick={() => loadRecords()}
            disabled={loading}
            className="p-2 border border-border rounded-lg hover:bg-surface-hover text-text-muted transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setEditRecord(null)}
            className="flex items-center gap-2 px-4 py-2 bg-[#c96442] hover:bg-[#b5593b] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus size={14} /> New Record
          </button>
        </div>

        {/* Status */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
            <AlertTriangle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Count */}
        {!loading && !error && (
          <p className="text-xs text-text-muted">
            {sorted.length === records.length
              ? `${records.length} record${records.length !== 1 ? 's' : ''}`
              : `${sorted.length} of ${records.length} records`}
          </p>
        )}

        {/* Table */}
        <Card className="p-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw size={20} className="animate-spin text-text-muted" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-16 text-center text-sm text-text-muted">
              {records.length === 0 ? 'No records yet. Add one above.' : 'No results for that search.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-hover border-b border-border text-left">
                    {visibleFields.map(f => (
                      <th
                        key={f.column}
                        onClick={() => toggleSort(f.column)}
                        className="px-4 py-3 font-medium text-text-muted text-xs uppercase tracking-wider cursor-pointer select-none hover:text-text whitespace-nowrap"
                      >
                        <span className="flex items-center gap-1">
                          {f.label}
                          {sort?.col === f.column ? (
                            sort.dir === 'asc'
                              ? <ChevronUp size={12} className="text-[#c96442]" />
                              : <ChevronDown size={12} className="text-[#c96442]" />
                          ) : (
                            <ChevronUp size={12} className="opacity-0 group-hover:opacity-30" />
                          )}
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 font-medium text-text-muted text-xs uppercase tracking-wider text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr
                      key={String(row[pk] ?? i)}
                      className={clsx(
                        'border-b border-border last:border-0 hover:bg-surface-hover/50 transition-colors',
                      )}
                    >
                      {visibleFields.map(f => (
                        <td key={f.column} className="px-4 py-3 text-text whitespace-nowrap max-w-[200px]">
                          <span className="block truncate" title={String(row[f.column] ?? '')}>
                            {String(row[f.column] ?? '—')}
                          </span>
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setEditRecord(row)}
                            className="p-1.5 rounded-md hover:bg-[#c96442]/10 text-text-muted hover:text-[#c96442] transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(row)}
                            className="p-1.5 rounded-md hover:bg-rose-50 text-text-muted hover:text-rose-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
