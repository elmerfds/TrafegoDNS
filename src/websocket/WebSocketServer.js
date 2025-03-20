// src/websocket/WebSocketServer.js
/**
 * WebSocket Server for TráfegoDNS
 * Provides real-time updates and bidirectional communication for the Web UI
 */
const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');

class WebSocketServer {
  /**
   * Create a new WebSocket server
   * @param {Object} config - EnhancedConfigManager instance
   * @param {Object} eventBus - EventBus instance
   * @param {Object} httpServer - HTTP server to attach to
   */
  constructor(config, eventBus, httpServer) {
    this.config = config;
    this.eventBus = eventBus;
    this.httpServer = httpServer;
    this.wss = null;
    this.clients = new Map(); // Map of clients with their auth status
    this.eventSubscribers = []; // List of event subscribers
    
    // Message handlers for different message types
    this.messageHandlers = {
      'subscribe': this.handleSubscribe.bind(this),
      'unsubscribe': this.handleUnsubscribe.bind(this),
      'refresh': this.handleRefresh.bind(this)
    };
    
    // Create bound event handlers
    this.boundHandlers = {};
  }
  
  /**
   * Initialize the WebSocket server
   */
  async init() {
    try {
      logger.debug('Initialising WebSocketServer...');
      
      // Create WebSocket server
      this.wss = new WebSocket.Server({ 
        noServer: true,
        clientTracking: true
      });
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Handle upgrade requests
      this.httpServer.on('upgrade', this.handleUpgrade.bind(this));
      
      logger.success('WebSocketServer initialised successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialise WebSocketServer: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Set up event listeners for WebSocket server
   */
  setupEventListeners() {
    // WebSocket connection events
    this.wss.on('connection', this.handleConnection.bind(this));
    
    // Subscribe to application events that should be sent to clients
    this.subscribeToEvents();
  }
  
  /**
   * Subscribe to application events
   */
  subscribeToEvents() {
    const eventsToSubscribe = [
      EventTypes.DNS_RECORDS_UPDATED,
      EventTypes.DNS_RECORD_CREATED,
      EventTypes.DNS_RECORD_UPDATED,
      EventTypes.DNS_RECORD_DELETED,
      EventTypes.TRAEFIK_POLL_COMPLETED,
      EventTypes.STATUS_UPDATE,
      EventTypes.OPERATION_MODE_CHANGED,
      EventTypes.DNS_PROVIDER_CHANGED
    ];
    
    for (const eventType of eventsToSubscribe) {
      // Create a bound handler for this event
      const boundHandler = (data) => {
        this.broadcastEvent(eventType, data);
      };
      
      // Store the bound handler for cleanup
      this.boundHandlers[eventType] = boundHandler;
      
      // Subscribe to the event
      this.eventBus.subscribe(eventType, boundHandler);
    }
  }
  
  /**
   * Handle upgrade request for WebSocket
   * @param {Object} request - HTTP request
   * @param {Object} socket - Network socket
   * @param {Buffer} head - First packet of the upgraded stream
   */
  handleUpgrade(request, socket, head) {
    // Parse URL to get pathname
    const pathname = url.parse(request.url).pathname;
    
    // Only handle WebSocket connections to /api/ws
    if (pathname === '/api/ws') {
      // Optional authentication can be handled here
      const isAuthenticated = this.authenticateRequest(request);
      
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        // Store authentication status with the client
        ws.isAuthenticated = isAuthenticated;
        
        // Emit connection event
        this.wss.emit('connection', ws, request);
      });
    }
  }
  
  /**
   * Authenticate WebSocket connection request
   * @param {Object} request - HTTP request
   * @returns {boolean} - True if authenticated
   */
  authenticateRequest(request) {
    // If authentication is enabled, check credentials
    if (process.env.WEB_UI_USERNAME && process.env.WEB_UI_PASSWORD) {
      const authHeader = request.headers['authorization'];
      
      if (!authHeader) {
        logger.debug('WebSocket connection attempt without authorization header');
        return false;
      }
      
      // Parse Basic auth header
      const authParts = authHeader.split(' ');
      if (authParts.length !== 2 || authParts[0] !== 'Basic') {
        logger.debug('WebSocket connection with invalid authorization header format');
        return false;
      }
      
      const authString = Buffer.from(authParts[1], 'base64').toString();
      const [username, password] = authString.split(':');
      
      // Check credentials
      const isValid = 
        username === process.env.WEB_UI_USERNAME && 
        password === process.env.WEB_UI_PASSWORD;
      
      if (!isValid) {
        logger.debug('WebSocket connection with invalid credentials');
      }
      
      return isValid;
    }
    
    // If no authentication required, allow all connections
    return true;
  }
  
  /**
   * Handle new WebSocket connection
   * @param {Object} ws - WebSocket client
   * @param {Object} request - HTTP request
   */
  handleConnection(ws, request) {
    // Generate a unique client ID
    const clientId = this.generateClientId();
    
    // Track the client
    this.clients.set(clientId, {
      ws,
      isAuthenticated: ws.isAuthenticated,
      subscriptions: new Set(),
      connectedAt: new Date()
    });
    
    logger.debug(`WebSocket client connected: ${clientId}`);
    
    // Send initial welcome message
    this.sendToClient(ws, {
      type: 'welcome',
      clientId,
      authenticated: ws.isAuthenticated,
      timestamp: new Date().toISOString()
    });
    
    // Set up event handlers for this connection
    ws.on('message', (message) => this.handleMessage(clientId, message));
    ws.on('close', () => this.handleClose(clientId));
    ws.on('error', (error) => this.handleError(clientId, error));
    
    // Send current status to the client
    this.sendCurrentStatus(ws);
  }
  
  /**
   * Handle incoming WebSocket message
   * @param {string} clientId - Client ID
   * @param {string} message - Message data
   */
  handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      logger.warn(`Received message from unknown client: ${clientId}`);
      return;
    }
    
