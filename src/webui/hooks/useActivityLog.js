// src/webui/hooks/useActivityLog.js
/**
 * React hook for activity log integration
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchActivityLog } from '../services/apiService';
import useWebSocket from './useWebSocket';

/**
 * Custom hook for activity log
 * @param {Object} initialFilters - Initial filter criteria
 * @returns {Object} Activity log state and handlers
 */
const useActivityLog = (initialFilters = {}) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    type: 'all',
    action: '',
    search: '',
    startDate: '',
    endDate: '',
    ...initialFilters
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 100,
    offset: 0,
    total: 0,
    hasMore: false
  });
  
  // Subscribe to activity log events via WebSocket
  const { events } = useWebSocket(['dns:record:created', 'dns:record:updated', 'dns:record:deleted']);
  
  // Load logs from API
  const loadLogs = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      // Calculate offset based on page and limit
      const offset = (page - 1) * pagination.limit;
      
      // Prepare filter parameters
      const params = {
        limit: pagination.limit,
        offset,
        ...(filters.type !== 'all' && { type: filters.type }),
        ...(filters.action && { action: filters.action }),
        ...(filters.search && { search: filters.search }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate })
      };
      
      const response = await fetchActivityLog(params);
      
      setLogs(response.logs || []);
      setPagination({
        ...pagination,
        page,
        offset,
        total: response.total || 0,
        hasMore: response.hasMore || false
      });
    } catch (err) {
      console.error('Error loading activity logs:', err);
      setError('Failed to load activity logs. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit]);
  
  // Handle filter changes
  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters
    }));
    
    // Reset pagination when filters change
    setPagination(prev => ({
      ...prev,
      page: 1,
      offset: 0
    }));
  }, []);
  
  // Load next page
  const loadNextPage = useCallback(() => {
    if (pagination.hasMore) {
      loadLogs(pagination.page + 1);
    }
  }, [loadLogs, pagination.page, pagination.hasMore]);
  
  // Load previous page
  const loadPreviousPage = useCallback(() => {
    if (pagination.page > 1) {
      loadLogs(pagination.page - 1);
    }
  }, [loadLogs, pagination.page]);
  
  // Change page size
  const changePageSize = useCallback((limit) => {
    setPagination(prev => ({
      ...prev,
      limit,
      page: 1,
      offset: 0
    }));
  }, []);
  
  // Initial load and when filters change
  useEffect(() => {
    loadLogs(1);
  }, [loadLogs, filters]);
  
  // Monitor WebSocket events to update log list
  useEffect(() => {
    // If we receive DNS record events, reload logs
    const eventTypes = [
      'dns:record:created',
      'dns:record:updated',
      'dns:record:deleted'
    ];
    
    const hasNewEvents = eventTypes.some(type => events[type]);
    
    if (hasNewEvents) {
      loadLogs(pagination.page);
    }
  }, [events, loadLogs, pagination.page]);
  
  return {
    logs,
    loading,
    error,
    filters,
    pagination,
    updateFilters,
    loadNextPage,
    loadPreviousPage,
    changePageSize,
    refresh: () => loadLogs(pagination.page)
  };
};

export default useActivityLog;