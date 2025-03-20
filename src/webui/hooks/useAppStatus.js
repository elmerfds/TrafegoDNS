// src/webui/hooks/useAppStatus.js
/**
 * React hook for application status
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchStatus, updateLogLevel, triggerRefresh } from '../services/apiService';
import useWebSocket from './useWebSocket';

/**
 * Custom hook for application status
 * @returns {Object} Application status state and handlers
 */
const useAppStatus = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  // Subscribe to status events via WebSocket
  const { events, requestRefresh: wsRefresh } = useWebSocket([
    'status:update',
    'operation_mode:changed',
    'dns:provider:changed'
  ]);
  
  // Load status from API
  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchStatus();
      setStatus(data);
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
      setRefreshing(true);
      setError(null);
      
      // Try WebSocket refresh first
      const wsRefreshSuccess = wsRefresh();
      
      // Fall back to HTTP API if WebSocket is not connected
      if (!wsRefreshSuccess) {
        await triggerRefresh();
        await loadStatus();
      }
    } catch (err) {
      console.error('Error refreshing status:', err);
      setError('Failed to refresh status. Please try again.');
      
      // Try to load status directly if refresh failed
      loadStatus();
    } finally {
      setRefreshing(false);
    }
  }, [loadStatus, wsRefresh]);
  
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
    loadStatus();
  }, [loadStatus]);
  
  // Monitor WebSocket events to update status
  useEffect(() => {
    const statusUpdate = events['status:update'];
    const modeChanged = events['operation_mode:changed'];
    const providerChanged = events['dns:provider:changed'];
    
    if (statusUpdate || modeChanged || providerChanged) {
      loadStatus();
    }
  }, [events, loadStatus]);
  
  return {
    status,
    loading,
    refreshing,
    error,
    refresh,
    setLogLevel
  };
};

export default useAppStatus;