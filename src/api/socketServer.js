/**
 * Socket.IO Server for Real-Time Updates
 * Provides WebSocket support for live data
 */
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');

class SocketServer {
  constructor(httpServer, eventBus, config) {
    this.io = socketIO(httpServer, {
      cors: {
        origin: process.env.CORS_ALLOWED_ORIGINS || config?.corsAllowedOrigins || '*',
        methods: ['GET', 'POST'],
        credentials: true
      }
    });
    
    this.eventBus = eventBus;
    this.config = config;
    this.socketClients = new Map();
    
    // Initialize Socket.IO server
    this.init();
  }
  
  /**
   * Initialize the Socket.IO server
   */
  init() {
    // Authentication middleware
    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        
        if (!token) {
          return next(new Error('Authentication error: Token not provided'));
        }
        
        // Verify token (if using JWT)
        jwt.verify(token, process.env.JWT_SECRET || this.config.jwtSecret, (err, decoded) => {
          if (err) {
            return next(new Error('Authentication error: Invalid token'));
          }
          
          // Store user data with socket
          socket.user = decoded;
          next();
        });
      } catch (error) {
        logger.error(`Socket authentication error: ${error.message}`);
        next(new Error('Authentication error'));
      }
    });
    
    // Connection event
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
    
    // Subscribe to application events
    this.setupEventSubscriptions();
    
    logger.info('WebSocket server initialized for real-time updates');
  }
  
  /**
   * Handle new socket connections
   * @param {Object} socket - Socket.IO socket
   */
  handleConnection(socket) {
    const userId = socket.user?.id || 'anonymous';
    logger.debug(`WebSocket client connected: ${socket.id} (User: ${userId})`);
    
    // Store client information
    this.socketClients.set(socket.id, {
      id: socket.id,
      userId,
      subscriptions: new Set(),
      connectedAt: new Date(),
      lastPing: null,
      latency: null,
      eventQueue: [],
      batchTimeout: null
    });
    
    // Client disconnection
    socket.on('disconnect', () => {
      logger.debug(`WebSocket client disconnected: ${socket.id}`);
      const client = this.socketClients.get(socket.id);
      if (client && client.batchTimeout) {
        clearTimeout(client.batchTimeout);
      }
      this.socketClients.delete(socket.id);
    });
    
    // Handle subscription to event types
    socket.on('subscribe', (eventType) => {
      if (this.isValidEventType(eventType)) {
        const client = this.socketClients.get(socket.id);
        client.subscriptions.add(eventType);
        logger.debug(`Client ${socket.id} subscribed to: ${eventType}`);
        
        // Send subscription confirmation
        socket.emit('subscribed', { eventType });
      } else {
        const errorMsg = `Invalid event type: ${eventType}`;
        logger.warn(`Subscription error for client ${socket.id}: ${errorMsg}`);
        socket.emit('subscription_error', { eventType, error: errorMsg });
      }
    });
    
    // Handle unsubscription from event types
    socket.on('unsubscribe', (eventType) => {
      const client = this.socketClients.get(socket.id);
      if (client) {
        client.subscriptions.delete(eventType);
        logger.debug(`Client ${socket.id} unsubscribed from: ${eventType}`);
        
        // Send unsubscription confirmation
        socket.emit('unsubscribed', { eventType });
      }
    });

    // Handle ping for latency measurement
    socket.on('ping', (data) => {
      const client = this.socketClients.get(socket.id);
      if (client) {
        client.lastPing = Date.now();
        // Echo back the ping data for latency calculation
        socket.emit('pong', data);
      }
    });

    // Handle client-side pong responses (if we want to measure from server side)
    socket.on('pong', (data) => {
      const client = this.socketClients.get(socket.id);
      if (client && client.lastPing) {
        client.latency = Date.now() - client.lastPing;
        logger.debug(`Client ${socket.id} latency: ${client.latency}ms`);
      }
    });
    
    // Send welcome message with basic status
    socket.emit('welcome', {
      message: 'Connected to TrafegoDNS WebSocket server',
      clientId: socket.id,
      timestamp: new Date().toISOString()
    });
    
    // Handle log subscription
    socket.on('subscribe:logs', (options = {}) => {
      const client = this.socketClients.get(socket.id);
      if (client) {
        client.subscribedToLogs = true;
        client.logLevel = options.level || 'info';
        socket.join('log-subscribers');
        logger.debug(`Client ${socket.id} subscribed to logs (level: ${client.logLevel})`);
      }
    });
    
    // Handle log unsubscription
    socket.on('unsubscribe:logs', () => {
      const client = this.socketClients.get(socket.id);
      if (client) {
        client.subscribedToLogs = false;
        socket.leave('log-subscribers');
        logger.debug(`Client ${socket.id} unsubscribed from logs`);
      }
    });
  }
  
  /**
   * Check if an event type is valid
   * @param {string} eventType - Event type to validate
   * @returns {boolean} Whether the event type is valid
   */
  isValidEventType(eventType) {
    return Object.values(EventTypes).includes(eventType);
  }
  
  /**
   * Subscribe to application events
   */
  setupEventSubscriptions() {
    // DNS Events
    this.subscribeToEvent(EventTypes.DNS_RECORDS_UPDATED);
    this.subscribeToEvent(EventTypes.DNS_RECORD_CREATED);
    this.subscribeToEvent(EventTypes.DNS_RECORD_UPDATED);
    this.subscribeToEvent(EventTypes.DNS_RECORD_DELETED);
    
    // Docker Events
    this.subscribeToEvent(EventTypes.CONTAINER_STARTED);
    this.subscribeToEvent(EventTypes.CONTAINER_STOPPED);
    this.subscribeToEvent(EventTypes.CONTAINER_DESTROYED);
    
    // Status Events
    this.subscribeToEvent(EventTypes.STATUS_UPDATE);
    
    // Port Monitoring Events
    this.subscribeToEvent(EventTypes.PORT_SCAN_STARTED);
    this.subscribeToEvent(EventTypes.PORT_SCAN_COMPLETED);
    this.subscribeToEvent(EventTypes.PORT_SCAN_FAILED);
    this.subscribeToEvent(EventTypes.PORT_CHANGED);
    this.subscribeToEvent(EventTypes.PORT_DISCOVERED);
    this.subscribeToEvent(EventTypes.PORT_CLOSED);
    this.subscribeToEvent(EventTypes.PORT_ALERT_CREATED);
    this.subscribeToEvent(EventTypes.PORT_ALERT_ACKNOWLEDGED);
    this.subscribeToEvent(EventTypes.PORT_RESERVED);
    this.subscribeToEvent(EventTypes.PORT_RELEASED);
    this.subscribeToEvent(EventTypes.PORT_CONFLICT_DETECTED);
    this.subscribeToEvent(EventTypes.PORT_CONFLICT_RESOLVED);
    
    logger.debug('Socket server subscribed to application events');
  }
  
  /**
   * Subscribe to a specific event type
   * @param {string} eventType - Event type to subscribe to
   */
  subscribeToEvent(eventType) {
    this.eventBus.subscribe(eventType, (data) => {
      this.broadcastEvent(eventType, data);
    });
  }
  
  /**
   * Broadcast an event to subscribed clients
   * @param {string} eventType - Event type to broadcast
   * @param {Object} data - Event data
   */
  broadcastEvent(eventType, data) {
    let recipientCount = 0;
    const eventData = { 
      type: eventType, 
      data, 
      timestamp: new Date().toISOString() 
    };
    
    // Send event to clients who are subscribed to this event type
    this.socketClients.forEach((client, socketId) => {
      if (client.subscriptions.has(eventType) || client.subscriptions.has('*')) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          // Check if we should batch events or send immediately
          if (this.shouldBatchEvent(eventType)) {
            this.addToEventBatch(client, eventData);
          } else {
            socket.emit('event', eventData);
          }
          recipientCount++;
        }
      }
    });
    
    if (recipientCount > 0) {
      logger.debug(`Broadcasted ${eventType} event to ${recipientCount} clients`);
    }
  }

  /**
   * Check if an event type should be batched
   * @param {string} eventType - Event type to check
   * @returns {boolean} Whether to batch this event type
   */
  shouldBatchEvent(eventType) {
    // Batch high-frequency events like port changes and scan progress
    const batchableEvents = [
      'port:changed',
      'port:scan:progress',
      'port:statistics:updated'
    ];
    
    return batchableEvents.includes(eventType);
  }

  /**
   * Add event to client's batch queue
   * @param {Object} client - Client object
   * @param {Object} eventData - Event data to batch
   */
  addToEventBatch(client, eventData) {
    client.eventQueue.push(eventData);
    
    // Clear existing timeout
    if (client.batchTimeout) {
      clearTimeout(client.batchTimeout);
    }
    
    // Set new timeout or process immediately if batch is full
    const batchSize = 10;
    const batchDelay = 100; // 100ms
    
    if (client.eventQueue.length >= batchSize) {
      this.processBatch(client);
    } else {
      client.batchTimeout = setTimeout(() => {
        this.processBatch(client);
      }, batchDelay);
    }
  }

  /**
   * Process and send batched events for a client
   * @param {Object} client - Client object
   */
  processBatch(client) {
    if (client.eventQueue.length === 0) return;
    
    const socket = this.io.sockets.sockets.get(client.id);
    if (!socket) return;
    
    // Group events by type for deduplication
    const eventGroups = {};
    client.eventQueue.forEach(event => {
      if (!eventGroups[event.type]) {
        eventGroups[event.type] = [];
      }
      eventGroups[event.type].push(event);
    });
    
    // For some event types, only send the latest event
    const latestOnlyEvents = ['port:statistics:updated'];
    
    Object.entries(eventGroups).forEach(([type, events]) => {
      if (latestOnlyEvents.includes(type)) {
        // Only send the most recent event
        const latestEvent = events[events.length - 1];
        socket.emit('event', latestEvent);
      } else {
        // Send all events
        events.forEach(event => socket.emit('event', event));
      }
    });
    
    // Clear the queue and timeout
    client.eventQueue = [];
    if (client.batchTimeout) {
      clearTimeout(client.batchTimeout);
      client.batchTimeout = null;
    }
  }
  
  /**
   * Broadcast a log message to subscribed clients
   * @param {Object} logData - Log data to broadcast
   */
  broadcastLog(logData) {
    const logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };
    
    this.io.to('log-subscribers').emit('log', {
      timestamp: new Date().toISOString(),
      ...logData
    });
  }
}

module.exports = SocketServer;