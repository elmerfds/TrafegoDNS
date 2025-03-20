// src/webui/hooks/useWebSocket.js
/**
 * React hook for WebSocket integration
 * Provides real-time updates from the server
 */
import { useState, useEffect, useCallback } from 'react';
import websocketService from '../services/websocketService';

/**
 * Custom hook for WebSocket connectivity
 * @param {Array} subscribeToEvents - List of event types to subscribe to
 * @returns {Object} WebSocket connection state and handlers
 */
const useWebSocket = (subscribeToEvents = []) => {
  const [status, setStatus] = useState({
    connected: false,
    status: 'disconnected',
    clientId: null,
    authenticated: false,
    reconnecting: false,
    reconnectAttempt: 0,
    reconnectDelay: 0
  });
  
  const [error, setError] = useState(null);
  
  // Event listeners
  const [events, setEvents] = useState({});
  
  // Request a refresh of DNS records
  const requestRefresh = useCallback(() => {
    if (!status.connected) {
      return false;
    }
    
    return websocketService.requestRefresh();
  }, [status.connected]);
  
  // Add event listener for a specific event type
  const addEventListenerCallback = useCallback((eventType, listener) => {
    if (!eventType || !listener) return;
    
    websocketService.addEventListener(eventType, listener);
    
    // Return cleanup function
    return () => {
      websocketService.removeEventListener(eventType, listener);
    };
  }, []);
  
  // Connect to WebSocket
  const connect = useCallback(() => {
    websocketService.connect();
  }, []);
  
  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    websocketService.disconnect();
  }, []);
  
  // Handle WebSocket status updates
  useEffect(() => {
    const handleStatus = (statusUpdate) => {
      const newStatus = { ...status };
      
      switch (statusUpdate.status) {
        case 'connected':
          newStatus.connected = true;
          newStatus.status = 'connected';
          newStatus.reconnecting = false;
          setError(null);
          break;
          
        case 'disconnected':
          newStatus.connected = false;
          newStatus.status = 'disconnected';
          newStatus.clientId = null;
          newStatus.authenticated = false;
          break;
          
        case 'reconnecting':
          newStatus.connected = false;
          newStatus.status = 'reconnecting';
          newStatus.reconnecting = true;
          newStatus.reconnectAttempt = statusUpdate.attempt;
          newStatus.reconnectDelay = statusUpdate.delay;
          break;
          
        case 'ready':
          newStatus.connected = true;
          newStatus.status = 'ready';
          newStatus.clientId = statusUpdate.clientId;
          newStatus.authenticated = statusUpdate.authenticated;
          newStatus.reconnecting = false;
          setError(null);
          break;
          
        case 'status_update':
          // Just update events, don't change connection status
          setEvents(prev => ({
            ...prev,
            status: statusUpdate.data
          }));
          return;
      }
      
      setStatus(newStatus);
    };
    
    // Handle WebSocket errors
    const handleError = (errorData) => {
      setError(errorData.error);
      
      if (errorData.fatal) {
        setStatus(prev => ({
          ...prev,
          connected: false,
          status: 'error',
          reconnecting: false
        }));
      }
    };
    
    // Add status and error listeners
    websocketService.addStatusListener(handleStatus);
    websocketService.addErrorListener(handleError);
    
    // Connect to WebSocket
    websocketService.connect();
    
    // Cleanup function
    return () => {
      websocketService.removeStatusListener(handleStatus);
      websocketService.removeErrorListener(handleError);
    };
  }, []);
  
  // Add event listeners for requested events
  useEffect(() => {
    // Skip if no events to subscribe to
    if (!subscribeToEvents || subscribeToEvents.length === 0) {
      return;
    }
    
    // Add event listeners to the service for each event type
    const cleanupFunctions = subscribeToEvents.map(eventType => {
      // Create event handler
      const handleEvent = (data) => {
        setEvents(prev => ({
          ...prev,
          [eventType]: data
        }));
      };
      
      // Add event listener
      websocketService.addEventListener(eventType, handleEvent);
      
      // Return cleanup function
      return () => {
        websocketService.removeEventListener(eventType, handleEvent);
      };
    });
    
    // Return combined cleanup function
    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, [subscribeToEvents]);
  
  return {
    status,
    error,
    events,
    requestRefresh,
    addEventListener: addEventListenerCallback,
    connect,
    disconnect
  };
};

export default useWebSocket;