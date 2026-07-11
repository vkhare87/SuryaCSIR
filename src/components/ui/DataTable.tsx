import React, { useState, useMemo, useEffect } from 'react';
import clsx from 'clsx';
import Papa from 'papaparse';
import { Card } from './Cards';
import {
  LayoutGrid, List, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  ChevronsUpDown, Search, Columns3, Download, Check,
} from 'lucide-react';
import { useUI } from '../../contexts/UIContext';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
  className?: string;
  /** stable id for visibility persistence; defaults to header */
  id?: string;
  /** sort/search/export source when the cell is custom-rendered */
  value?: (item: T) => string | number;
  /** default: true when accessorKey or value present */
  sortable?: boolean;
  /** default: true when header is non-empty */
  enableHiding?: boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string | number;
  className?: string;
  onRowClick?: (item: T) => void;
  itemsPerPage?: number;
  renderGridItem?: (item: T) => React.ReactNode;
  /** show global search box */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** inline detail row toggled by a chevron */
  renderExpanded?: (item: T) => React.ReactNode;
  /** show/hide columns menu (persisted when tableId set) */
  enableColumnVisibility?: boolean;
  /** localStorage key for column visibility */
  tableId?: string;
  /** filename (no ext) → enables CSV export button */
  exportFileName?: string;
}

type SortDir = 'asc' | 'desc';

function colId<T>(col: Column<T>, i: number): string {
  return col.id ?? (col.header || `col-${i}`);
}

