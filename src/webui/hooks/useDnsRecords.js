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
  const [lastRefresh, setLastRefresh] = useState(null);
  
  // Subscribe to DNS record events via WebSocket
  const { events, requestRefresh: wsRefresh, status: wsStatus } = useWebSocket([
    'dns:records:updated',
    'dns:record:created',
    'dns:record:updated',
    'dns:record:deleted'
  ]);
  
  // Load records from API
  const loadRecords = useCallback(async () => {
    try {
      console.log('Loading DNS records from API...');
      setLoading(true);
      setError(null);
      
      const data = await fetchRecords();
      console.log('DNS records loaded:', data);
      setRecords(data?.records || []);
      setLastRefresh(new Date());
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
      console.log('Refreshing DNS records...');
      setRefreshing(true);
      setError(null);
      
      // Try WebSocket refresh first
      let wsRefreshSuccess = false;
      if (wsStatus && wsStatus.connected) {
        console.log('Using WebSocket for refresh');
        wsRefreshSuccess = wsRefresh();
      }
      
      // Fall back to HTTP API if WebSocket is not connected
      if (!wsRefreshSuccess) {
        console.log('WebSocket refresh failed or not connected, using HTTP API');
        await triggerRefresh();
        await loadRecords();
      } else {
        console.log('WebSocket refresh request sent successfully');
      }
      
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error refreshing records:', err);
      setError('Failed to refresh records. Please try again.');
      
      // Try to load records directly if refresh failed
      try {
        await loadRecords();
      } catch (loadErr) {
        console.error('Failed to load records after refresh error:', loadErr);
      }
    } finally {
      setRefreshing(false);
    }
  }, [loadRecords, wsRefresh, wsStatus]);
  
  // Delete record
  const removeRecord = useCallback(async (recordId) => {
    try {
      setError(null);
      
      await deleteRecord(recordId);
      
      // Update local state
      setRecords(prev => prev.filter(record => record.id !== recordId));
      return true;
    } catch (err) {
      console.error('Error deleting record:', err);
      setError(err.response?.data?.error || 'Failed to delete record. Please try again.');
      return false;
    }
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
    console.log('Initial DNS records load');
    loadRecords();
  }, [loadRecords]);
  
  // Monitor WebSocket events to update records
  useEffect(() => {
    console.log('Checking WebSocket events for record updates:', events);
    const recordsUpdated = events['dns:records:updated'];
    const recordCreated = events['dns:record:created'];
    const recordUpdated = events['dns:record:updated'];
    const recordDeleted = events['dns:record:deleted'];
    
    if (recordsUpdated || recordCreated || recordUpdated || recordDeleted) {
      console.log('WebSocket event triggered records reload');
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
    lastRefresh,
    refresh,
    removeRecord,
    updateFilters
  };
};

export default useDnsRecords;