    try {
      // Parse the JSON message
      const data = JSON.parse(message);
      
      // Check if the message has a valid type
      if (!data.type) {
        this.sendError(client.ws, 'Invalid message format: missing type');
        return;
      }
      
      // Handle message based on type
      const handler = this.messageHandlers[data.type];
      
      if (handler) {
        handler(clientId, data);
      } else {
        this.sendError(client.ws, `Unknown message type: ${data.type}`);
      }
    } catch (error) {
      logger.warn(`Error handling WebSocket message: ${error.message}`);
      this.sendError(client.ws, `Error processing message: ${error.message}`);
    }
  }
  
  /**
   * Handle subscription request
   * @param {string} clientId - Client ID
   * @param {Object} data - Message data
   */
  handleSubscribe(clientId, data) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      return;
    }
    
    // Check if the client is authenticated
    if (!client.isAuthenticated) {
      this.sendError(client.ws, 'Authentication required to subscribe to events');
      return;
    }
    
    // Check if events are specified
    if (!data.events || !Array.isArray(data.events) || data.events.length === 0) {
      this.sendError(client.ws, 'No events specified for subscription');
      return;
    }
    
    // Add events to client subscriptions
    for (const eventType of data.events) {
      // Only allow subscribing to valid event types
      if (Object.values(EventTypes).includes(eventType)) {
        client.subscriptions.add(eventType);
      }
    }
    
    logger.debug(`Client ${clientId} subscribed to events: ${Array.from(client.subscriptions).join(', ')}`);
    
    // Send confirmation
    this.sendToClient(client.ws, {
      type: 'subscribed',
      events: Array.from(client.subscriptions)
    });
  }
  
  /**
   * Handle unsubscribe request
   * @param {string} clientId - Client ID
   * @param {Object} data - Message data
   */
  handleUnsubscribe(clientId, data) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      return;
    }
    
    // Check if events are specified
    if (!data.events || !Array.isArray(data.events) || data.events.length === 0) {
      // Unsubscribe from all events
      client.subscriptions.clear();
    } else {
      // Unsubscribe from specified events
      for (const eventType of data.events) {
        client.subscriptions.delete(eventType);
      }
    }
    
    logger.debug(`Client ${clientId} unsubscribed from events`);
    
    // Send confirmation
    this.sendToClient(client.ws, {
      type: 'unsubscribed',
      events: Array.from(client.subscriptions)
    });
  }
  
  /**
   * Handle refresh request
   * @param {string} clientId - Client ID
   * @param {Object} data - Message data
   */
  handleRefresh(clientId, data) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      return;
    }
    
    // Check if the client is authenticated
    if (!client.isAuthenticated) {
      this.sendError(client.ws, 'Authentication required to trigger refresh');
      return;
    }
    
    logger.debug(`Client ${clientId} requested refresh`);
    
    // Trigger refresh based on mode
    if (this.config.operationMode === 'direct' && global.directDnsManager) {
      global.directDnsManager.pollContainers();
    } else if (global.traefikMonitor) {
      global.traefikMonitor.pollTraefikAPI();
    }
    
    // Send confirmation
    this.sendToClient(client.ws, {
      type: 'refreshing',
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Handle WebSocket connection close
   * @param {string} clientId - Client ID
   */
  handleClose(clientId) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      return;
    }
    
    // Remove client from tracked clients
    this.clients.delete(clientId);
    
    logger.debug(`WebSocket client disconnected: ${clientId}`);
  }
  
  /**
   * Handle WebSocket error
   * @param {string} clientId - Client ID
   * @param {Error} error - Error object
   */
  handleError(clientId, error) {
    logger.error(`WebSocket error for client ${clientId}: ${error.message}`);
  }
  
  /**
   * Send a message to a specific client
   * @param {Object} ws - WebSocket client
   * @param {Object} data - Message data
   */
  sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch (error) {
        logger.error(`Error sending message to WebSocket client: ${error.message}`);
      }
    }
  }
  
  /**
   * Send an error message to a client
   * @param {Object} ws - WebSocket client
   * @param {string} message - Error message
   */
  sendError(ws, message) {
    this.sendToClient(ws, {
      type: 'error',
      message,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Broadcast an event to all subscribed clients
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   */
  broadcastEvent(eventType, data) {
    // Prepare the message
    const message = {
      type: 'event',
      eventType,
      data,
      timestamp: new Date().toISOString()
    };
    
    // Track number of clients that received the message
    let sentCount = 0;
    
    // Send to all subscribed clients
    for (const [clientId, client] of this.clients.entries()) {
      // Skip clients that are not subscribed to this event
      if (!client.subscriptions.has(eventType)) {
        continue;
      }
      
      this.sendToClient(client.ws, message);
      sentCount++;
    }
    
    if (sentCount > 0) {
      logger.debug(`Broadcast ${eventType} event to ${sentCount} WebSocket clients`);
    }
  }
  
  /**
   * Send current system status to a client
   * @param {Object} ws - WebSocket client
   */
  async sendCurrentStatus(ws) {
    try {
      // Build a status object
      const status = {
        version: this.getVersion(),
        status: 'running',
        provider: this.config.dnsProvider,
        zone: this.config.getProviderDomain(),
        operationMode: this.config.operationMode,
        publicIp: this.config.getPublicIPSync(),
        publicIpv6: this.config.getPublicIPv6Sync(),
        cleanupEnabled: this.config.cleanupOrphaned
      };
      
      // Send status event
      this.sendToClient(ws, {
        type: 'status',
        data: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`Error sending status to WebSocket client: ${error.message}`);
    }
  }
  
  /**
   * Generate a unique client ID
   * @returns {string} - Unique client ID
   */
  generateClientId() {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get package version
   * @returns {string} - Package version
   */
  getVersion() {
    try {
      const packageJson = require('../../package.json');
      return packageJson.version || '1.0.0';
    } catch (error) {
      return '1.0.0';
    }
  }
  
  /**
   * Clean up resources and close connections
   */
  shutdown() {
    // Unsubscribe from all events
    for (const [eventType, handler] of Object.entries(this.boundHandlers)) {
      this.eventBus.unsubscribe(eventType, handler);
    }
    
    // Close all client connections
    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.ws.close();
      } catch (error) {
        logger.debug(`Error closing WebSocket for client ${clientId}: ${error.message}`);
      }
    }
    
    // Clear client tracking
    this.clients.clear();
    
    // Close the WebSocket server
    if (this.wss) {
      this.wss.close();
    }
    
    logger.debug('WebSocketServer shut down');
  }
}

module.exports = WebSocketServer;