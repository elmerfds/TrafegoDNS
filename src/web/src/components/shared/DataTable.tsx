import React, { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search,
  RefreshCw,
  Filter
} from 'lucide-react';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  accessor?: (item: T) => React.ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  width?: string;
}

export interface TableAction<T> {
  label: string;
  icon?: React.ReactNode;
  onClick: (item: T) => void;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  disabled?: (item: T) => boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  error?: string | null;
  
  // Pagination
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
  
  // Search and filters
  searchable?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  
  // Filters
  filters?: Array<{
    key: string;
    label: string;
    options: Array<{ label: string; value: string }>;
    value?: string;
    onChange: (value: string) => void;
  }>;
  
  // Actions
  actions?: TableAction<T>[];
  bulkActions?: Array<{
    label: string;
    icon?: React.ReactNode;
    onClick: (selectedItems: T[]) => void;
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  }>;
  
  // Selection
  selectable?: boolean;
  selectedItems?: T[];
  onSelectionChange?: (selectedItems: T[]) => void;
  getItemId?: (item: T, index?: number) => string | number;
  
  // Refresh
  onRefresh?: () => void;
  
  // Empty state
  emptyMessage?: string;
  
  // Custom styling
  className?: string;
}

export function DataTable<T>({
  data,
  columns,
  loading = false,
  error = null,
  pagination,
  searchable = false,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [],
  actions = [],
  bulkActions = [],
  selectable = false,
  selectedItems = [],
  onSelectionChange,
  getItemId = (item: T, index?: number) => index || 0,
  onRefresh,
  emptyMessage = 'No data available',
  className = ''
}: DataTableProps<T>) {
  
  // Handle selection
  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    
    if (selectedItems.length === data.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(data);
    }
  };
  
  const handleSelectItem = (item: T, index: number) => {
    if (!onSelectionChange) return;
    
    const itemId = getItemId(item, index);
    const isSelected = selectedItems.some((selected, idx) => getItemId(selected, idx) === itemId);
    
    if (isSelected) {
      onSelectionChange(selectedItems.filter((selected, idx) => getItemId(selected, idx) !== itemId));
    } else {
      onSelectionChange([...selectedItems, item]);
    }
  };
  
  // Render cell content
  const renderCellContent = (item: T, column: Column<T>) => {
    if (column.accessor) {
      return column.accessor(item);
    }
    
    const value = column.key === 'index' 
      ? data.indexOf(item) + 1 
      : (item as any)[column.key];
    
    if (value === null || value === undefined) {
      return <span className="text-gray-400">-</span>;
    }
    
    // Handle common value types
    if (typeof value === 'boolean') {
      return (
        <Badge variant={value ? 'default' : 'secondary'}>
          {value ? 'Yes' : 'No'}
        </Badge>
      );
    }
    
    if (Array.isArray(value)) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((item, index) => (
            <Badge key={index} variant="outline" className="text-xs">
              {String(item)}
            </Badge>
          ))}
        </div>
      );
    }
    
    return String(value);
  };
  
  // Calculate pagination info
  const paginationInfo = useMemo(() => {
    if (!pagination) return null;
    
    const start = (pagination.page - 1) * pagination.pageSize + 1;
    const end = Math.min(pagination.page * pagination.pageSize, pagination.total);
    const totalPages = Math.ceil(pagination.total / pagination.pageSize);
    
    return { start, end, totalPages };
  }, [pagination]);
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="text-red-500 text-lg font-medium mb-2">Error loading data</div>
        <div className="text-gray-600 mb-4">{error}</div>
        {onRefresh && (
          <Button onClick={onRefresh} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        )}
      </div>
    );
  }
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with search, filters, and actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-2 items-start sm:items-center">
          {/* Search */}
          {searchable && onSearchChange && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
          )}
          
          {/* Filters */}
          {filters.map((filter) => (
            <Select key={filter.key} value={filter.value} onValueChange={filter.onChange}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All {filter.label}</SelectItem>
                {filter.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
        
        <div className="flex gap-2 items-center">
          {/* Bulk actions */}
          {selectable && selectedItems.length > 0 && bulkActions.map((action, index) => (
            <Button
              key={index}
              onClick={() => action.onClick(selectedItems)}
              variant={action.variant || 'outline'}
              size="sm"
            >
              {action.icon}
              {action.label} ({selectedItems.length})
            </Button>
          ))}
          
          {/* Refresh button */}
          {onRefresh && (
            <Button onClick={onRefresh} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>
      
      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={data.length > 0 && selectedItems.length === data.length}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead
                  key={String(column.key)}
                  className={column.width ? `w-[${column.width}]` : ''}
                >
                  {column.header}
                </TableHead>
              ))}
              {actions.length > 0 && (
                <TableHead className="w-24">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              // Loading skeleton
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  {selectable && <TableCell><div className="h-4 bg-gray-200 rounded animate-pulse" /></TableCell>}
                  {columns.map((column) => (
                    <TableCell key={String(column.key)}>
                      <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    </TableCell>
                  ))}
                  {actions.length > 0 && (
                    <TableCell>
                      <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              // Empty state
              <TableRow>
                <TableCell 
                  colSpan={columns.length + (selectable ? 1 : 0) + (actions.length > 0 ? 1 : 0)}
                  className="text-center py-8 text-gray-500"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              // Data rows
              data.map((item, index) => {
                const itemId = getItemId(item, index);
                const isSelected = selectedItems.some(selected => getItemId(selected, selectedItems.indexOf(selected)) === itemId);
                
                return (
                  <TableRow key={itemId} className={isSelected ? 'bg-blue-50' : ''}>
                    {selectable && (
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectItem(item, index)}
                          className="rounded border-gray-300"
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell key={String(column.key)}>
                        {renderCellContent(item, column)}
                      </TableCell>
                    ))}
                    {actions.length > 0 && (
                      <TableCell>
                        <div className="flex gap-1">
                          {actions.map((action, actionIndex) => (
                            <Button
                              key={actionIndex}
                              onClick={() => action.onClick(item)}
                              variant={action.variant || 'ghost'}
                              size="sm"
                              disabled={action.disabled ? action.disabled(item) : false}
                              title={action.label}
                            >
                              {action.icon}
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Pagination */}
      {pagination && paginationInfo && (
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {paginationInfo.start} to {paginationInfo.end} of {pagination.total} results
          </div>
          
          <div className="flex items-center gap-2">
            <Select 
              value={String(pagination.pageSize)} 
              onValueChange={(value) => pagination.onPageSizeChange(Number(value))}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              variant="outline"
              size="sm"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <span className="text-sm">
              Page {pagination.page} of {paginationInfo.totalPages}
            </span>
            
            <Button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= paginationInfo.totalPages}
              variant="outline"
              size="sm"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}