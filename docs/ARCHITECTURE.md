# TrafegoDNS Architecture

## State Management Architecture

TrafegoDNS uses an event-driven architecture with a central state store to ensure consistency across multiple interfaces (CLI, API, GUI).

### Core Components

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│  CLI/API/GUI │────▶│  Controllers │────▶│  Action Broker │
└─────────────┘     └──────────────┘     └────────┬───────┘
                                                  │
                                                  ▼
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│  Subscribers │◀───┤  Event Bus   │◀────│  State Store   │
└─────────────┘     └──────────────┘     └────────────────┘
```

### Key Components

1. **State Store**: Single source of truth for application state
   - Manages DNS records, configurations, user settings, etc.
   - Provides controlled access to state
   - Ensures data integrity through validation

2. **Action Broker**: Manages state mutations
   - Receives action requests from controllers
   - Validates and processes actions
   - Updates the state store
   - Emits events for state changes

3. **Event Bus**: Central message system
   - Broadcasts events when state changes
   - Allows components to subscribe to specific events
   - Enables real-time updates across interfaces

4. **Controllers**: Interface adapters
   - API Controllers: Handle HTTP requests
   - CLI Controllers: Process command-line inputs
   - GUI Controllers: Manage user interface interactions

5. **Subscribers**: Components that react to state changes
   - Services: Update internal state based on events
   - WebSocket server: Push updates to connected clients
   - Persistence layer: Save state changes to storage

### Implementation Details

#### 1. State Store Implementation

```javascript
// src/state/StateStore.js
class StateStore {
  constructor() {
    this.state = {
      dns: {
        records: [],
        orphaned: []
      },
      config: {
        // Configuration values
      },
      system: {
        // System status
      }
    };
  }

  getState(path) {
    // Get specific part of state using dot notation
  }

  // Only the ActionBroker can update state
  _updateState(path, value, metadata) {
    // Internal method to update state
    // Returns the updated state
  }
}
```

#### 2. Action Broker Implementation

```javascript
// src/state/ActionBroker.js
class ActionBroker {
  constructor(stateStore, eventBus) {
    this.stateStore = stateStore;
    this.eventBus = eventBus;
  }

  dispatch(action) {
    // Validate action
    const { type, payload, metadata = {} } = action;
    
    // Process action based on type
    switch (type) {
      case 'DNS_RECORD_CREATE':
        return this.createDnsRecord(payload, metadata);
      // Other action types...
    }
  }

  createDnsRecord(record, metadata) {
    // Validate record
    // Process through DNS provider
    // Update state store
    const updatedState = this.stateStore._updateState(
      'dns.records', 
      [...this.stateStore.getState('dns.records'), record],
      metadata
    );
    
    // Emit events
    this.eventBus.emit('dns:record:created', { record, metadata });
    this.eventBus.emit('state:changed', { 
      path: 'dns.records',
      newValue: updatedState.dns.records,
      action: 'DNS_RECORD_CREATE'
    });
    
    return record;
  }
}
```

#### 3. Event Bus Enhancement

```javascript
// src/events/EventBus.js
class EventBus {
  constructor() {
    this.subscribers = {};
  }

  subscribe(event, callback) {
    if (!this.subscribers[event]) {
      this.subscribers[event] = [];
    }
    this.subscribers[event].push(callback);
    
    return () => this.unsubscribe(event, callback);
  }

  unsubscribe(event, callback) {
    if (!this.subscribers[event]) return;
    this.subscribers[event] = this.subscribers[event]
      .filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this.subscribers[event]) return;
    this.subscribers[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
    
    // Also emit to wildcard subscribers
    if (event !== '*' && this.subscribers['*']) {
      this.subscribers['*'].forEach(callback => {
        try {
          callback({ event, data });
        } catch (error) {
          console.error(`Error in wildcard event handler for ${event}:`, error);
        }
      });
    }
  }
}
```

### Connecting Interfaces to the State Architecture

#### API Interface

```javascript
// src/api/v1/controllers/dnsController.js
const createRecord = asyncHandler(async (req, res) => {
  const { type, name, content, ttl, proxied } = req.body;
  
  try {
    // Dispatch action to broker
    const record = await actionBroker.dispatch({
      type: 'DNS_RECORD_CREATE',
      payload: { type, name, content, ttl, proxied },
      metadata: {
        source: 'api',
        user: req.user.id
      }
    });
    
    res.status(201).json({
      status: 'success',
      data: record
    });
  } catch (error) {
    // Handle error
  }
});
```

#### CLI Interface

```javascript
// src/cli/commands/dns.js
const createRecord = async (args) => {
  const { type, name, content, ttl, proxied } = args;
  
  try {
    // In API mode, use API client
    if (useApiMode) {
      return await apiClient.createDnsRecord({ 
        type, name, content, ttl, proxied 
      });
    }
    
    // In CLI-only mode, dispatch action directly
    return await actionBroker.dispatch({
      type: 'DNS_RECORD_CREATE',
      payload: { type, name, content, ttl, proxied },
      metadata: {
        source: 'cli'
      }
    });
  } catch (error) {
    // Handle error
  }
};
```

#### WebSocket Real-time Updates

```javascript
// src/api/socketServer.js
class SocketServer {
  constructor(httpServer, eventBus, config) {
    this.io = socketIO(httpServer);
    this.eventBus = eventBus;
    
    // Set up authentication and connection handling
    this.io.on('connection', this.handleConnection.bind(this));
    
    // Subscribe to state change events
    this.eventBus.subscribe('state:changed', this.handleStateChange.bind(this));
    this.eventBus.subscribe('dns:record:*', this.handleDnsEvent.bind(this));
  }
  
