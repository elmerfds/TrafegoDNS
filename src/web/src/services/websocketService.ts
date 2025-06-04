/**
 * WebSocket Service
 * Bridges WebSocket events with the port store for real-time updates
 */

import { usePortStore } from '../store/portStore';
import type { Port, PortAlert, PortScan, PortReservation } from '../types/port';
import type { Socket } from 'socket.io-client';

/**
 * WebSocket event types for port management
 */
export const WEBSOCKET_EVENTS = {
  // Port events
  PORT_CHANGED: 'port:changed',
  PORT_DISCOVERED: 'port:discovered',
  PORT_CLOSED: 'port:closed',
  
  // Alert events
  PORT_ALERT_CREATED: 'port:alert:created',
  PORT_ALERT_ACKNOWLEDGED: 'port:alert:acknowledged',
  PORT_ALERT_RESOLVED: 'port:alert:resolved',
  
  // Scan events
  PORT_SCAN_STARTED: 'port:scan:started',
  PORT_SCAN_COMPLETED: 'port:scan:completed',
  PORT_SCAN_FAILED: 'port:scan:failed',
  PORT_SCAN_PROGRESS: 'port:scan:progress',
  
  // Reservation events
  PORT_RESERVED: 'port:reserved',
  PORT_RELEASED: 'port:released',
  RESERVATION_EXPIRED: 'port:reservation:expired',
  
  // Conflict events
  PORT_CONFLICT_DETECTED: 'port:conflict:detected',
  PORT_CONFLICT_RESOLVED: 'port:conflict:resolved',
  
  // Statistics events
  PORT_STATISTICS_UPDATED: 'port:statistics:updated',
  
  // Server events
  SERVER_ADDED: 'server:added',
  SERVER_REMOVED: 'server:removed',
  SERVER_UPDATED: 'server:updated'
} as const;

/**
 * Event data interfaces
 */
interface PortEvent {
  type: string;
  data: any;
  timestamp: string;
  source?: string;
}

interface ScanProgressEvent {
  scanId: string;
  progress: number;
  totalPorts: number;
  scannedPorts: number;
  currentPort?: number;
  estimatedTimeRemaining?: number;
}

/**
 * WebSocket Service Class
 * Manages real-time updates between WebSocket and port store
 */
export class WebSocketService {
  private socket: Socket | null = null;
  private eventBatching: {
    enabled: boolean;
    batchSize: number;
    batchTimeout: number;
    pendingEvents: PortEvent[];
    timeoutId: NodeJS.Timeout | null;
  } = {
    enabled: true,
    batchSize: 10,
    batchTimeout: 100, // 100ms batching window
    pendingEvents: [],
    timeoutId: null
  };
  
  private subscriptions: Set<string> = new Set();
  private reconnectionConfig = {
    maxAttempts: 10,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 1.5,
    currentAttempts: 0
  };

  /**
   * Initialize the WebSocket service
   * @param socket - Socket.IO client instance
   */
  initialize(socket: Socket): void {
    this.socket = socket;
    this.setupEventListeners();
    this.subscribeToPortEvents();
  }

  /**
   * Setup core WebSocket event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Handle incoming events
    this.socket.on('event', this.handleIncomingEvent.bind(this));
    
    // Connection events
    this.socket.on('connect', this.handleConnect.bind(this));
    this.socket.on('disconnect', this.handleDisconnect.bind(this));
    this.socket.on('connect_error', this.handleConnectionError.bind(this));
    
    // Subscription events
    this.socket.on('subscribed', this.handleSubscribed.bind(this));
    this.socket.on('unsubscribed', this.handleUnsubscribed.bind(this));
    this.socket.on('subscription_error', this.handleSubscriptionError.bind(this));
  }

  /**
   * Subscribe to all port-related events
   */
  private subscribeToPortEvents(): void {
    if (!this.socket) return;

    const portEvents = Object.values(WEBSOCKET_EVENTS);
    
    portEvents.forEach(eventType => {
      this.subscribe(eventType);
    });
  }

  /**
   * Subscribe to a specific event type
   * @param eventType - Event type to subscribe to
   */
  public subscribe(eventType: string): void {
    if (!this.socket) {
      console.warn('Cannot subscribe: WebSocket not initialized');
      return;
    }

    if (this.subscriptions.has(eventType)) {
      return; // Already subscribed
    }

    this.socket.emit('subscribe', eventType);
    this.subscriptions.add(eventType);
    console.debug(`Subscribed to: ${eventType}`);
  }

