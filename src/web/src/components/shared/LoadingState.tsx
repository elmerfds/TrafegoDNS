import React from 'react';
import { Loader2 } from 'lucide-react';

// Loading spinner component
export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  return (
    <Loader2 className={`animate-spin ${sizeClasses[size]} ${className}`} />
  );
}

// Skeleton components for different content types
export interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div 
      className={`animate-pulse bg-gray-200 rounded ${className}`} 
      style={style}
    />
  );
}

// Card skeleton
export interface CardSkeletonProps {
  rows?: number;
  showHeader?: boolean;
  className?: string;
}

export function CardSkeleton({ 
  rows = 3, 
  showHeader = true, 
  className = '' 
}: CardSkeletonProps) {
  return (
    <div className={`border rounded-lg p-6 space-y-4 ${className}`}>
      {showHeader && (
        <div className="space-y-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

// Table skeleton
export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  className?: string;
}

export function TableSkeleton({ 
  rows = 5, 
  columns = 4, 
  showHeader = true, 
  className = '' 
}: TableSkeletonProps) {
  return (
    <div className={`border rounded-lg overflow-hidden ${className}`}>
      {showHeader && (
        <div className="border-b bg-gray-50 p-4">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {Array.from({ length: columns }).map((_, index) => (
              <Skeleton key={index} className="h-4 w-3/4" />
            ))}
          </div>
        </div>
      )}
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="p-4">
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <Skeleton key={colIndex} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Chart skeleton
export interface ChartSkeletonProps {
  type?: 'bar' | 'line' | 'pie';
  className?: string;
}

export function ChartSkeleton({ type = 'bar', className = '' }: ChartSkeletonProps) {
  if (type === 'pie') {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="relative">
          <Skeleton className="h-32 w-32 rounded-full" />
          <Skeleton className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-16 w-16 rounded-full bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 ${className}`}>
      <div className="flex items-end justify-between h-32 gap-2">
        {Array.from({ length: 7 }).map((_, index) => {
          const height = Math.random() * 80 + 20; // Random height between 20-100%
          return (
            <Skeleton 
              key={index} 
              className="w-full" 
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-3 w-8" />
        ))}
      </div>
    </div>
  );
}

// Statistics cards skeleton
export interface StatsSkeletonProps {
  cards?: number;
  className?: string;
}

export function StatsSkeleton({ cards = 4, className = '' }: StatsSkeletonProps) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
            <Skeleton className="h-10 w-10 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Main loading state component
export interface LoadingStateProps {
  type: 'spinner' | 'skeleton' | 'card' | 'table' | 'chart' | 'stats';
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  rows?: number;
  columns?: number;
  cards?: number;
  chartType?: 'bar' | 'line' | 'pie';
  showHeader?: boolean;
  className?: string;
}

export function LoadingState({ 
  type, 
  size = 'md',
  message,
  rows,
  columns,
  cards,
  chartType,
  showHeader,
  className = ''
}: LoadingStateProps) {
  const renderLoading = () => {
    switch (type) {
      case 'spinner':
        return (
          <div className="flex flex-col items-center justify-center p-8 space-y-4">
            <Spinner size={size} />
            {message && <p className="text-gray-600 text-sm">{message}</p>}
          </div>
        );
      
      case 'card':
        return <CardSkeleton rows={rows} showHeader={showHeader} className={className} />;
      
      case 'table':
        return (
          <TableSkeleton 
            rows={rows} 
            columns={columns} 
            showHeader={showHeader} 
            className={className} 
          />
        );
      
      case 'chart':
        return <ChartSkeleton type={chartType} className={className} />;
      
      case 'stats':
        return <StatsSkeleton cards={cards} className={className} />;
      
      case 'skeleton':
      default:
        return <Skeleton className={`h-32 w-full ${className}`} />;
    }
  };

  return (
    <div className={className}>
      {renderLoading()}
    </div>
  );
}

// High-level loading wrapper component
export interface LoadingWrapperProps {
  loading: boolean;
  error?: string | null;
  loadingType?: LoadingStateProps['type'];
  loadingProps?: Omit<LoadingStateProps, 'type'>;
  children: React.ReactNode;
  emptyMessage?: string;
  showEmpty?: boolean;
  onRetry?: () => void;
  className?: string;
}

export function LoadingWrapper({
  loading,
  error,
  loadingType = 'spinner',
  loadingProps = {},
  children,
  emptyMessage = 'No data available',
  showEmpty = false,
  onRetry,
  className = ''
}: LoadingWrapperProps) {
  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 text-center space-y-4 ${className}`}>
        <div className="text-red-500 text-lg font-medium">Error loading data</div>
        <div className="text-gray-600">{error}</div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className={className}>
        <LoadingState type={loadingType} {...loadingProps} />
      </div>
    );
  }

  if (showEmpty) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
        <div className="text-gray-500">{emptyMessage}</div>
      </div>
    );
  }

  return <div className={className}>{children}</div>;
}