  handleStateChange(data) {
    // Broadcast state changes to relevant clients
    this.io.emit('state:changed', {
      path: data.path,
      action: data.action
    });
  }
  
  handleDnsEvent(data) {
    // Broadcast DNS events to relevant clients
    this.io.emit('dns:update', {
      type: data.event,
      record: data.record
    });
  }
}
```

### Configuration and Persistence

```javascript
// src/config/ConfigManager.js
class ConfigManager {
  constructor(stateStore, eventBus) {
    this.stateStore = stateStore;
    this.eventBus = eventBus;
    
    // Load initial config
    this.loadConfig();
    
    // Subscribe to config change events
    this.eventBus.subscribe('config:changed', this.handleConfigChange.bind(this));
  }
  
  loadConfig() {
    // Load from environment and files
    const config = this.loadFromEnvironment();
    
    // Dispatch action to update state
    actionBroker.dispatch({
      type: 'CONFIG_LOAD',
      payload: config,
      metadata: {
        source: 'system'
      }
    });
  }
  
  handleConfigChange(data) {
    // Persist config changes if needed
    if (data.persist) {
      this.persistConfig(data.path, data.value);
    }
  }
}
```

## Benefits of This Architecture

1. **Consistency**: Single source of truth for state
2. **Real-time synchronization**: All interfaces updated via events
3. **Auditability**: All state changes tracked with metadata
4. **Extensibility**: Easy to add new interfaces or features
5. **Reliability**: Centralized validation and error handling
6. **Performance**: Optimized state updates with granular subscriptions

## Implementation Plan

1. ✅ Create core state management components (StateStore, ActionBroker)
2. ✅ Enhance EventBus with subscription management
3. ✅ Connect existing services to state architecture
4. ✅ Adapt API controllers to use ActionBroker
5. ✅ Update CLI interface to work with central state
6. Implement WebSocket server for real-time updates
7. Add persistence layer for configuration changes

## Actual Implementation Details

The state management system is now fully implemented in the codebase. Here are the key components:

### 1. State Store

Located at `src/state/StateStore.js`, the State Store maintains a centralized state with the following structure:

```javascript
this.state = {
  dns: {
    records: [],     // All DNS records
    orphaned: [],    // Orphaned records pending cleanup
    preserved: [],   // Records explicitly preserved from cleanup
    managed: []      // Records managed by the application
  },
  containers: {
    list: [],        // Active containers
    labels: {}       // Container label metadata
  },
  config: {
    // Configuration values from ConfigManager
  },
  system: {
    started: new Date().toISOString(),
    status: 'initializing',
    uptime: 0,
    version: process.env.npm_package_version || '1.0.0'
  },
  users: {
    list: []         // User accounts
  }
};
```

The state store maintains a revision history of state changes and provides methods to access specific paths using dot notation (e.g., `dns.records`).

### 2. Action Broker

Located at `src/state/ActionBroker.js`, the Action Broker handles state mutations through a controlled action dispatch system:

```javascript
// Example of dispatching an action
actionBroker.dispatch({
  type: 'DNS_RECORD_CREATE',
  payload: {
    type: 'A',
    name: 'example.com',
    content: '192.168.1.1'
  },
  metadata: {
    source: 'api',
    userId: 'user123'
  }
});
```

The Action Broker provides:
- Middleware support for logging, validation, and other cross-cutting concerns
- Registered action handlers for different domains (DNS, Config, etc.)
- Event emission for state changes

### 3. Action Handlers

Actions are processed by domain-specific handlers:

- `src/state/actions/dnsActions.js`: DNS record operations
- `src/state/actions/configActions.js`: Configuration management
- `src/state/actions/orphanedActions.js`: Orphaned record management

Each handler is responsible for validating inputs, interacting with services, updating state, and emitting appropriate events.

### 4. Enhanced EventBus

Located at `src/events/EventBus.js`, the enhanced EventBus now supports:

- Wildcard pattern subscriptions (e.g., `dns:*` to catch all DNS events)
- Unsubscribe functions for cleanup
- Error handling for event callbacks

Example:
```javascript
// Subscribe to all DNS record events
const unsubscribe = eventBus.subscribe('dns:record:*', (data) => {
  console.log('DNS record event:', data);
});

// Later, when no longer needed
unsubscribe();
```

### 5. API Controller Integration

API controllers have been updated to use the ActionBroker for state mutations:

```javascript
// Before: Direct service call
const createdRecord = await DNSManager.dnsProvider.createRecord(recordConfig);
DNSManager.recordTracker.trackRecord(createdRecord);

// After: Action broker dispatch
const createdRecord = await actionBroker.dispatch({
  type: 'DNS_RECORD_CREATE',
  payload: recordConfig,
  metadata: {
    source: 'api',
    requestId: req.id,
    userId: req.user?.id || 'system'
  }
});
```

This ensures all operations go through the central state management system while maintaining backward compatibility through fallback mechanisms.

### 6. Startup Initialization

The state management system is initialized during application startup in `src/app.js`:

```javascript
// Initialize state management system
const { initializeStateManagement } = require('./state');
const { stateStore, actionBroker } = initializeStateManagement(eventBus, {
  DNSManager: dnsManager,
  DockerMonitor: dockerMonitor,
  StatusReporter: statusReporter,
  // Other services...
});

// Make state available globally
global.stateStore = stateStore;
global.actionBroker = actionBroker;
```

### Future Work

1. **WebSocket Integration**: Add real-time updates to connected clients
2. **Persistence Layer**: Implement state persistence for configuration changes
3. **UI Integration**: Connect future UI components to the state system
4. **Command History**: Add action logging and replaying capabilities
5. **Transaction Support**: Group multiple actions into atomic transactions