  /**
   * Unsubscribe from a specific event type
   * @param eventType - Event type to unsubscribe from
   */
  public unsubscribe(eventType: string): void {
    if (!this.socket) return;

    this.socket.emit('unsubscribe', eventType);
    this.subscriptions.delete(eventType);
    console.debug(`Unsubscribed from: ${eventType}`);
  }

  /**
   * Handle incoming WebSocket events
   * @param event - Incoming event data
   */
  private handleIncomingEvent(event: PortEvent): void {
    if (!event || !event.type) {
      console.warn('Received invalid event:', event);
      return;
    }

    // Add to batch if batching is enabled
    if (this.eventBatching.enabled) {
      this.addToBatch(event);
    } else {
      this.processEvent(event);
    }
  }

  /**
   * Add event to processing batch
   * @param event - Event to batch
   */
  private addToBatch(event: PortEvent): void {
    this.eventBatching.pendingEvents.push(event);

    // Clear existing timeout
    if (this.eventBatching.timeoutId) {
      clearTimeout(this.eventBatching.timeoutId);
    }

    // Process batch if it's full or set timeout
    if (this.eventBatching.pendingEvents.length >= this.eventBatching.batchSize) {
      this.processBatch();
    } else {
      this.eventBatching.timeoutId = setTimeout(() => {
        this.processBatch();
      }, this.eventBatching.batchTimeout);
    }
  }

  /**
   * Process all events in the current batch
   */
  private processBatch(): void {
    if (this.eventBatching.pendingEvents.length === 0) return;

    const events = [...this.eventBatching.pendingEvents];
    this.eventBatching.pendingEvents = [];
    
    if (this.eventBatching.timeoutId) {
      clearTimeout(this.eventBatching.timeoutId);
      this.eventBatching.timeoutId = null;
    }

    // Group events by type for more efficient processing
    const eventGroups = events.reduce((groups, event) => {
      if (!groups[event.type]) {
        groups[event.type] = [];
      }
      groups[event.type].push(event);
      return groups;
    }, {} as Record<string, PortEvent[]>);

    // Process each group
    Object.entries(eventGroups).forEach(([type, typeEvents]) => {
      this.processEventGroup(type, typeEvents);
    });
  }

  /**
   * Process a group of events of the same type
   * @param type - Event type
   * @param events - Events of this type
   */
  private processEventGroup(type: string, events: PortEvent[]): void {
    // For some event types, we only need the latest event
    const latestOnlyEvents = [
      WEBSOCKET_EVENTS.PORT_STATISTICS_UPDATED,
      WEBSOCKET_EVENTS.PORT_SCAN_PROGRESS
    ];

    if (latestOnlyEvents.includes(type as any)) {
      // Only process the latest event for these types
      const latestEvent = events[events.length - 1];
      this.processEvent(latestEvent);
    } else {
      // Process all events for other types
      events.forEach(event => this.processEvent(event));
    }
  }

