import { useCallback } from 'react';
import { useToast } from './use-toast';

// Error types for better categorization
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ErrorContext {
  operation?: string;
  component?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface ErrorInfo {
  message: string;
  code?: string;
  severity: ErrorSeverity;
  context?: ErrorContext;
  timestamp: string;
  retry?: boolean;
}

// Extract error message from various error types
const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error && typeof error === 'object') {
    // API error response
    if ('response' in error && error.response && typeof error.response === 'object') {
      const response = error.response as any;
      
      // Extract message from API response
      if (response.data?.message) {
        return response.data.message;
      }
      
      if (response.data?.error) {
        return response.data.error;
      }
      
      // HTTP status error
      if (response.status) {
        const statusMessages: Record<number, string> = {
          400: 'Bad request - please check your input',
          401: 'Unauthorized - please log in again',
          403: 'Forbidden - you don\'t have permission for this action',
          404: 'Resource not found',
          409: 'Conflict - the resource already exists or is in use',
          429: 'Too many requests - please try again later',
          500: 'Internal server error - please try again',
          502: 'Service temporarily unavailable',
          503: 'Service temporarily unavailable',
          504: 'Request timeout - please try again'
        };
        
        return statusMessages[response.status] || `HTTP error ${response.status}`;
      }
    }
    
    // Standard Error object
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }
    
    // Error with name
    if ('name' in error && typeof error.name === 'string') {
      return error.name;
    }
  }
  
  return 'An unexpected error occurred';
};

// Determine error severity based on error type and context
const getErrorSeverity = (error: unknown, context?: ErrorContext): ErrorSeverity => {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as any).response;
    
    if (response?.status) {
      const status = response.status;
      
      if (status >= 500) return 'critical';
      if (status === 401 || status === 403) return 'warning';
      if (status >= 400) return 'error';
    }
  }
  
  // Check context for severity hints
  if (context?.operation) {
    const criticalOperations = ['delete', 'remove', 'destroy', 'reset'];
    if (criticalOperations.some(op => context.operation!.toLowerCase().includes(op))) {
      return 'critical';
    }
  }
  
  return 'error';
};

// Check if error is retryable
const isRetryable = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as any).response;
    
    if (response?.status) {
      const status = response.status;
      
      // Network errors, timeouts, and server errors are retryable
      if (status >= 500 || status === 408 || status === 429) {
        return true;
      }
    }
  }
  
  // Check for network errors
  if (error && typeof error === 'object' && 'code' in error) {
    const networkErrors = ['NETWORK_ERROR', 'TIMEOUT', 'ECONNRESET', 'ENOTFOUND'];
    return networkErrors.includes((error as any).code);
  }
  
  return false;
};

// Get error code for tracking
const getErrorCode = (error: unknown): string | undefined => {
  if (error && typeof error === 'object') {
    if ('code' in error && typeof error.code === 'string') {
      return error.code;
    }
    
    if ('response' in error && error.response && typeof error.response === 'object') {
      const response = error.response as any;
      
      if (response.data?.code) {
        return response.data.code;
      }
      
      if (response.status) {
        return `HTTP_${response.status}`;
      }
    }
    
    if ('name' in error && typeof error.name === 'string') {
      return error.name;
    }
  }
  
  return undefined;
};

export const useErrorHandler = () => {
  const { toast } = useToast();
  
  // Log error to monitoring service (placeholder for actual implementation)
  const logError = useCallback((errorInfo: ErrorInfo) => {
    // In a real app, this would send to a monitoring service like Sentry
    console.error('Error logged:', errorInfo);
    
    // Could also send to backend for centralized logging
    // api.post('/api/v1/errors', errorInfo).catch(() => {
    //   // Ignore logging errors
    // });
  }, []);
  
  // Main error handler
  const handleError = useCallback((
    error: unknown, 
    context?: ErrorContext,
    options?: {
      silent?: boolean; // Don't show toast
      logOnly?: boolean; // Only log, don't show toast
      customMessage?: string; // Override error message
    }
  ) => {
    const message = options?.customMessage || getErrorMessage(error);
    const severity = getErrorSeverity(error, context);
    const code = getErrorCode(error);
    const retry = isRetryable(error);
    
    const errorInfo: ErrorInfo = {
      message,
      code,
      severity,
      context,
      timestamp: new Date().toISOString(),
      retry
    };
    
    // Log error
    logError(errorInfo);
    
    // Show toast notification unless silenced or log-only
    if (!options?.silent && !options?.logOnly) {
      const title = context?.operation 
        ? `${context.operation} failed` 
        : 'Operation failed';
      
      let variant: 'default' | 'destructive' = 'destructive';
      if (severity === 'warning' || severity === 'info') {
        variant = 'default';
      }
      
      toast({
        title,
        description: message,
        variant,
        duration: severity === 'critical' ? 10000 : 5000 // Critical errors stay longer
      });
    }
    
    return errorInfo;
  }, [toast, logError]);
  
  // Specialized handlers for common scenarios
  const handleApiError = useCallback((
    error: unknown, 
    operation: string,
    options?: { silent?: boolean }
  ) => {
    return handleError(error, { operation, component: 'api' }, options);
  }, [handleError]);
  
  const handleValidationError = useCallback((
    error: unknown,
    field?: string,
    options?: { silent?: boolean }
  ) => {
    return handleError(error, { 
      operation: 'validation', 
      component: 'form',
      metadata: { field }
    }, options);
  }, [handleError]);
  
  const handleNetworkError = useCallback((
    error: unknown,
    options?: { silent?: boolean }
  ) => {
    return handleError(error, { 
      operation: 'network',
      component: 'api' 
    }, {
      ...options,
      customMessage: 'Network error - please check your connection and try again'
    });
  }, [handleError]);
  
  // Helper for creating error boundaries
  const createErrorBoundary = useCallback((component: string) => {
    return (error: Error, errorInfo: { componentStack: string }) => {
      handleError(error, {
        component,
        operation: 'render',
        metadata: {
          componentStack: errorInfo.componentStack
        }
      });
    };
  }, [handleError]);
  
  // Retry wrapper for functions
  const withRetry = useCallback(async <T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
    context?: ErrorContext
  ): Promise<T> => {
    let lastError: unknown;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry if error is not retryable
        if (!isRetryable(error)) {
          throw error;
        }
        
        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }
        
        // Log retry attempt
        handleError(error, {
          ...context,
          operation: `${context?.operation || 'operation'}_retry`,
          metadata: { 
            attempt, 
            maxRetries,
            ...context?.metadata 
          }
        }, { logOnly: true });
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
      }
    }
    
    // All retries failed
    throw lastError;
  }, [handleError]);
  
  return {
    handleError,
    handleApiError,
    handleValidationError,
    handleNetworkError,
    createErrorBoundary,
    withRetry,
    getErrorMessage,
    isRetryable
  };
};