// src/webui/hooks/usePreservedHostnames.js
/**
 * React hook for preserved hostnames integration
 */
import { useState, useEffect, useCallback } from 'react';
import { 
  fetchPreservedHostnames, 
  addPreservedHostname, 
  removePreservedHostname 
} from '../services/apiService';

/**
 * Custom hook for preserved hostnames
 * @returns {Object} Preserved hostnames state and handlers
 */
const usePreservedHostnames = () => {
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
      
      const data = await fetchPreservedHostnames();
      // Ensure we have an array even if the API returns unexpected data
      const hostnames = Array.isArray(data?.hostnames) ? data.hostnames : [];
      setHostnames(hostnames);
    } catch (err) {
      console.error('Error loading preserved hostnames:', err);
      setError('Failed to load preserved hostnames. Please try again.');
      // Set empty array to prevent UI errors
      setHostnames([]);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Add hostname
  const addHostname = useCallback(async (hostname) => {
    try {
      setSubmitting(true);
      setError(null);
      
      // Validate hostname
      if (!hostname || !hostname.trim()) {
        setError('Hostname cannot be empty');
        return false;
      }
      
      await addPreservedHostname(hostname);
      
      // Refresh hostnames
      await loadHostnames();
      
      // Show success message
      setSuccess(`Hostname "${hostname}" has been added to the preserved list`);
      
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
      
      await removePreservedHostname(hostname);
      
      // Refresh hostnames
      await loadHostnames();
      
      // Show success message
      setSuccess(`Hostname "${hostname}" has been removed from the preserved list`);
      
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

export default usePreservedHostnames;