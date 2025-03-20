// src/webui/hooks/useAppStatus.js
/**
 * React hook for application status
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchStatus, fetchRecords, updateLogLevel, triggerRefresh } from '../services/apiService';
import useWebSocket from './useWebSocket';

/**
 * Custom hook for application status
 * @returns {Object} Application status state and handlers
 */
const useAppStatus = () => {
  const [status, setStatus] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  
  // Subscribe to status events via WebSocket
  const { events, requestRefresh: wsRefresh, status: wsStatus } = useWebSocket([
    'status:update',
    'operation_mode:changed',
    'dns:provider:changed',
    'dns:records:updated'
  ]);
  
  // Load status from API
  const loadStatus = useCallback(async () => {
    try {
      console.log('Loading application status...');
      setLoading(true);
      setError(null);
      
      const data = await fetchStatus();
      console.log('Status loaded:', data);
      setStatus(data);
      
      // Also load records data
      try {
        const recordsData = await fetchRecords();
        console.log('Records loaded:', recordsData);
        setRecords(recordsData?.records || []);
      } catch (recordsErr) {
        console.error('Error loading records:', recordsErr);
      }
      
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error loading application status:', err);
      setError('Failed to load application status. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Refresh status
  const refresh = useCallback(async () => {
    try {
      console.log('Refreshing application status...');
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
        await loadStatus();
      } else {
        console.log('WebSocket refresh request sent successfully');
      }
      
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error refreshing status:', err);
      setError('Failed to refresh status. Please try again.');
      
      // Try to load status directly if refresh failed
      loadStatus();
    } finally {
      setRefreshing(false);
    }
  }, [loadStatus, wsRefresh, wsStatus]);
  
  // Update log level
  const setLogLevel = useCallback(async (level) => {
    try {
      setError(null);
      
      await updateLogLevel(level);
      
      // Refresh status
      await loadStatus();
      
      return true;
    } catch (err) {
      console.error('Error updating log level:', err);
      setError(err.response?.data?.error || 'Failed to update log level. Please try again.');
      return false;
    }
  }, [loadStatus]);
  
  // Initial load
  useEffect(() => {
    console.log('Initial application status load');
    loadStatus();
  }, [loadStatus]);
  
  // Monitor WebSocket events to update status
  useEffect(() => {
    console.log('Checking WebSocket events for status updates:', events);
    
    const statusUpdate = events['status:update'];
    const modeChanged = events['operation_mode:changed'];
    const providerChanged = events['dns:provider:changed'];
    const recordsUpdated = events['dns:records:updated'];
    
    if (statusUpdate || modeChanged || providerChanged || recordsUpdated) {
      console.log('WebSocket event triggered status reload');
      loadStatus();
    }
  }, [events, loadStatus]);
  
  return {
    status,
    records,
    loading,
    refreshing,
    error,
    lastRefresh,
    refresh,
    setLogLevel
  };
};

export default useAppStatus;