  /**
   * Process a single event and update the store
   * @param event - Event to process
   */
  private processEvent(event: PortEvent): void {
    const store = usePortStore.getState();

    try {
      switch (event.type) {
        case WEBSOCKET_EVENTS.PORT_CHANGED:
        case WEBSOCKET_EVENTS.PORT_DISCOVERED:
          if (event.data && this.isValidPort(event.data)) {
            store.handlePortUpdate(event.data as Port);
          }
          break;

        case WEBSOCKET_EVENTS.PORT_ALERT_CREATED:
        case WEBSOCKET_EVENTS.PORT_ALERT_ACKNOWLEDGED:
        case WEBSOCKET_EVENTS.PORT_ALERT_RESOLVED:
          if (event.data && this.isValidAlert(event.data)) {
            store.handleAlertUpdate(event.data as PortAlert);
          }
          break;

        case WEBSOCKET_EVENTS.PORT_SCAN_STARTED:
        case WEBSOCKET_EVENTS.PORT_SCAN_COMPLETED:
        case WEBSOCKET_EVENTS.PORT_SCAN_FAILED:
          if (event.data && this.isValidScan(event.data)) {
            store.handleScanUpdate(event.data as PortScan);
          }
          break;

        case WEBSOCKET_EVENTS.PORT_SCAN_PROGRESS:
          this.handleScanProgress(event.data as ScanProgressEvent);
          break;

        case WEBSOCKET_EVENTS.PORT_RESERVED:
        case WEBSOCKET_EVENTS.PORT_RELEASED:
        case WEBSOCKET_EVENTS.RESERVATION_EXPIRED:
          if (event.data && this.isValidReservation(event.data)) {
            store.handleReservationUpdate(event.data as PortReservation);
          }
          break;

        case WEBSOCKET_EVENTS.PORT_STATISTICS_UPDATED:
          if (event.data) {
            // Update statistics in store
            store.fetchStatistics();
          }
          break;

        case WEBSOCKET_EVENTS.PORT_CONFLICT_DETECTED:
        case WEBSOCKET_EVENTS.PORT_CONFLICT_RESOLVED:
          this.handleConflictEvent(event);
          break;

        case WEBSOCKET_EVENTS.SERVER_ADDED:
        case WEBSOCKET_EVENTS.SERVER_REMOVED:
        case WEBSOCKET_EVENTS.SERVER_UPDATED:
          // Refresh servers list
          store.fetchServers();
          break;

        default:
          console.debug(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error(`Error processing event ${event.type}:`, error);
    }
  }

  /**
   * Handle scan progress events
   * @param progressData - Scan progress data
   */
  private handleScanProgress(progressData: ScanProgressEvent): void {
    // Could emit to a scan progress store or update UI directly
    // For now, log the progress
    console.debug(`Scan progress: ${progressData.progress}% (${progressData.scannedPorts}/${progressData.totalPorts})`);
  }

  /**
   * Handle port conflict events
   * @param event - Conflict event
   */
  private handleConflictEvent(event: PortEvent): void {
    // Could show toast notifications or update conflict state
    console.info(`Port conflict ${event.type === WEBSOCKET_EVENTS.PORT_CONFLICT_DETECTED ? 'detected' : 'resolved'}:`, event.data);
  }

  /**
   * Connection event handlers
   */
  private handleConnect(): void {
    console.info('WebSocket connected');
    this.reconnectionConfig.currentAttempts = 0;
    
    // Resubscribe to events after reconnection
    this.resubscribeAfterReconnection();
  }

  private handleDisconnect(reason: string): void {
    console.warn('WebSocket disconnected:', reason);
    
    // Clear any pending batches
    if (this.eventBatching.timeoutId) {
      clearTimeout(this.eventBatching.timeoutId);
      this.eventBatching.timeoutId = null;
    }
    this.eventBatching.pendingEvents = [];
  }

  private handleConnectionError(error: any): void {
    console.error('WebSocket connection error:', error);
    this.reconnectionConfig.currentAttempts++;
  }

  /**
   * Resubscribe to all events after reconnection
   */
  private resubscribeAfterReconnection(): void {
    const subscriptions = Array.from(this.subscriptions);
    this.subscriptions.clear();
    
    subscriptions.forEach(eventType => {
      this.subscribe(eventType);
    });
  }

  /**
   * Subscription event handlers
   */
  private handleSubscribed(data: { eventType: string }): void {
    console.debug(`Successfully subscribed to: ${data.eventType}`);
  }

  private handleUnsubscribed(data: { eventType: string }): void {
    console.debug(`Successfully unsubscribed from: ${data.eventType}`);
  }

  private handleSubscriptionError(data: { eventType: string; error: string }): void {
    console.error(`Subscription error for ${data.eventType}:`, data.error);
    this.subscriptions.delete(data.eventType);
  }

  /**
   * Data validation methods
   */
  private isValidPort(data: any): boolean {
    return data && typeof data.id === 'string' && typeof data.port === 'number';
  }

  private isValidAlert(data: any): boolean {
    return data && typeof data.id === 'string' && typeof data.port === 'number';
  }

  private isValidScan(data: any): boolean {
    return data && typeof data.id === 'string' && data.status;
  }

  private isValidReservation(data: any): boolean {
    return data && typeof data.id === 'string' && typeof data.port === 'number';
  }

  /**
   * Cleanup method
   */
  public cleanup(): void {
    if (this.eventBatching.timeoutId) {
      clearTimeout(this.eventBatching.timeoutId);
    }
    
    this.eventBatching.pendingEvents = [];
    this.subscriptions.clear();
    
    if (this.socket) {
      this.socket.off('event');
      this.socket.off('connect');
      this.socket.off('disconnect');
      this.socket.off('connect_error');
      this.socket = null;
    }
  }
}

// Export singleton instance
export const webSocketService = new WebSocketService();
export default webSocketService;