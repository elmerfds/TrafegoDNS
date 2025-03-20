// src/webui/hooks/useManagedHostnames.js
/**
 * React hook for managed hostnames integration
 */
import { useState, useEffect, useCallback } from 'react';
import { 
  fetchManagedHostnames, 
  addManagedHostname, 
  removeManagedHostname 
} from '../services/apiService';

/**
 * Custom hook for managed hostnames
 * @returns {Object} Managed hostnames state and handlers
 */
const useManagedHostnames = () => {
  const [hostnames, setHostnames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Load hostnames from API
  const loadHostnames = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchManagedHostnames();
      setHostnames(data?.hostnames || []);
    } catch (err) {
      console.error('Error loading managed hostnames:', err);
      setError('Failed to load managed hostnames. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Add hostname
  const addHostname = useCallback(async (hostnameData) => {
    try {
      setSubmitting(true);
      setError(null);
      
      // Validate required fields
      if (!hostnameData || !hostnameData.hostname || !hostnameData.type || !hostnameData.content) {
        setError('Hostname, type, and content are required');
        return false;
      }
      
      await addManagedHostname(hostnameData);
      
      // Refresh hostnames
      await loadHostnames();
      
      // Show success message
      setSuccess(`Hostname "${hostnameData.hostname}" has been added to the managed list`);
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
      
      return true;
    } catch (err) {
      console.error('Error adding hostname:', err);
      setError(err.response?.data?.error || 'Failed to add hostname. Please try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [loadHostnames]);
  
  // Remove hostname
  const removeHostname = useCallback(async (hostname) => {
    try {
      setSubmitting(true);
      setError(null);
      
      await removeManagedHostname(hostname);
      
      // Refresh hostnames
      await loadHostnames();
      
      // Show success message
      setSuccess(`Hostname "${hostname}" has been removed from the managed list`);
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
      
      return true;
    } catch (err) {
      console.error('Error removing hostname:', err);
      setError(err.response?.data?.error || 'Failed to remove hostname. Please try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [loadHostnames]);
  
  // Clear error message
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  // Clear success message
  const clearSuccess = useCallback(() => {
    setSuccess(null);
  }, []);
  
  // Initial load
  useEffect(() => {
    loadHostnames();
  }, [loadHostnames]);
  
  return {
    hostnames,
    loading,
    submitting,
    error,
    success,
    addHostname,
    removeHostname,
    clearError,
    clearSuccess,
    refresh: loadHostnames
  };
};

export default useManagedHostnames;