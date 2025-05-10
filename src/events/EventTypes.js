/**
 * Event type constants for application-wide events
 */
module.exports = {
    // Config events
    CONFIG_UPDATED: 'config:updated',
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

    // DNS events
    DNS_RECORDS_UPDATED: 'dns:records:updated',
    DNS_RECORD_CREATED: 'dns:record:created',
    DNS_RECORD_UPDATED: 'dns:record:updated',
    DNS_RECORD_DELETED: 'dns:record:deleted',
    DNS_CACHE_REFRESHED: 'dns:cache:refreshed',

    // Status events
    STATUS_UPDATE: 'status:update',
    ERROR_OCCURRED: 'error:occurred'
  };