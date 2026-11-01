/**
 * DataTable Component
 * A modern, feature-rich table with column customization, sorting, and density options
 */
import { useMemo, useCallback } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { TableViewPreference } from '../../api/preferences';

export interface DataTableColumn<T> {
  id: string;
  header: string | React.ReactNode;
  accessorKey?: keyof T;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  defaultVisible?: boolean;
  minWidth?: number;
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  keyField: keyof T;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;

  // Preferences
  preferences?: TableViewPreference;
  onPreferencesChange?: (prefs: TableViewPreference) => void;

  // Sorting
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (column: string, direction: 'asc' | 'desc') => void;

  // Selection
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;

  // Row actions
  onRowClick?: (row: T) => void;
}

const densityStyles = {
  compact: {
    cell: 'px-3 py-2 text-xs',
    header: 'px-3 py-2 text-xs',
  },
  normal: {
    cell: 'px-4 py-3 text-sm',
    header: 'px-4 py-3 text-xs',
  },
  comfortable: {
    cell: 'px-6 py-4 text-sm',
    header: 'px-6 py-3 text-xs',
  },
};

export function DataTable<T>({
  columns,
  data,
  keyField,
  isLoading = false,
  emptyMessage = 'No data available',
  emptyIcon,
  preferences,
  onPreferencesChange: _onPreferencesChange,
  sortColumn,
  sortDirection = 'asc',
  onSort,
  selectable = false,
  selectedIds = new Set(),
  onSelectionChange,
  onRowClick,
}: DataTableProps<T>) {
  // Note: _onPreferencesChange is reserved for future inline preference editing
  void _onPreferencesChange;
  const density = preferences?.density ?? 'normal';
  const styles = densityStyles[density];

  // Get visible columns based on preferences
  const visibleColumns = useMemo(() => {
    if (!preferences?.columns) {
      return columns.filter(c => c.defaultVisible !== false);
    }

    const visibilityMap = new Map(preferences.columns.map(c => [c.id, c.visible]));
    const orderMap = new Map(preferences.columnOrder.map((id, idx) => [id, idx]));

    return columns
      .filter(c => visibilityMap.get(c.id) !== false)
      .sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? 999;
        const orderB = orderMap.get(b.id) ?? 999;
        return orderA - orderB;
      });
  }, [columns, preferences]);

  // Handle select all
  const allSelected = data.length > 0 && data.every(row =>
    selectedIds.has(String((row as Record<string, unknown>)[keyField as string]))
  );
  const someSelected = data.some(row =>
    selectedIds.has(String((row as Record<string, unknown>)[keyField as string]))
  );

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;

    if (allSelected) {
      // Deselect all visible
      const newSelection = new Set(selectedIds);
      data.forEach(row => {
        newSelection.delete(String((row as Record<string, unknown>)[keyField as string]));
      });
      onSelectionChange(newSelection);
    } else {
      // Select all visible
      const newSelection = new Set(selectedIds);
      data.forEach(row => {
        newSelection.add(String((row as Record<string, unknown>)[keyField as string]));
      });
      onSelectionChange(newSelection);
    }
  }, [allSelected, data, keyField, onSelectionChange, selectedIds]);

  const handleSelectRow = useCallback((rowKey: string) => {
    if (!onSelectionChange) return;

    const newSelection = new Set(selectedIds);
    if (newSelection.has(rowKey)) {
      newSelection.delete(rowKey);
    } else {
      newSelection.add(rowKey);
    }
    onSelectionChange(newSelection);
  }, [onSelectionChange, selectedIds]);

  const handleSort = useCallback((columnId: string) => {
    if (!onSort) return;

    if (sortColumn === columnId) {
      onSort(columnId, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(columnId, 'asc');
    }
  }, [onSort, sortColumn, sortDirection]);

  // Loading state with skeleton
  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className={`flex gap-4 ${styles.header}`}>
            {visibleColumns.slice(0, 6).map((_, idx) => (
              <div key={idx} className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse flex-1" />
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className={`flex gap-4 border-b border-gray-100 dark:border-gray-800 ${styles.cell}`}>
              {visibleColumns.slice(0, 6).map((_, idx) => (
                <div key={idx} className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex flex-col items-center justify-center py-16 px-4">
          {emptyIcon && (
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              {emptyIcon}
            </div>
          )}
          <p className="text-gray-500 dark:text-gray-400 text-center">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50 dark:bg-gray-800/80 sticky top-0 z-10 backdrop-blur-sm">
            <tr>
              {selectable && (
                <th className={`${styles.header} w-10`}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => {
                      if (el) el.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                  />
                </th>
              )}
              {visibleColumns.map(column => (
                <th
                  key={column.id}
                  className={`
                    ${styles.header}
                    text-left font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider
                    ${column.sortable ? 'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors' : ''}
                    ${column.className ?? ''}
                  `}
                  style={{ minWidth: column.minWidth }}
                  onClick={() => column.sortable && handleSort(column.id)}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{column.header}</span>
                    {column.sortable && (
                      <span className="text-gray-400">
                        {sortColumn === column.id ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-primary-500" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-primary-500" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
            {data.map(row => {
              const rowKey = String((row as Record<string, unknown>)[keyField as string]);
              const isSelected = selectedIds.has(rowKey);

              return (
                <tr
                  key={rowKey}
                  className={`
                    transition-colors
                    ${isSelected
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }
                    ${onRowClick ? 'cursor-pointer' : ''}
                  `}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <td className={`${styles.cell} w-10`} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectRow(rowKey)}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                      />
                    </td>
                  )}
                  {visibleColumns.map(column => (
                    <td
                      key={column.id}
                      className={`
                        ${styles.cell}
                        text-gray-700 dark:text-gray-300
                        ${column.className ?? ''}
                      `}
                    >
                      {column.render
                        ? column.render(row)
                        : column.accessorKey
                          ? String((row as Record<string, unknown>)[column.accessorKey as string] ?? '')
                          : ''}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DataTable;
