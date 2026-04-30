import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';

interface Column { key: string; label: string; }

interface Props {
  columns: Column[];
  rows: Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
}

export function DynamicTable({ columns, rows, onChange }: Props) {
  const addRow = () => {
    const empty = Object.fromEntries(columns.map(c => [c.key, '']));
    onChange([...rows, empty]);
  };

  const updateCell = (rowIdx: number, key: string, val: string) => {
    onChange(rows.map((r, i) => i === rowIdx ? { ...r, [key]: val } : r));
  };

  const removeRow = (rowIdx: number) => {
    onChange(rows.filter((_, i) => i !== rowIdx));
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface">
              {columns.map(c => (
                <th key={c.key} className="px-3 py-2 text-left font-medium text-text-muted">{c.label}</th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-4 text-center text-text-muted text-xs">
                  No entries yet
                </td>
              </tr>
            ) : rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-border last:border-0">
                {columns.map(c => (
                  <td key={c.key} className="px-2 py-1">
                    <input
                      className="w-full bg-transparent text-text text-sm px-1 py-1 rounded focus:outline-none focus:ring-1 focus:ring-[#c96442]"
                      value={row[c.key] ?? ''}
                      onChange={e => updateCell(rowIdx, c.key, e.target.value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-1 text-center">
                  <button
                    onClick={() => removeRow(rowIdx)}
                    className="p-1 text-text-muted hover:text-rose-600 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="ghost" size="sm" onClick={addRow}>
        <Plus size={14} className="mr-1" /> Add Row
      </Button>
    </div>
  );
}
