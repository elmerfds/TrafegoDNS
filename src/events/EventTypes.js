/**
 * Event type constants for application-wide events
 */
module.exports = {
    // System events
    SYSTEM_STARTUP: 'system:startup',
    SYSTEM_SHUTDOWN: 'system:shutdown',

    // State events
    STATE_CHANGED: 'state:changed',

    // Action events
    ACTION_COMPLETED: 'action:completed',
    ACTION_ERROR: 'action:error',

    // Config events
    CONFIG_UPDATED: 'config:updated',
    CONFIG_INITIALIZED: 'config:initialized',
    CONFIG_MODE_CHANGED: 'config:mode:changed',
    IP_UPDATED: 'ip:updated',

    // Traefik events
    TRAEFIK_POLL_STARTED: 'traefik:poll:started',
    TRAEFIK_POLL_COMPLETED: 'traefik:poll:completed',
    TRAEFIK_ROUTERS_UPDATED: 'traefik:routers:updated',

    // Docker events
    DOCKER_CONTAINER_STARTED: 'docker:container:started',
    DOCKER_CONTAINER_STOPPED: 'docker:container:stopped',
    DOCKER_LABELS_UPDATED: 'docker:labels:updated',
    DOCKER_EVENTS_DISCONNECTED: 'docker:events:disconnected',

    // Container events (DockerMonitor uses these)
    CONTAINER_STARTED: 'container:started',
    CONTAINER_STOPPED: 'container:stopped',
    CONTAINER_DESTROYED: 'container:destroyed',
    CONTAINER_UPDATED: 'container:updated',
    CONTAINERS_LOADED: 'containers:loaded',

    // DNS events
    DNS_RECORDS_UPDATED: 'dns:records:updated',
    DNS_RECORDS_LOADED: 'dns:records:loaded',
    DNS_RECORDS_REFRESHED: 'dns:records:refreshed',
    DNS_RECORD_CREATED: 'dns:record:created',
    DNS_RECORD_UPDATED: 'dns:record:updated',
    DNS_RECORD_DELETED: 'dns:record:deleted',
    DNS_CACHE_REFRESHED: 'dns:cache:refreshed',
    DNS_ORPHANED_UPDATED: 'dns:orphaned:updated',
    DNS_PRESERVED_UPDATED: 'dns:preserved:updated',
    DNS_MANAGED_UPDATED: 'dns:managed:updated',

    // User events
    USER_CREATED: 'user:created',
    USER_UPDATED: 'user:updated',
    USER_DELETED: 'user:deleted',
    USER_LOGIN: 'user:login',
    USER_LOGOUT: 'user:logout',

    // Web socket events
    SOCKET_CONNECTED: 'socket:connected',
    SOCKET_DISCONNECTED: 'socket:disconnected',
    SOCKET_ERROR: 'socket:error',

    // API events
    API_REQUEST: 'api:request',
    API_RESPONSE: 'api:response',
    API_ERROR: 'api:error',

    // Port monitoring events
    PORT_SCAN_STARTED: 'port:scan:started',
    PORT_SCAN_COMPLETED: 'port:scan:completed',
    PORT_SCAN_FAILED: 'port:scan:failed',
    PORT_SCAN_PROGRESS: 'port:scan:progress',
    PORT_CHANGED: 'port:changed',
    PORT_DISCOVERED: 'port:discovered',
    PORT_CLOSED: 'port:closed',
    PORT_ALERT_CREATED: 'port:alert:created',
    PORT_ALERT_ACKNOWLEDGED: 'port:alert:acknowledged',
    PORT_ALERT_RESOLVED: 'port:alert:resolved',
    PORT_RESERVED: 'port:reserved',
    PORT_RELEASED: 'port:released',
    PORT_RESERVATION_EXPIRED: 'port:reservation:expired',
    PORT_CONFLICT_DETECTED: 'port:conflict:detected',
    PORT_CONFLICT_RESOLVED: 'port:conflict:resolved',
    PORT_STATISTICS_UPDATED: 'port:statistics:updated',
    
    // Server management events
    SERVER_ADDED: 'server:added',
    SERVER_REMOVED: 'server:removed',
    SERVER_UPDATED: 'server:updated',

    // Status events
    STATUS_UPDATE: 'status:update',
    ERROR_OCCURRED: 'error:occurred'
  };