function getValue<T>(col: Column<T>, item: T): string | number | undefined {
  if (col.value) return col.value(item);
  if (col.accessorKey) {
    const v = item[col.accessorKey];
    return v == null ? undefined : (v as unknown as string | number);
  }
  return undefined;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  className,
  onRowClick,
  itemsPerPage = 10,
  renderGridItem,
  searchable = false,
  searchPlaceholder = 'Search…',
  renderExpanded,
  enableColumnVisibility = false,
  tableId,
  exportFileName,
}: DataTableProps<T>) {
  const { isMobile, isTablet } = useUI();
  const cardMode = isMobile || isTablet;
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(
    cardMode && renderGridItem ? 'grid' : 'list'
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ id: string; dir: SortDir } | null>(null);
  const [expanded, setExpanded] = useState<Set<string | number>>(new Set());
  const [showColMenu, setShowColMenu] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (!tableId) return new Set();
    try {
      const raw = localStorage.getItem(`dt-cols:${tableId}`);
      return raw ? new Set<string>(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    if (cardMode && renderGridItem) setViewMode('grid');
  }, [cardMode, renderGridItem]);

  useEffect(() => {
    if (!tableId) return;
    try { localStorage.setItem(`dt-cols:${tableId}`, JSON.stringify([...hidden])); } catch { /* ignore */ }
  }, [hidden, tableId]);

  const visibleColumns = useMemo(
    () => columns.filter((c, i) => !hidden.has(colId(c, i))),
    [columns, hidden]
  );

  // search → sort. Reset to page 1 whenever the result set changes.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(item =>
      columns.some(col => {
        const v = getValue(col, item);
        return v != null && String(v).toLowerCase().includes(q);
      })
    );
  }, [data, columns, query]);

  const sorted = useMemo(() => {
    if (!sort) return searched;
    const col = columns.find((c, i) => colId(c, i) === sort.id);
    if (!col) return searched;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...searched].sort((a, b) => {
      const av = getValue(col, a);
      const bv = getValue(col, b);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor;
    });
  }, [searched, columns, sort]);

  useEffect(() => { setCurrentPage(1); }, [sorted.length]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / itemsPerPage));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sorted.slice(start, start + itemsPerPage);
  }, [sorted, currentPage, itemsPerPage]);

  const handlePrev = () => setCurrentPage(p => Math.max(1, p - 1));
  const handleNext = () => setCurrentPage(p => Math.min(totalPages, p + 1));

  const toggleSort = (col: Column<T>, i: number) => {
    const sortable = col.sortable ?? (col.accessorKey != null || col.value != null);
    if (!sortable) return;
    const id = colId(col, i);
    setSort(prev =>
      prev?.id !== id ? { id, dir: 'asc' } : prev.dir === 'asc' ? { id, dir: 'desc' } : null
    );
  };

  const toggleExpand = (key: string | number) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const exportCsv = () => {
    const cols = visibleColumns.filter(c => c.header);
    const rows = sorted.map(item => {
      const r: Record<string, string> = {};
      cols.forEach(c => { r[c.header] = String(getValue(c, item) ?? ''); });
      return r;
    });
    const csv = Papa.unparse({ fields: cols.map(c => c.header), data: rows.map(r => cols.map(c => r[c.header])) });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hideableColumns = columns
    .map((c, i) => ({ col: c, id: colId(c, i) }))
    .filter(({ col }) => (col.enableHiding ?? !!col.header) && col.header);

  const showGenericCards = cardMode && !renderGridItem;
  const showToolbar = searchable || enableColumnVisibility || exportFileName || renderGridItem || sorted.length > itemsPerPage;
  const colSpan = visibleColumns.length + (renderExpanded ? 1 : 0);

  return (
    <div className="space-y-4">
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2 justify-between bg-surface p-2 rounded-xl border border-border shadow-[var(--shadow-e1)]">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {renderGridItem && (
              <div className="flex items-center bg-background rounded-lg p-1 border border-border">
                <button onClick={() => setViewMode('list')}
                  className={clsx("p-1.5 rounded-md transition-colors", viewMode === 'list' ? 'bg-surface-hover text-terracotta shadow-[0px_0px_0px_1px_var(--color-ring-warm)]' : 'text-text-muted hover:text-text')}
                  title="List View"><List size={16} /></button>
                <button onClick={() => setViewMode('grid')}
                  className={clsx("p-1.5 rounded-md transition-colors", viewMode === 'grid' ? 'bg-surface-hover text-terracotta shadow-[0px_0px_0px_1px_var(--color-ring-warm)]' : 'text-text-muted hover:text-text')}
                  title="Grid View"><LayoutGrid size={16} /></button>
              </div>
            )}
            {searchable && (
              <div className="relative flex-1 max-w-xs">
                <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-background border border-border text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-terracotta/50"
                />
              </div>
            )}
            <span className="text-xs font-medium text-text-muted px-1 whitespace-nowrap">
              {sorted.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, sorted.length)} of {sorted.length}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {exportFileName && (
              <button onClick={exportCsv} title="Export CSV"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text hover:bg-surface-hover rounded-lg transition-colors">
                <Download size={15} /> CSV
              </button>
            )}
            {enableColumnVisibility && hideableColumns.length > 0 && (
              <div className="relative">
                <button onClick={() => setShowColMenu(o => !o)} title="Columns"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text hover:bg-surface-hover rounded-lg transition-colors">
                  <Columns3 size={15} /> Columns
                </button>
                {showColMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowColMenu(false)} />
                    <div className="absolute right-0 mt-1 z-20 w-52 bg-surface-raised border border-border rounded-xl shadow-[var(--shadow-e3)] p-1.5">
                      {hideableColumns.map(({ col, id }) => {
                        const isHidden = hidden.has(id);
                        return (
                          <button key={id}
                            onClick={() => setHidden(prev => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id); else next.add(id);
                              return next;
                            })}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-text hover:bg-surface-hover rounded-lg text-left">
                            <span className={clsx("w-4 h-4 rounded border flex items-center justify-center shrink-0", !isHidden ? "bg-terracotta border-terracotta text-white" : "border-border")}>
                              {!isHidden && <Check size={12} />}
                            </span>
                            {col.header}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
            {sorted.length > itemsPerPage && (
              <div className="flex items-center gap-1 bg-background rounded-lg p-1 border border-border">
                <button onClick={handlePrev} disabled={currentPage === 1}
                  className="p-1.5 text-text-muted hover:text-text hover:bg-surface-hover rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Previous">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-bold text-text min-w-[3rem] text-center">{currentPage} / {totalPages}</span>
                <button onClick={handleNext} disabled={currentPage === totalPages}
                  className="p-1.5 text-text-muted hover:text-text hover:bg-surface-hover rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Next">
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {renderGridItem && viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedData.map(item => (
            <div key={keyExtractor(item)} onClick={() => onRowClick?.(item)}
              className={clsx("h-full", onRowClick && "cursor-pointer transition-transform hover:-translate-y-1")}>
              {renderGridItem(item)}
            </div>
          ))}
          {paginatedData.length === 0 && (
            <div className="col-span-full py-16 text-center text-text-muted bg-surface/50 rounded-2xl border-2 border-dashed border-border">
              No records found matching your criteria.
            </div>
          )}
        </div>
      ) : showGenericCards ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {paginatedData.length === 0 ? (
            <div className="col-span-full py-12 text-center text-text-muted bg-surface/50 rounded-2xl border-2 border-dashed border-border">
              No records found.
            </div>
          ) : (
            paginatedData.map(row => (
              <Card key={keyExtractor(row)} onClick={() => onRowClick?.(row)}
                className={clsx("space-y-2", onRowClick && "cursor-pointer hover:bg-surface-hover transition-colors")}>
                {visibleColumns.filter(c => c.header).map((col, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-text-muted text-xs font-medium shrink-0">{col.header}</span>
                    <span className="text-text text-right min-w-0">
                      {col.cell ? col.cell(row) : (col.accessorKey ? String(row[col.accessorKey] ?? '') : null)}
                    </span>
                  </div>
                ))}
                {visibleColumns.filter(c => !c.header).map((col, i) => (
                  <div key={`act-${i}`} className="flex justify-end pt-1">{col.cell ? col.cell(row) : null}</div>
                ))}
              </Card>
            ))
          )}
        </div>
      ) : (
        <Card className={clsx("overflow-hidden p-0", className)} variant="raised">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-text-muted uppercase bg-surface-hover border-b border-border sticky top-0 z-10">
                <tr>
                  {renderExpanded && <th className="w-10" />}
                  {visibleColumns.map((col, i) => {
                    const sortable = col.sortable ?? (col.accessorKey != null || col.value != null);
                    const id = colId(col, columns.indexOf(col));
                    const active = sort?.id === id;
                    return (
                      <th key={i}
                        onClick={() => toggleSort(col, columns.indexOf(col))}
                        className={clsx("px-6 py-4 font-semibold select-none", sortable && "cursor-pointer hover:text-text", col.className)}>
                        <span className="inline-flex items-center gap-1">
                          {col.header}
                          {sortable && col.header && (
                            active
                              ? (sort!.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)
                              : <ChevronsUpDown size={13} className="opacity-40" />
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="px-6 py-12 text-center text-text-muted">No records found.</td>
                  </tr>
                ) : (
                  paginatedData.map((row, rowIndex) => {
                    const key = keyExtractor(row);
                    const isOpen = expanded.has(key);
                    return (
                      <React.Fragment key={key}>
                        <tr
                          onClick={() => onRowClick?.(row)}
                          className={clsx(
                            "border-b border-border/50 transition-colors hover:bg-surface-hover hover:shadow-[inset_3px_0_0_var(--color-terracotta)]",
                            onRowClick && "cursor-pointer",
                            rowIndex === paginatedData.length - 1 && !isOpen && "border-0"
                          )}>
                          {renderExpanded && (
                            <td className="pl-4 pr-0 py-4">
                              <button
                                onClick={e => { e.stopPropagation(); toggleExpand(key); }}
                                className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                                title={isOpen ? 'Collapse' : 'Expand'}>
                                <ChevronDown size={16} className={clsx("transition-transform", isOpen && "rotate-180")} />
                              </button>
                            </td>
                          )}
                          {visibleColumns.map((col, colIndex) => (
                            <td key={colIndex} className={clsx("px-6 py-4 whitespace-nowrap", col.className)}>
                              {col.cell ? col.cell(row) : (col.accessorKey ? String(row[col.accessorKey] ?? '') : null)}
                            </td>
                          ))}
                        </tr>
                        {renderExpanded && isOpen && (
                          <tr className={clsx("bg-surface-hover/40", rowIndex === paginatedData.length - 1 && "border-0")}>
                            <td colSpan={colSpan} className="px-6 py-4 border-b border-border/50">
                              {renderExpanded(row)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
