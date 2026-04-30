import React, { useState, useMemo, useEffect } from 'react';
import clsx from 'clsx';
import { Card } from './Cards';
import { LayoutGrid, List, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUI } from '../../contexts/UIContext';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string | number;
  className?: string;
  onRowClick?: (item: T) => void;
  itemsPerPage?: number;
  renderGridItem?: (item: T) => React.ReactNode;
}

export function DataTable<T>({ 
  data, 
  columns, 
  keyExtractor, 
  className, 
  onRowClick,
  itemsPerPage = 10,
  renderGridItem 
}: DataTableProps<T>) {
  const { isMobile } = useUI();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(
    isMobile && renderGridItem ? 'grid' : 'list'
  );
  const [currentPage, setCurrentPage] = useState(1);

  // Sync viewMode with isMobile if it changes
  useEffect(() => {
    if (isMobile && renderGridItem) {
      setViewMode('grid');
    }
  }, [isMobile, renderGridItem]);

  // Reset page when data length changes significantly (e.g. after a filter)
  useEffect(() => {
    setCurrentPage(1);
  }, [data.length]);

  const totalPages = Math.max(1, Math.ceil(data.length / itemsPerPage));
  
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return data.slice(start, start + itemsPerPage);
  }, [data, currentPage, itemsPerPage]);

  const handlePrev = () => setCurrentPage(p => Math.max(1, p - 1));
  const handleNext = () => setCurrentPage(p => Math.min(totalPages, p + 1));

  return (
    <div className="space-y-4">
      {/* Controls Bar - Only show if we need pagination or view toggles */}
      {(renderGridItem || data.length > itemsPerPage) && (
        <div className="flex items-center justify-between bg-surface p-2 rounded-xl border border-border shadow-sm">
          <div className="flex items-center gap-3">
            {renderGridItem && (
               <div className="flex items-center bg-background rounded-lg p-1 border border-border">
                 <button 
                   onClick={() => setViewMode('list')}
                   className={clsx(
                     "p-1.5 rounded-md transition-colors", 
                     viewMode === 'list' ? 'bg-surface-hover text-[#c96442] shadow-[0px_0px_0px_1px_#d1cfc5]' : 'text-text-muted hover:text-text'
                   )}
                   title="List View"
                 >
                   <List size={16} />
                 </button>
                 <button 
                   onClick={() => setViewMode('grid')}
                   className={clsx(
                     "p-1.5 rounded-md transition-colors", 
                     viewMode === 'grid' ? 'bg-surface-hover text-[#c96442] shadow-[0px_0px_0px_1px_#d1cfc5]' : 'text-text-muted hover:text-text'
                   )}
                   title="Grid View"
                 >
                   <LayoutGrid size={16} />
                 </button>
               </div>
            )}
            <span className="text-xs font-medium text-text-muted px-2">
              Showing {data.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, data.length)} of {data.length}
            </span>
          </div>
          
          {data.length > itemsPerPage && (
            <div className="flex items-center gap-1 bg-background rounded-lg p-1 border border-border">
              <button 
                onClick={handlePrev}
                disabled={currentPage === 1}
                className="p-1.5 text-text-muted hover:text-text hover:bg-surface-hover rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous Page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-bold text-text min-w-[3rem] text-center">
                {currentPage} / {totalPages}
              </span>
              <button 
                onClick={handleNext}
                disabled={currentPage === totalPages}
                className="p-1.5 text-text-muted hover:text-text hover:bg-surface-hover rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next Page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {viewMode === 'grid' && renderGridItem ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedData.map(item => (
            <div 
              key={keyExtractor(item)} 
              onClick={() => onRowClick && onRowClick(item)} 
              className={clsx("h-full", onRowClick && "cursor-pointer transition-transform hover:-translate-y-1")}
            >
              {renderGridItem(item)}
            </div>
          ))}
          {paginatedData.length === 0 && (
             <div className="col-span-full py-16 text-center text-text-muted bg-surface/50 rounded-2xl border-2 border-dashed border-border">
               No records found matching your criteria.
             </div>
          )}
        </div>
      ) : (
        <Card className={clsx("overflow-hidden p-0", className)}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-text-muted uppercase bg-surface-hover border-b border-border">
                <tr>
                  {columns.map((col, i) => (
                    <th key={i} className={clsx("px-6 py-4 font-semibold", col.className)}>
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-12 text-center text-text-muted">
                      No records found.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((row, rowIndex) => (
                    <tr 
                      key={keyExtractor(row)} 
                      onClick={() => onRowClick && onRowClick(row)}
                      className={clsx(
                        "border-b border-border/50 hover:bg-surface-hover transition-colors",
                        onRowClick && "cursor-pointer",
                        rowIndex === paginatedData.length - 1 && "border-0"
                      )}
                    >
                      {columns.map((col, colIndex) => (
                        <td key={colIndex} className={clsx("px-6 py-4 whitespace-nowrap", col.className)}>
                          {col.cell 
                            ? col.cell(row) 
                            : (col.accessorKey ? String(row[col.accessorKey] ?? '') : null)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
