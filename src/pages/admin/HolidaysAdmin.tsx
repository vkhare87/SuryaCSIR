import { useState, useMemo, type ChangeEvent } from 'react';
import clsx from 'clsx';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../utils/supabaseClient';
import { Card } from '../../components/ui/Cards';
import { Navigate } from 'react-router-dom';
import { canManageHolidays } from '../../lib/calendar/permissions';
import { Trash2, Edit2, Upload, Plus, Save, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type { Holiday } from '../../types';

type HolidayType = Holiday['holiday_type'];

interface ImportRow {
  date: string;
  name: string;
  type: HolidayType;
  error?: string;
}

const HOLIDAY_TYPES: HolidayType[] = ['Gazetted', 'Restricted', 'Institute'];

function validateImportRow(raw: Record<string, unknown>): ImportRow {
  const date = String(raw.date || raw.Date || '').trim();
  const name = String(raw.name || raw.Name || '').trim();
  const typeRaw = String(raw.type || raw.Type || '').trim();
  const type = HOLIDAY_TYPES.find((t) => t.toLowerCase() === typeRaw.toLowerCase()) ?? 'Gazetted';

  if (!date) return { date, name, type, error: 'Missing date' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { date, name, type, error: 'Date must be YYYY-MM-DD' };
  if (!name) return { date, name, type, error: 'Missing name' };
  if (!HOLIDAY_TYPES.find((t) => t.toLowerCase() === typeRaw.toLowerCase())) {
    return { date, name, type, error: 'Type must be Gazetted/Restricted/Institute' };
  }
  return { date, name, type };
}

export default function HolidaysAdmin() {
  const { user } = useAuth();
  const activeRole = user?.activeRole;
  const { holidays, refreshHolidays } = useData();
  const { push: pushToast } = useToast();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<HolidayType>('Gazetted');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ date: string; name: string; type: HolidayType }>({ date: '', name: '', type: 'Gazetted' });
  const [importRows, setImportRows] = useState<ImportRow[]>([]);

  const years = useMemo(() => {
    const set = new Set<number>([currentYear, currentYear + 1]);
    holidays.forEach((h) => set.add(h.year));
    return Array.from(set).sort((a, b) => a - b);
  }, [holidays, currentYear]);

  const filtered = useMemo(
    () => holidays.filter((h) => h.year === year).sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)),
    [holidays, year]
  );

  if (!activeRole || !canManageHolidays(activeRole)) {
    return <Navigate to="/calendar" replace />;
  }

  async function addHoliday() {
    if (!supabase) return;
    if (!newDate || !newName) {
      pushToast('Date and name are required', 'warning');
      return;
    }
    const y = parseInt(newDate.slice(0, 4), 10);
    const { error } = await supabase.from('holidays').insert({
      holiday_date: newDate,
      name: newName,
      holiday_type: newType,
      year: y,
    });
    if (error) {
      pushToast(`Add failed: ${error.message}`, 'error');
      return;
    }
    pushToast('Holiday added', 'success');
    setNewDate(''); setNewName(''); setNewType('Gazetted');
    await refreshHolidays();
  }

  function startEdit(h: Holiday) {
    setEditingId(h.id);
    setEditValues({ date: h.holiday_date, name: h.name, type: h.holiday_type });
  }

  async function saveEdit(id: string) {
    if (!supabase) return;
    const y = parseInt(editValues.date.slice(0, 4), 10);
    const { error } = await supabase.from('holidays').update({
      holiday_date: editValues.date,
      name: editValues.name,
      holiday_type: editValues.type,
      year: y,
    }).eq('id', id);
    if (error) {
      pushToast(`Update failed: ${error.message}`, 'error');
      return;
    }
    pushToast('Holiday updated', 'success');
    setEditingId(null);
    await refreshHolidays();
  }

  async function deleteHoliday(id: string) {
    if (!supabase) return;
    if (!window.confirm('Delete this holiday?')) return;
    const { error } = await supabase.from('holidays').delete().eq('id', id);
    if (error) {
      pushToast(`Delete failed: ${error.message}`, 'error');
      return;
    }
    pushToast('Holiday deleted', 'success');
    await refreshHolidays();
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      let rows: Record<string, unknown>[] = [];
      if (file.name.toLowerCase().endsWith('.csv')) {
        const parsed = Papa.parse<Record<string, unknown>>(String(data), { header: true, skipEmptyLines: true });
        rows = parsed.data;
      } else {
        const wb = XLSX.read(data, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      }
      setImportRows(rows.map(validateImportRow));
    };
    if (file.name.toLowerCase().endsWith('.csv')) reader.readAsText(file);
    else reader.readAsBinaryString(file);
  }

  async function commitImport() {
    if (!supabase) return;
    const valid = importRows.filter((r) => !r.error);
    if (valid.length === 0) {
      pushToast('No valid rows to import', 'warning');
      return;
    }
    const payload = valid.map((r) => ({
      holiday_date: r.date,
      name: r.name,
      holiday_type: r.type,
      year: parseInt(r.date.slice(0, 4), 10),
    }));
    const { error } = await supabase.from('holidays').insert(payload);
    if (error) {
      pushToast(`Import failed: ${error.message}`, 'error');
      return;
    }
    pushToast(`Imported ${valid.length} rows`, 'success');
    setImportRows([]);
    await refreshHolidays();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-[500] text-text font-serif">Holidays Admin</h1>
        <p className="text-text-muted mt-1">Manage the institute holiday list. SystemAdmin only.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — manual CRUD */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-text text-sm">Holidays for {year}</h2>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="bg-surface border border-border rounded-md px-2 py-1 text-sm text-text"
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-12 gap-2 mb-4 items-end">
            <input
              type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
              className="col-span-4 bg-surface border border-border rounded-md px-2 py-1.5 text-sm text-text"
            />
            <input
              type="text" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)}
              className="col-span-4 bg-surface border border-border rounded-md px-2 py-1.5 text-sm text-text"
            />
            <select
              value={newType} onChange={(e) => setNewType(e.target.value as HolidayType)}
              className="col-span-3 bg-surface border border-border rounded-md px-2 py-1.5 text-sm text-text"
            >
              {HOLIDAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              onClick={addHoliday}
              className="col-span-1 bg-[#c96442] text-white rounded-md py-1.5 hover:bg-[#b5593b]"
              aria-label="Add holiday"
            >
              <Plus size={16} />
            </button>
          </div>

          <table className="w-full text-sm">
            <thead className="text-xs text-text-muted uppercase border-b border-border">
              <tr>
                <th className="text-left py-2">Date</th>
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Type</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <tr key={h.id} className="border-b border-border last:border-0">
                  {editingId === h.id ? (
                    <>
                      <td><input type="date" value={editValues.date} onChange={(e) => setEditValues({ ...editValues, date: e.target.value })} className="bg-surface border border-border rounded-md px-1 py-0.5 text-sm text-text" /></td>
                      <td><input type="text" value={editValues.name} onChange={(e) => setEditValues({ ...editValues, name: e.target.value })} className="bg-surface border border-border rounded-md px-1 py-0.5 text-sm text-text w-full" /></td>
                      <td><select value={editValues.type} onChange={(e) => setEditValues({ ...editValues, type: e.target.value as HolidayType })} className="bg-surface border border-border rounded-md px-1 py-0.5 text-sm text-text">{HOLIDAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></td>
                      <td className="text-right">
                        <button onClick={() => saveEdit(h.id)} className="p-1 text-emerald-500 hover:bg-surface-hover rounded-md" aria-label="Save"><Save size={14} /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 text-text-muted hover:bg-surface-hover rounded-md" aria-label="Cancel"><X size={14} /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2">{h.holiday_date}</td>
                      <td className="py-2">{h.name}</td>
                      <td className="py-2">{h.holiday_type}</td>
                      <td className="text-right">
                        <button onClick={() => startEdit(h)} className="p-1 text-text-muted hover:bg-surface-hover rounded-md" aria-label="Edit"><Edit2 size={14} /></button>
                        <button onClick={() => deleteHoliday(h.id)} className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-md" aria-label="Delete"><Trash2 size={14} /></button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="text-center text-text-muted py-4">No holidays for {year}.</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        {/* RIGHT — bulk import */}
        <Card className="p-4">
          <h2 className="font-bold text-text text-sm mb-4">Bulk import</h2>
          <p className="text-xs text-text-muted mb-3">Expected columns: <code>date</code> (YYYY-MM-DD), <code>name</code>, <code>type</code> (Gazetted / Restricted / Institute).</p>
          <label className="flex items-center gap-2 bg-surface border border-dashed border-border rounded-md px-4 py-3 cursor-pointer hover:bg-surface-hover text-sm text-text">
            <Upload size={16} />
            <span>Choose CSV or XLSX file</span>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
          </label>

          {importRows.length > 0 && (
            <>
              <div className="mt-4 max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-text-muted uppercase border-b border-border">
                    <tr>
                      <th className="text-left py-1">Date</th>
                      <th className="text-left py-1">Name</th>
                      <th className="text-left py-1">Type</th>
                      <th className="text-left py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r, i) => (
                      <tr key={i} className={clsx('border-b border-border', r.error && 'bg-rose-500/5')}>
                        <td className="py-1">{r.date}</td>
                        <td className="py-1">{r.name}</td>
                        <td className="py-1">{r.type}</td>
                        <td className="py-1 text-rose-500">{r.error || 'OK'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={commitImport}
                disabled={importRows.filter((r) => !r.error).length === 0}
                className="mt-3 bg-[#c96442] text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-[#b5593b] disabled:opacity-50"
              >
                Import {importRows.filter((r) => !r.error).length} valid rows
              </button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
