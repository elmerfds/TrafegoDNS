/**
 * Port Error Classes
 * Custom error classes for port monitoring operations
 */

/**
 * Base class for all port-related errors
 */
class PortError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get error as JSON object
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Error thrown when port availability check fails
 */
class PortCheckError extends PortError {
  constructor(message, port, protocol, host, originalError) {
    super(message, 'PORT_CHECK_FAILED', {
      port,
      protocol,
      host,
      originalError: originalError ? {
        message: originalError.message,
        name: originalError.name,
        code: originalError.code
      } : null
    });
    
    this.port = port;
    this.protocol = protocol;
    this.host = host;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when port reservation operations fail
 */
class PortReservationError extends PortError {
  constructor(message, port, protocol, containerId, originalError) {
    super(message, 'PORT_RESERVATION_FAILED', {
      port,
      protocol,
      containerId,
      originalError: originalError ? {
        message: originalError.message,
        name: originalError.name,
        code: originalError.code
      } : null
    });
    
    this.port = port;
    this.protocol = protocol;
    this.containerId = containerId;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when port conflicts are detected
 */
class PortConflictError extends PortError {
  constructor(message, conflicts, suggestedAlternatives = []) {
    super(message, 'PORT_CONFLICT', {
      conflicts,
      suggestedAlternatives
    });
    
    this.conflicts = conflicts;
    this.suggestedAlternatives = suggestedAlternatives;
  }
}

/**
 * Error thrown when port scanning operations fail
 */
class PortScanError extends PortError {
  constructor(message, startPort, endPort, protocol, originalError) {
    super(message, 'PORT_SCAN_FAILED', {
      startPort,
      endPort,
      protocol,
      originalError: originalError ? {
        message: originalError.message,
        name: originalError.name,
        code: originalError.code
      } : null
    });
    
    this.startPort = startPort;
    this.endPort = endPort;
    this.protocol = protocol;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when Docker port operations fail
 */
class DockerPortError extends PortError {
  constructor(message, containerId, containerName, originalError) {
    super(message, 'DOCKER_PORT_FAILED', {
      containerId,
      containerName,
      originalError: originalError ? {
        message: originalError.message,
        name: originalError.name,
        code: originalError.code
      } : null
    });
    
    this.containerId = containerId;
    this.containerName = containerName;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when port suggestion operations fail
 */
class PortSuggestionError extends PortError {
  constructor(message, requestedPorts, protocol, originalError) {
    super(message, 'PORT_SUGGESTION_FAILED', {
      requestedPorts,
      protocol,
      originalError: originalError ? {
        message: originalError.message,
        name: originalError.name,
        code: originalError.code
      } : null
    });
    
    this.requestedPorts = requestedPorts;
    this.protocol = protocol;
    this.originalError = originalError;
  }
}

/**
 * Utility function to wrap errors with port context
 */
function wrapPortError(originalError, context = {}) {
  if (originalError instanceof PortError) {
    return originalError;
  }

  const { operation, port, protocol, host, containerId } = context;

  switch (operation) {
    case 'check':
      return new PortCheckError(
        `Port check failed: ${originalError.message}`,
        port,
        protocol,
        host,
        originalError
      );
    case 'reserve':
      return new PortReservationError(
        `Port reservation failed: ${originalError.message}`,
        port,
        protocol,
        containerId,
        originalError
      );
    case 'scan':
      return new PortScanError(
        `Port scan failed: ${originalError.message}`,
        context.startPort,
        context.endPort,
        protocol,
        originalError
      );
    case 'docker':
      return new DockerPortError(
        `Docker port operation failed: ${originalError.message}`,
        containerId,
        context.containerName,
        originalError
      );
    case 'suggest':
      return new PortSuggestionError(
        `Port suggestion failed: ${originalError.message}`,
        context.requestedPorts,
        protocol,
        originalError
      );
    default:
      return new PortError(
        `Port operation failed: ${originalError.message}`,
        'PORT_OPERATION_FAILED',
        { operation, originalError, ...context }
      );
  }
}

/**
 * Check if error is a port-related error
 */
function isPortError(error) {
  return error instanceof PortError;
}

/**
 * Extract port error details for logging/monitoring
 */
function extractPortErrorDetails(error) {
  if (!isPortError(error)) {
    return null;
  }

  return {
    type: error.name,
    code: error.code,
    message: error.message,
    details: error.details,
    timestamp: error.timestamp
  };
}

module.exports = {
  PortError,
  PortCheckError,
  PortReservationError,
  PortConflictError,
  PortScanError,
  DockerPortError,
  PortSuggestionError,
  wrapPortError,
  isPortError,
  extractPortErrorDetails
};