/**
 * ColumnCustomizer Component
 * A dropdown for customizing table column visibility and density
 */
import { useState, useRef, useEffect } from 'react';
import { RotateCcw, Check, Columns3 } from 'lucide-react';
import type { TableViewPreference } from '../../api/preferences';

export interface ColumnConfig {
  id: string;
  header: string;
  defaultVisible?: boolean;
}

interface ColumnCustomizerProps {
  columns: ColumnConfig[];
  preferences: TableViewPreference;
  onPreferencesChange: (prefs: TableViewPreference) => void;
  onReset: () => void;
}

export function ColumnCustomizer({
  columns,
  preferences,
  onPreferencesChange,
  onReset,
}: ColumnCustomizerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const visibilityMap = new Map(preferences.columns.map(c => [c.id, c.visible]));

  const handleToggleColumn = (columnId: string) => {
    const newColumns = preferences.columns.map(c =>
      c.id === columnId ? { ...c, visible: !c.visible } : c
    );

    // Ensure at least one column (besides select and actions) is visible
    const visibleCount = newColumns.filter(c =>
      c.visible && c.id !== 'select' && c.id !== 'actions'
    ).length;

    if (visibleCount === 0) return;

    onPreferencesChange({
      ...preferences,
      columns: newColumns,
    });
  };

  const handleDensityChange = (density: 'compact' | 'normal' | 'comfortable') => {
    onPreferencesChange({
      ...preferences,
      density,
    });
  };

  // Filter out system columns like 'select' for display
  const displayColumns = columns.filter(c => c.id !== 'select');

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <Columns3 className="w-4 h-4" />
        <span className="hidden sm:inline">Columns</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900 dark:text-white">Customize View</span>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ×
              </button>
            </div>
          </div>

          {/* Density Selector */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
              Density
            </label>
            <div className="flex gap-1">
              {(['compact', 'normal', 'comfortable'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => handleDensityChange(d)}
                  className={`
                    flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize
                    ${preferences.density === d
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }
                  `}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Column Toggles */}
          <div className="px-2 py-2 max-h-64 overflow-y-auto">
            <label className="px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
              Columns
            </label>
            {displayColumns.map(column => {
              const isVisible = visibilityMap.get(column.id) !== false;
              const isSystemColumn = column.id === 'actions';

              return (
                <button
                  key={column.id}
                  onClick={() => !isSystemColumn && handleToggleColumn(column.id)}
                  disabled={isSystemColumn}
                  className={`
                    w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors
                    ${isSystemColumn
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  <div className={`
                    w-4 h-4 rounded border flex items-center justify-center
                    ${isVisible
                      ? 'bg-primary-500 border-primary-500 text-white'
                      : 'border-gray-300 dark:border-gray-600'
                    }
                  `}>
                    {isVisible && <Check className="w-3 h-3" />}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {typeof column.header === 'string' ? column.header : column.id}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                onReset();
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ColumnCustomizer;
