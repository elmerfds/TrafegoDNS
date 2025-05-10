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
      connectedAt: new Date()
    });
    
    // Client disconnection
    socket.on('disconnect', () => {
      logger.debug(`WebSocket client disconnected: ${socket.id}`);
      this.socketClients.delete(socket.id);
    });
    
    // Handle subscription to event types
    socket.on('subscribe', (eventType) => {
      if (this.isValidEventType(eventType)) {
        const client = this.socketClients.get(socket.id);
        client.subscriptions.add(eventType);
        logger.debug(`Client ${socket.id} subscribed to: ${eventType}`);
      } else {
        socket.emit('error', { message: `Invalid event type: ${eventType}` });
      }
    });
    
    // Handle unsubscription from event types
    socket.on('unsubscribe', (eventType) => {
      const client = this.socketClients.get(socket.id);
      client.subscriptions.delete(eventType);
      logger.debug(`Client ${socket.id} unsubscribed from: ${eventType}`);
    });
    
    // Send welcome message with basic status
    socket.emit('welcome', {
      message: 'Connected to TrafegoDNS WebSocket server',
      clientId: socket.id,
      timestamp: new Date().toISOString()
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
    
    // Send event to clients who are subscribed to this event type
    this.socketClients.forEach((client, socketId) => {
      if (client.subscriptions.has(eventType) || client.subscriptions.has('*')) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('event', { type: eventType, data });
          recipientCount++;
        }
      }
    });
    
    if (recipientCount > 0) {
      logger.debug(`Broadcasted ${eventType} event to ${recipientCount} clients`);
    }
  }
}

module.exports = SocketServer;