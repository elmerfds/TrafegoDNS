// src/webui/hooks/useDnsRecords.js
/**
 * React hook for DNS records integration
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchRecords, triggerRefresh, deleteRecord } from '../services/apiService';
import useWebSocket from './useWebSocket';

/**
 * Custom hook for DNS records
 * @returns {Object} DNS records state and handlers
 */
const useDnsRecords = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    type: 'all',
    search: ''
  });
  const [filteredRecords, setFilteredRecords] = useState([]);
  
  // Subscribe to DNS record events via WebSocket
  const { events, requestRefresh: wsRefresh } = useWebSocket([
    'dns:records:updated',
    'dns:record:created',
    'dns:record:updated',
    'dns:record:deleted'
  ]);
  
  // Load records from API
  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchRecords();
      setRecords(data?.records || []);
    } catch (err) {
      console.error('Error loading DNS records:', err);
      setError('Failed to load DNS records. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Refresh records
  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      
      // Try WebSocket refresh first
      const wsRefreshSuccess = wsRefresh();
      
      // Fall back to HTTP API if WebSocket is not connected
      if (!wsRefreshSuccess) {
        await triggerRefresh();
        await loadRecords();
      }
    } catch (err) {
      console.error('Error refreshing records:', err);
      setError('Failed to refresh records. Please try again.');
      
      // Try to load records directly if refresh failed
      loadRecords();
    } finally {
      setRefreshing(false);
    }
  }, [loadRecords, wsRefresh]);
  
  // Delete record
  const removeRecord = useCallback(async (recordId) => {
    try {
      setError(null);
      
      await deleteRecord(recordId);
      
      // Update local state
      setRecords(prev => prev.filter(record => record.id !== recordId));
    } catch (err) {
      console.error('Error deleting record:', err);
      setError(err.response?.data?.error || 'Failed to delete record. Please try again.');
      return false;
    }
    
    return true;
  }, []);
  
  // Filter records
  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters
    }));
  }, []);
  
  // Apply filters
  useEffect(() => {
    let filtered = [...records];
    
    // Filter by type
    if (filters.type !== 'all') {
      filtered = filtered.filter(record => record.type === filters.type);
    }
    
    // Filter by search term
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(record => 
        record.name.toLowerCase().includes(searchTerm) || 
        (record.content && record.content.toLowerCase().includes(searchTerm))
      );
    }
    
    setFilteredRecords(filtered);
  }, [records, filters]);
  
  // Initial load
  useEffect(() => {
    loadRecords();
  }, [loadRecords]);
  
  // Monitor WebSocket events to update records
  useEffect(() => {
    const recordsUpdated = events['dns:records:updated'];
    const recordCreated = events['dns:record:created'];
    const recordUpdated = events['dns:record:updated'];
    const recordDeleted = events['dns:record:deleted'];
    
    if (recordsUpdated || recordCreated || recordUpdated || recordDeleted) {
      loadRecords();
    }
  }, [events, loadRecords]);
  
  return {
    records: filteredRecords,
    allRecords: records,
    loading,
    refreshing,
    error,
    filters,
    refresh,
    removeRecord,
    updateFilters
  };
};

export default useDnsRecords;