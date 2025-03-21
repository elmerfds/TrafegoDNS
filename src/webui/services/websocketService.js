// src/webui/services/websocketService.js
/**
 * WebSocket Service for TrafegoDNS Web UI
 * Provides real-time communication with the backend
 */

// Configure WebSocket URL based on current protocol and host
const getWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/api/ws`;
};

// State
let socket = null;
let connected = false;
let reconnectTimer = null;
let reconnectAttempt = 0;
let clientId = null;
let authenticated = false;
let reconnecting = false;

// Event callbacks
const eventListeners = new Map(); // Map of event type -> Set of listeners
const statusListeners = new Set();
const errorListeners = new Set();

// Reconnection settings
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]; // Increasing delays

/**
 * Initialize WebSocket connection
 */
function connect() {
  // Don't connect if already connected or reconnecting
  if (socket && (connected || reconnecting)) {
    return;
  }

  try {
    // Get the WebSocket URL dynamically
    const WS_URL = getWebSocketUrl();
    
    // Explicitly log the WS URL for debugging
    console.log('Connecting to WebSocket server at:', WS_URL);
    
    socket = new WebSocket(WS_URL);
    setupSocketListeners();
  } catch (error) {
    console.error('Failed to create WebSocket connection', error);
    notifyError({
      error: `Connection failed: ${error.message}`,
      fatal: true
    });
  }
}

/**
 * Set up WebSocket event listeners
 */
function setupSocketListeners() {
  if (!socket) return;

  socket.onopen = () => {
    // Reset reconnect attempts on successful connection
    reconnectAttempt = 0;
    connected = true;
    reconnecting = false;
    
    notifyStatusListeners({
      status: 'connected'
    });

    // Additional onopen logic
    console.log('WebSocket connection established');
    
    // Subscribe to events immediately upon connection
    subscribe(['dns:records:updated', 'dns:record:created', 'dns:record:updated', 'dns:record:deleted']);
  };

  socket.onclose = (event) => {
    connected = false;
    
    notifyStatusListeners({
      status: 'disconnected'
    });

    console.log('WebSocket connection closed:', event.code, event.reason);

    // Attempt to reconnect unless this was a clean close
    if (!event.wasClean) {
      startReconnect();
    }
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
    
    notifyError({
      error: 'Connection error',
      details: error,
      fatal: false
    });
  };

  socket.onmessage = (event) => {
    console.log('WebSocket message received:', event.data);
    handleMessage(event.data);
  };
}

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(data) {
  try {
    const message = JSON.parse(data);
    
    switch (message.type) {
      case 'welcome':
        handleWelcomeMessage(message);
        break;
        
      case 'event':
        handleEventMessage(message);
        break;
        
      case 'status':
        handleStatusMessage(message);
        break;
        
      case 'error':
        handleErrorMessage(message);
        break;
        
      case 'subscribed':
      case 'unsubscribed':
        // Just log these messages
        console.log(`WebSocket: ${message.type}`, message);
        break;
        
      default:
        console.log('Unhandled WebSocket message type', message);
    }
  } catch (error) {
    console.error('Error parsing WebSocket message', error, data);
  }
}

/**
 * Handle welcome messages (initial connection)
 */
function handleWelcomeMessage(message) {
  clientId = message.clientId;
  authenticated = message.authenticated;
  
  notifyStatusListeners({
    status: 'ready',
    clientId,
    authenticated
  });
  
  console.log(`WebSocket connection ready, client ID: ${clientId}`);
  
  // Subscribe to events
  subscribe(['dns:records:updated', 'dns:record:created', 'dns:record:updated', 'dns:record:deleted', 'status:update']);
}

/**
 * Handle event messages
 */
function handleEventMessage(message) {
  const eventType = message.eventType;
  console.log(`WebSocket event received: ${eventType}`, message.data);
  
  const listeners = eventListeners.get(eventType);
  
  if (listeners && listeners.size > 0) {
    listeners.forEach(listener => {
      try {
        listener(message.data);
      } catch (error) {
        console.error(`Error in event listener for ${eventType}`, error);
      }
    });
  }
}

/**
 * Handle status messages
 */
function handleStatusMessage(message) {
  console.log('WebSocket status update:', message.data);
  
  notifyStatusListeners({
    status: 'status_update',
    data: message.data
  });
}

/**
 * Handle error messages
 */
function handleErrorMessage(message) {
  console.error('WebSocket error message:', message);
  
  notifyError({
    error: message.message,
    details: message,
    fatal: false
  });
}

/**
 * Start the reconnection process
 */
function startReconnect() {
  if (reconnecting) return;
  
  reconnecting = true;
  const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
  
  notifyStatusListeners({
    status: 'reconnecting',
    attempt: reconnectAttempt + 1,
    delay
  });
  
  console.log(`WebSocket reconnecting in ${delay}ms (attempt ${reconnectAttempt + 1})`);
  
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectAttempt++;
    reconnecting = false;
    connect();
  }, delay);
}

/**
 * Disconnect from WebSocket server
 */
function disconnect() {
  if (socket) {
    clearTimeout(reconnectTimer);
    reconnecting = false;
    
    try {
      socket.close();
    } catch (error) {
      console.error('Error closing WebSocket', error);
    }
    
    socket = null;
    connected = false;
    
    notifyStatusListeners({
      status: 'disconnected'
    });
  }
}

/**
 * Send a message to the WebSocket server
 */
function sendMessage(type, data = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error('WebSocket not connected, cannot send message of type:', type);
    return false;
  }
  
  try {
    const message = {
      type,
      ...data,
      timestamp: new Date().toISOString()
    };
    
    console.log('Sending WebSocket message:', message);
    socket.send(JSON.stringify(message));
    return true;
  } catch (error) {
    console.error('Error sending WebSocket message', error);
    return false;
  }
}

/**
 * Subscribe to events
 */
function subscribe(events) {
  console.log('Subscribing to events:', events);
  return sendMessage('subscribe', { events });
}

/**
 * Unsubscribe from events
 */
function unsubscribe(events) {
  return sendMessage('unsubscribe', { events });
}

/**
 * Request a refresh of DNS records
 */
function requestRefresh() {
  console.log('Requesting DNS records refresh via WebSocket');
  return sendMessage('refresh');
}

/**
 * Add an event listener
 */
function addEventListener(eventType, listener) {
  if (!eventListeners.has(eventType)) {
    eventListeners.set(eventType, new Set());
  }
  
  eventListeners.get(eventType).add(listener);
  console.log(`Added event listener for ${eventType}`);
}

/**
 * Remove an event listener
 */
function removeEventListener(eventType, listener) {
  if (eventListeners.has(eventType)) {
    eventListeners.get(eventType).delete(listener);
  }
}

/**
 * Add a status listener
 */
function addStatusListener(listener) {
  statusListeners.add(listener);
}

/**
 * Remove a status listener
 */
function removeStatusListener(listener) {
  statusListeners.delete(listener);
}

/**
 * Add an error listener
 */
function addErrorListener(listener) {
  errorListeners.add(listener);
}

/**
 * Remove an error listener
 */
function removeErrorListener(listener) {
  errorListeners.delete(listener);
}

/**
 * Notify all status listeners
 */
function notifyStatusListeners(status) {
  statusListeners.forEach(listener => {
    try {
      listener(status);
    } catch (error) {
      console.error('Error in status listener', error);
    }
  });
}

/**
 * Notify all error listeners
 */
function notifyError(errorData) {
  errorListeners.forEach(listener => {
    try {
      listener(errorData);
    } catch (error) {
      console.error('Error in error listener', error);
    }
  });
}

// Initialize connection when service is loaded
connect();

// Export the WebSocket service API
export default {
  connect,
  disconnect,
  addEventListener,
  removeEventListener,
  addStatusListener,
  removeStatusListener,
  addErrorListener,
  removeErrorListener,
  requestRefresh,
  subscribe,
  unsubscribe
};