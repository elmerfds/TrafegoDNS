/**
 * Port Availability Checker
 * Handles real-time port availability checking using various methods
 */
const net = require('net');
const { spawn } = require('child_process');
const logger = require('../../utils/logger');
const protocolHandler = require('../../utils/protocolHandler');
const { PortCheckError, wrapPortError } = require('../../utils/portError');
const { cacheManager } = require('../../utils/cacheManager');

class PortAvailabilityChecker {
  constructor(config) {
    this.config = config;
    this.connectionTimeout = config.PORT_CHECK_TIMEOUT || 1000; // 1 second
    this.preferredMethod = config.PORT_CHECK_METHOD || 'socket'; // socket, netstat, ss
    this.isDocker = require('fs').existsSync('/.dockerenv');
    
    // Register cache namespace for port availability
    cacheManager.registerCache('port_availability', {
      ttl: config.PORT_CACHE_TIMEOUT || 5000, // 5 seconds
      maxSize: 2000,
      invalidateOn: ['port:status_changed', 'system:port_scan'],
      keyPrefix: 'availability'
    });
    
    // Check for manually configured host IP
    this.hostIp = config.HOST_IP || config.DOCKER_HOST_IP || process.env.HOST_IP || process.env.DOCKER_HOST_IP || null;
    
    if (this.hostIp) {
      logger.info(`🔧 Using manually configured host IP: ${this.hostIp}`);
    }
    
    logger.info('PortAvailabilityChecker initialized with centralized cache');
  }

  /**
   * Check if a single port is available
   * @param {number} port - Port to check
   * @param {string|string[]} protocol - Protocol(s) (tcp/udp/both)
   * @param {string} host - Host to check (default: localhost)
   * @returns {Promise<boolean>}
   */
  async checkSinglePort(port, protocol = 'tcp', host = 'localhost') {
    const normalizedProtocol = protocolHandler.normalizeProtocol(protocol);
    const protocols = protocolHandler.expandProtocols(normalizedProtocol);
    
    // For multiple protocols, all must be available
    for (const proto of protocols) {
      const isAvailable = await this._checkSingleProtocolPort(port, proto, host);
      if (!isAvailable) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Check if a single port is available for a specific protocol
   * @param {number} port - Port to check
   * @param {string} protocol - Protocol (tcp/udp)
   * @param {string} host - Host to check (default: localhost)
   * @returns {Promise<boolean>}
   * @private
   */
  async _checkSingleProtocolPort(port, protocol = 'tcp', host = 'localhost') {
    // If we're in Docker and checking localhost, use the actual host IP for socket checks
    let targetHost = host;
    if (this.isDocker && (host === 'localhost' || host === '127.0.0.1') && this.preferredMethod === 'socket') {
      targetHost = await this._detectHostIp();
      logger.debug(`Docker detected: checking port ${port} on actual host IP ${targetHost} instead of ${host}`);
    }
    
    logger.debug(`🔍 checkSinglePort: port=${port}, protocol=${protocol}, host=${host}, targetHost=${targetHost}, method=${this.preferredMethod}`);
    
    const cacheKey = `${targetHost}:${port}:${protocol}`;
    const cached = cacheManager.get('port_availability', cacheKey);
    
    if (cached !== null) {
      return cached;
    }

    try {
      let available = false;
      
      switch (this.preferredMethod) {
        case 'netstat':
          available = await this._checkPortWithNetstat(port, protocol);
          break;
        case 'ss':
          try {
            available = await this._checkPortWithSs(port, protocol);
          } catch (ssError) {
            if (ssError.message.includes('ENOENT') || ssError.message.includes('ss')) {
              logger.debug('ss command not found, falling back to netstat for port check');
              available = await this._checkPortWithNetstat(port, protocol);
            } else {
              throw ssError;
            }
          }
          break;
        case 'socket':
        default:
          available = await this._checkPortWithSocket(port, targetHost, protocol);
          break;
      }

      // Cache the result in centralized cache
      cacheManager.set('port_availability', cacheKey, available, {
        tags: [`host:${targetHost}`, `port:${port}`, `protocol:${protocol}`, 'availability_check']
      });

      return available;
    } catch (error) {
      const portError = new PortCheckError(
        `Failed to check port ${port}/${protocol} on ${targetHost}`,
        port,
        protocol,
        targetHost,
        error
      );
      logger.error('Port availability check failed', {
        port,
        protocol,
        host: targetHost,
        method: this.preferredMethod,
        error: portError.toJSON()
      });
      
      // For port checks, we can choose to throw or return a result object
      // Return false for now but with detailed logging
      return false;
    }
  }

  /**
   * Check multiple ports availability
   * @param {Array<number>} ports - Ports to check
   * @param {string|string[]} protocol - Protocol(s) (tcp/udp/both)
   * @param {string} host - Host to check
   * @returns {Promise<Object>} - Object with port as key and availability as value
   */
  async checkMultiplePorts(ports, protocol = 'tcp', host = 'localhost') {
    const normalizedProtocol = protocolHandler.normalizeProtocol(protocol);
    // Pre-detect host IP if needed to avoid multiple detections
    let targetHost = host;
    if (this.isDocker && (host === 'localhost' || host === '127.0.0.1') && this.preferredMethod === 'socket') {
      targetHost = await this._detectHostIp();
      logger.debug(`Docker detected: will check multiple ports on actual host IP ${targetHost} instead of ${host}`);
    }
    
    const results = {};
    const concurrency = this.config.PORT_CHECK_CONCURRENCY || 10;
    
    // Process ports in batches to control concurrency
    for (let i = 0; i < ports.length; i += concurrency) {
      const batch = ports.slice(i, i + concurrency);
      const batchPromises = batch.map(async (port) => {
        const available = await this.checkSinglePort(port, normalizedProtocol, targetHost);
        return { port, available };
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        const port = batch[index];
        if (result.status === 'fulfilled') {
          results[port] = result.value.available;
        } else {
          logger.error(`Failed to check port ${port} in batch:`, {
            port,
            protocol: normalizedProtocol,
            host: targetHost,
            error: result.reason,
            batchIndex: index
          });
          results[port] = false;
        }
      });
    }

    return results;
  }

  /**
   * Get all listening ports on the system
   * @param {string|string[]} protocol - Protocol filter (tcp/udp/both)
   * @returns {Promise<Array<Object>>}
   */
  async getListeningPorts(protocol = null) {
    const normalizedProtocol = protocol ? protocolHandler.normalizeProtocol(protocol) : null;
    try {
      const method = this.config.SYSTEM_PORT_SCAN_METHOD || 'ss';
      logger.info(`Getting listening ports using method: ${method}, protocol filter: ${normalizedProtocol || 'all'}`);
      
      let ports = [];
      let usedMethod = method;
      
      switch (method) {
        case 'netstat':
          ports = await this._getListeningPortsWithNetstat(protocol);
          break;
        case 'ss':
        default:
          try {
            ports = await this._getListeningPortsWithSs(protocol);
          } catch (ssError) {
            if (ssError.message.includes('ENOENT') || ssError.message.includes('ss') || ssError.message.includes('not found')) {
              logger.warn('ss command not found, falling back to netstat');
              usedMethod = 'netstat (fallback)';
              ports = await this._getListeningPortsWithNetstat(protocol);
            } else {
              throw ssError;
            }
          }
          break;
      }
      
      // Remove duplicates based on port and protocol
      const uniquePorts = new Map();
      for (const port of ports) {
        const key = `${port.port}-${port.protocol}`;
        if (!uniquePorts.has(key)) {
          uniquePorts.set(key, port);
        }
      }
      const filteredPorts = Array.from(uniquePorts.values());
      
      logger.info(`Found ${filteredPorts.length} unique listening ports using ${usedMethod} (${ports.length} total before deduplication)`);
      
      if (filteredPorts.length > 0) {
        // Sort ports for consistent output
        filteredPorts.sort((a, b) => a.port - b.port);
        
        // Log some examples for debugging
        const examples = filteredPorts.slice(0, 10).map(p => `${p.port}/${p.protocol}(${p.service})`);
        logger.info(`Sample ports: ${examples.join(', ')}${filteredPorts.length > 10 ? '...' : ''}`);
        
        // Check for common system ports to verify detection is working
        const systemPorts = [22, 53, 80, 443];
        const foundSystemPorts = filteredPorts.filter(p => systemPorts.includes(p.port));
        if (foundSystemPorts.length > 0) {
          logger.info(`Detected common system ports: ${foundSystemPorts.map(p => p.port).join(', ')}`);
        }
      } else {
        logger.warn('No listening ports detected - this may indicate a parsing issue');
      }
      
      return filteredPorts;
    } catch (error) {
      const portError = wrapPortError(error, {
        operation: 'scan',
        protocol: normalizedProtocol,
        method: usedMethod
      });
      
      logger.error('Failed to get listening ports', {
        method: usedMethod,
        protocol: normalizedProtocol,
        error: portError.toJSON()
      });
      
      // For system port listing, empty array return is acceptable but should be distinguished from successful empty result
      // Consider throwing in future if callers can handle it
      return [];
    }
  }

  /**
   * Scan a range of ports for availability
   * @param {number} startPort - Start port
   * @param {number} endPort - End port
   * @param {string} protocol - Protocol
   * @param {string} host - Host to scan
   * @returns {Promise<Object>}
   */
  async scanPortRange(startPort, endPort, protocol = 'tcp', host = 'localhost') {
    const ports = [];
    for (let port = startPort; port <= endPort; port++) {
      ports.push(port);
    }

    return await this.checkMultiplePorts(ports, protocol, host);
  }

  /**
   * Find available ports in a range
   * @param {number} startPort - Start port
   * @param {number} endPort - End port
   * @param {number} count - Number of ports needed
   * @param {string} protocol - Protocol
   * @returns {Promise<Array<number>>}
   */
  async findAvailablePorts(startPort, endPort, count = 1, protocol = 'tcp') {
    const results = await this.scanPortRange(startPort, endPort, protocol);
    const availablePorts = [];

    for (const [port, available] of Object.entries(results)) {
      if (available && availablePorts.length < count) {
        availablePorts.push(parseInt(port));
      }
    }

    return availablePorts;
  }

  /**
   * Set the host IP manually (useful for configuration override)
   * @param {string} hostIp - The host IP to use
   * @param {boolean} validate - Whether to validate connectivity (default: true)
   */
  async setHostIp(hostIp, validate = true) {
    if (hostIp && (hostIp.match(/^\d+\.\d+\.\d+\.\d+$/) || hostIp === 'host.docker.internal' || hostIp === 'localhost')) {
      if (validate && hostIp !== 'localhost') {
        logger.info(`🧪 Validating host IP ${hostIp}...`);
        const isReachable = await this._testHostConnectivity(hostIp);
        if (!isReachable) {
          logger.warn(`⚠️ Host IP ${hostIp} is not reachable - setting anyway`);
        }
      }
      
      this.hostIp = hostIp;
      logger.info(`🔧 Manually set host IP to: ${this.hostIp}`);
      
      // Clear cache to force re-detection with new IP
      this.clearCache();
      
      return true;
    } else {
      logger.warn(`⚠️ Invalid host IP format: ${hostIp}`);
      return false;
    }
  }

  /**
   * Get the currently detected or set host IP
   * @returns {string|null}
   */
  getHostIp() {
    return this.hostIp;
  }

  /**
   * Reset host IP detection (force re-detection on next use)
   */
  resetHostIp() {
    this.hostIp = null;
    logger.debug('🔄 Reset host IP cache - will re-detect on next use');
  }

  /**
   * Clear the availability cache
   */
  clearCache() {
    cacheManager.clear('port_availability');
    logger.debug('Cleared port availability cache');
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    const stats = cacheManager.getStats('port_availability');
    return {
      namespace: 'port_availability',
      ...stats.namespaces.port_availability || {},
      globalMetrics: stats.metrics
    };
  }

  /**
   * Check port availability using socket connection
   * @param {number} port - Port to check
   * @param {string} host - Host to check
   * @param {string} protocol - Protocol
   * @returns {Promise<boolean>}
   * @private
   */
  async _checkPortWithSocket(port, host, protocol) {
    if (protocol === 'udp') {
      // UDP ports are more complex to check, use system tools
      logger.debug(`🔍 Checking UDP port ${port} on ${host} using system tools...`);
      try {
        const result = await this._checkPortWithSs(port, protocol);
        logger.debug(`🔍 UDP port ${port} result: ${result ? 'available' : 'in use'}`);
        return result;
      } catch (error) {
        logger.debug(`🔍 UDP port ${port} check failed: ${error.message}, falling back to netstat`);
        try {
          const result = await this._checkPortWithNetstat(port, protocol);
          logger.debug(`🔍 UDP port ${port} netstat result: ${result ? 'available' : 'in use'}`);
          return result;
        } catch (netstatError) {
          logger.debug(`🔍 UDP port ${port} netstat also failed: ${netstatError.message}, assuming available`);
          return true; // Assume available if we can't check UDP
        }
      }
    }

    logger.debug(`🔍 Checking TCP port ${port} on ${host} via socket...`);
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        logger.debug(`🔍 TCP port ${port} timeout, assuming available`);
        resolve(true); // If we can't connect, assume it's available
      }, this.connectionTimeout);

      socket.connect(port, host, () => {
        clearTimeout(timeout);
        socket.destroy();
        logger.debug(`🔍 TCP port ${port} connected successfully, port is in use`);
        resolve(false); // Port is in use
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.destroy();
        logger.debug(`🔍 TCP port ${port} connection error (${err.code}), port is available`);
        resolve(true); // Port is available
      });
    });
  }

  /**
   * Check port availability using netstat
   * @param {number} port - Port to check
   * @param {string} protocol - Protocol
   * @returns {Promise<boolean>}
   * @private
   */
  async _checkPortWithNetstat(port, protocol) {
    return new Promise((resolve, reject) => {
      const protocolFlag = protocol === 'udp' ? '-u' : '-t';
      const netstat = spawn('netstat', ['-ln', protocolFlag]);
      
      let output = '';
      
      netstat.stdout.on('data', (data) => {
        output += data.toString();
      });

      netstat.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`netstat exited with code ${code}`));
          return;
        }

        // Check if port is in the output
        const portPattern = new RegExp(`[\\s:]${port}\\s`, 'g');
        const isListening = portPattern.test(output);
        resolve(!isListening); // Available if not listening
      });

      netstat.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Check port availability using ss command
   * @param {number} port - Port to check
   * @param {string} protocol - Protocol
   * @returns {Promise<boolean>}
   * @private
   */
  async _checkPortWithSs(port, protocol) {
    return new Promise((resolve, reject) => {
      const protocolFlag = protocol === 'udp' ? '-u' : '-t';
      const ss = spawn('ss', ['-ln', protocolFlag]);
      
      let output = '';
      
      ss.stdout.on('data', (data) => {
        output += data.toString();
      });

      ss.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ss exited with code ${code}`));
          return;
        }

        // Check if port is in the output
        const portPattern = new RegExp(`[\\s:]${port}\\s`, 'g');
        const isListening = portPattern.test(output);
        resolve(!isListening); // Available if not listening
      });

      ss.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get listening ports using netstat
   * @param {string} protocol - Protocol filter
   * @returns {Promise<Array<Object>>}
   * @private
   */
  async _getListeningPortsWithNetstat(protocol) {
    return new Promise((resolve, reject) => {
      // Use more comprehensive netstat flags for better detection
      let args = ['-ln'];
      
      // Check if we're in a Docker container
      const isDocker = require('fs').existsSync('/.dockerenv');
      
      if (isDocker) {
        // In Docker, we might need different flags
        args = ['-tuln'];
      } else {
        if (protocol) {
          args.push(protocol === 'udp' ? '-u' : '-t');
        } else {
          // Include both TCP and UDP if no protocol specified
          args.push('-tu');
        }
        
        // Add additional flags for more comprehensive output
        args.push('--numeric-ports', '--numeric-hosts');
      }
      
      logger.debug(`Running netstat with args: ${args.join(' ')} (Docker: ${isDocker})`);
      
      const netstat = spawn('netstat', args);
      let output = '';
      let errorOutput = '';
      
      netstat.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      netstat.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      netstat.on('close', (code) => {
        if (code !== 0) {
          logger.warn(`netstat exited with code ${code}, stderr: ${errorOutput}`);
          // Don't reject immediately, try to parse what we got
        }

        logger.debug(`netstat output length: ${output.length} characters`);
        if (output.length > 0) {
          const lines = output.split('\n');
          logger.debug(`First few lines of netstat output:\n${lines.slice(0, 5).join('\n')}`);
          
          // Show sample LISTEN lines for debugging
          const listenLines = lines.filter(line => line.includes('LISTEN') && line.trim());
          if (listenLines.length > 0) {
            logger.debug(`📝 Sample LISTEN lines in netstat:`);
            listenLines.slice(0, 10).forEach(line => logger.debug(`   ${line.trim()}`));
          }
        }

        const ports = this._parseNetstatOutput(output, protocol);
        resolve(ports);
      });

      netstat.on('error', (error) => {
        logger.error(`netstat command failed: ${error.message}`);
        reject(error);
      });
      
      // Set a timeout to prevent hanging
      setTimeout(() => {
        netstat.kill();
        reject(new Error('netstat command timeout'));
      }, 10000);
    });
  }

  /**
   * Get listening ports using ss command
   * @param {string} protocol - Protocol filter
   * @returns {Promise<Array<Object>>}
   * @private
   */
  async _getListeningPortsWithSs(protocol) {
    return new Promise((resolve, reject) => {
      // Use more comprehensive ss flags for better detection
      let args = ['-ln'];
      
      // Check if we're in a Docker container
      const isDocker = require('fs').existsSync('/.dockerenv');
      
      if (isDocker) {
        // In Docker, use simpler flags that work better
        args = ['-tuln'];
      } else {
        if (protocol) {
          args.push(protocol === 'udp' ? '-u' : '-t');
        } else {
          // Include both TCP and UDP if no protocol specified
          args.push('-tu');
        }
        
        // Add additional flags for more comprehensive output
        args.push('--numeric', '--all');
      }
      
      logger.debug(`Running ss with args: ${args.join(' ')} (Docker: ${isDocker})`);
      
      const ss = spawn('ss', args);
      let output = '';
      let errorOutput = '';
      
      ss.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ss.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ss.on('close', (code) => {
        if (code !== 0) {
          logger.warn(`ss exited with code ${code}, stderr: ${errorOutput}`);
          // Don't reject immediately, try to parse what we got
        }

        logger.debug(`ss output length: ${output.length} characters`);
        if (output.length > 0) {
          logger.debug(`First few lines of ss output:\n${output.split('\n').slice(0, 5).join('\n')}`);
        }

        const ports = this._parseSsOutput(output, protocol);
        resolve(ports);
      });

      ss.on('error', (error) => {
        logger.error(`ss command failed: ${error.message}`);
        reject(error);
      });
      
      // Set a timeout to prevent hanging
      setTimeout(() => {
        ss.kill();
        reject(new Error('ss command timeout'));
      }, 10000);
    });
  }

  /**
   * Parse netstat output to extract port information
   * @param {string} output - netstat output
   * @param {string} protocol - Protocol filter
   * @returns {Array<Object>}
   * @private
   */
  _parseNetstatOutput(output, protocol) {
    const ports = [];
    const lines = output.split('\n');
    
    logger.debug(`📝 Parsing netstat output (${lines.length} lines)`);

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Skip header lines
      if (trimmedLine.includes('Proto') || trimmedLine.includes('Active')) continue;
      
      // Multiple regex patterns to handle different netstat formats
      const patterns = [
        // Standard format: tcp 0 0 0.0.0.0:80 0.0.0.0:* LISTEN
        /^(tcp|udp)(?:6)?\s+\d+\s+\d+\s+([^:\s]+):(\d+)\s+[^:\s]+:[^:\s]+\s+(?:LISTEN|listening)/i,
        // Alternative format: tcp 0 0 :::80 :::* LISTEN  
        /^(tcp|udp)(?:6)?\s+\d+\s+\d+\s+:::(\d+)\s+:::.*?\s+(?:LISTEN|listening)/i,
        // Format with interface: tcp 0 0 127.0.0.1:80 0.0.0.0:* LISTEN
        /^(tcp|udp)(?:6)?\s+\d+\s+\d+\s+([^:\s]*):(\d+)\s+.*?\s+(?:LISTEN|listening)/i,
        // Simplified format: tcp 127.0.0.1:80 LISTEN
        /^(tcp|udp)(?:6)?\s+([^:\s]*):(\d+)\s+.*?(?:LISTEN|listening)/i
      ];
      
      let matched = false;
      for (const pattern of patterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          let lineProtocol, host, port;
          
          if (match.length === 4 && pattern === patterns[1]) {
            // IPv6 format :::port
            [, lineProtocol, port] = match;
            host = '::';
            port = parseInt(port);
          } else if (match.length === 4) {
            [, lineProtocol, host, port] = match;
            port = parseInt(port);
          } else {
            continue;
          }
          
          if (!protocol || lineProtocol.toLowerCase() === protocol.toLowerCase()) {
            const portInfo = {
              port: port,
              protocol: lineProtocol.toLowerCase(),
              host: (host === '0.0.0.0' || host === '::' || host === '*' || !host) ? '*' : host,
              state: 'LISTEN',
              service: this._identifyService(port)
            };
            ports.push(portInfo);
          }
          matched = true;
          break;
        }
      }
      
      if (!matched && trimmedLine.includes('LISTEN')) {
        // Debug log for unmatched LISTEN lines
        logger.debug(`Unmatched netstat LISTEN line: ${trimmedLine}`);
      }
    }

    logger.info(`📊 Parsed ${ports.length} ports from netstat output`);
    
    return ports;
  }

  /**
   * Parse ss output to extract port information
   * @param {string} output - ss output
   * @param {string} protocol - Protocol filter
   * @returns {Array<Object>}
   * @private
   */
  _parseSsOutput(output, protocol) {
    const ports = [];
    const lines = output.split('\n');
    
    logger.debug(`📝 Parsing ss output (${lines.length} lines)`);

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Skip header lines
      if (trimmedLine.includes('State') || trimmedLine.includes('Netid')) continue;
      
      // ss output format: State Recv-Q Send-Q Local Address:Port Peer Address:Port
      const parts = trimmedLine.split(/\s+/);
      
      if (parts.length >= 4 && (parts[0] === 'LISTEN' || parts[0] === 'UNCONN')) {
        const localAddress = parts[3];
        let match = null;
        
        // Handle different address formats
        const addressPatterns = [
          // Standard IPv4: 0.0.0.0:80
          /^([^:\[\]]+):(\d+)$/,
          // IPv6 with brackets: [::]:80
          /^\[([^\]]+)\]:(\d+)$/,
          // IPv6 without brackets: :::80
          /^:::(\d+)$/,
          // Wildcard: *:80
          /^\*:(\d+)$/
        ];
        
        for (const pattern of addressPatterns) {
          match = localAddress.match(pattern);
          if (match) break;
        }
        
        if (match) {
          let host, port;
          
          if (match.length === 2) {
            // Patterns with only port (:::80 or *:80)
            host = localAddress.startsWith(':::') ? '::' : '*';
            port = parseInt(match[1]);
          } else {
            // Patterns with host and port
            [, host, port] = match;
            port = parseInt(port);
          }
          
          const lineProtocol = parts[0] === 'UNCONN' ? 'udp' : 'tcp';
          
          if (!protocol || lineProtocol === protocol) {
            const portInfo = {
              port: port,
              protocol: lineProtocol,
              host: (host === '0.0.0.0' || host === '*' || host === '::' || host === '[::]' || !host) ? '*' : host,
              state: parts[0],
              service: this._identifyService(port)
            };
            ports.push(portInfo);
          }
        } else {
          // Debug log for unmatched LISTEN/UNCONN lines
          logger.debug(`Unmatched ss ${parts[0]} line: ${trimmedLine}`);
        }
      }
    }

    logger.info(`📊 Parsed ${ports.length} ports from ss output`);
    
    return ports;
  }

  /**
   * Get all system ports currently in use
   * @param {string} server - Server to check
   * @returns {Promise<Array>}
   */
  async getSystemPortsInUse(server = 'localhost') {
    try {
      logger.info(`🔍 Getting system ports in use for server: ${server}`);
      
      // For remote servers, we need SSH or agent-based checking
      if (server !== 'localhost' && server !== '127.0.0.1') {
        logger.warn(`Remote port scanning for ${server} not implemented yet`);
        return [];
      }
      
      // Get listening ports using standard methods
      const listeningPorts = await this.getListeningPorts();
      logger.info(`✅ getListeningPorts returned ${listeningPorts.length} ports`);
      
      // Create a map to track all ports
      const portMap = new Map();
      
      // Add listening ports first
      listeningPorts.forEach(port => {
        const key = `${port.port}-${port.protocol || 'tcp'}`;
        portMap.set(key, {
          port: port.port,
          protocol: port.protocol || 'tcp',
          service: port.service || this._identifyService(port.port),
          pid: port.pid,
          address: port.address || port.host || '0.0.0.0',
          source: 'system'
        });
      });
      
      // If running in Docker, always check common ports via socket
      // This is necessary because ss/netstat only see the container's namespace
      if (this.isDocker) {
        logger.info('🔍 Running in Docker, checking host ports via socket...');
        
        const commonPorts = await this._checkCommonPortsViaSocket(server);
        logger.info(`✅ Socket check found ${commonPorts.length} host ports in use`);
        
        // Add socket-detected ports
        commonPorts.forEach(port => {
          const key = `${port.port}-${port.protocol}`;
          if (!portMap.has(key)) {
            portMap.set(key, port);
          }
        });
      }
      
      const systemPorts = Array.from(portMap.values());
      
      logger.info(`📊 Returning ${systemPorts.length} total system ports`);
      
      return systemPorts;
    } catch (error) {
      const portError = wrapPortError(error, {
        operation: 'scan',
        server
      });
      
      logger.error('Failed to get system ports in use', {
        server,
        error: portError.toJSON()
      });
      
      // For system port scanning, consider throwing instead of returning empty array
      // to distinguish between 'no ports' and 'scan failed'
      throw portError;
    }
  }

  /**
   * Check port availability on specific server
   * @param {number} port - Port to check
   * @param {string} protocol - Protocol
   * @param {string} server - Server to check
   * @returns {Promise<boolean>}
   */
  async checkPort(port, protocol = 'tcp', server = 'localhost') {
    try {
      // For local checks, use existing method
      if (server === 'localhost' || server === '127.0.0.1') {
        return await this.checkSinglePort(port, protocol, server);
      }
      
      // For remote servers, try socket connection
      return await this._checkRemotePort(port, protocol, server);
    } catch (error) {
      const portError = new PortCheckError(
        `Failed to check port ${port}/${protocol} on ${server}`,
        port,
        protocol,
        server,
        error
      );
      
      logger.error('Port availability check failed', {
        port,
        protocol,
        server,
        error: portError.toJSON()
      });
      
      // Re-throw to let caller handle the error appropriately
      throw portError;
    }
  }

  /**
   * Check multiple ports with protocol and server support
   * @param {Array<number>} ports - Ports to check
   * @param {string} protocol - Protocol
   * @param {string} server - Server to check
   * @returns {Promise<Object>}
   */
  async checkMultiplePorts(ports, protocol = 'tcp', server = 'localhost') {
    const results = {};
    
    // Use batch checking for efficiency
    const batchSize = 10;
    for (let i = 0; i < ports.length; i += batchSize) {
      const batch = ports.slice(i, i + batchSize);
      const batchPromises = batch.map(port => 
        this.checkPort(port, protocol, server)
          .then(available => ({ port, available }))
      );
      
      const batchResults = await Promise.all(batchPromises);
      for (const { port, available } of batchResults) {
        results[port] = available;
      }
    }
    
    return results;
  }

  /**
   * Check remote port availability
   * @private
   * @param {number} port - Port to check
   * @param {string} protocol - Protocol
   * @param {string} server - Server address
   * @returns {Promise<boolean>}
   */
  async _checkRemotePort(port, protocol, server) {
    if (protocol === 'udp') {
      // UDP checking is more complex, return unknown for now
      logger.debug(`UDP port checking for remote servers not implemented`);
      return true;
    }
    
    // For TCP, try to connect
    const { promisify } = require('util');
    const net = require('net');
    
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 2000; // 2 second timeout
      
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(false); // Port is in use
      });
      
      socket.on('error', () => {
        resolve(true); // Port is available
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(true); // Assume available if timeout
      });
      
      socket.connect(port, server);
    });
  }

  /**
   * Identify common services by port number
   * @private
   * @param {number} port - Port number
   * @returns {string}
   */
  _identifyService(port) {
    const commonPorts = {
      20: 'FTP-DATA',
      21: 'FTP',
      22: 'SSH',
      23: 'Telnet',
      25: 'SMTP',
      53: 'DNS',
      80: 'HTTP',
      110: 'POP3',
      143: 'IMAP',
      443: 'HTTPS',
      445: 'SMB',
      993: 'IMAPS',
      995: 'POP3S',
      587: 'SMTP-TLS',
      465: 'SMTPS',
      993: 'IMAPS',
      995: 'POP3S',
      
      // Web and Server Management
      8080: 'HTTP-Alt',
      8443: 'HTTPS-Alt',
      9000: 'Portainer',
      
      // Databases
      3306: 'MySQL',
      3307: 'MySQL-Alt',
      5432: 'PostgreSQL', 
      5433: 'PostgreSQL-Alt',
      6379: 'Redis',
      6380: 'Redis-Alt',
      27017: 'MongoDB',
      27018: 'MongoDB-Alt',
      1433: 'SQL-Server',
      1521: 'Oracle',
      5984: 'CouchDB',
      11211: 'Memcached',
      8086: 'InfluxDB',
      
      // Development
      3000: 'Node-Dev',
      3001: 'React-Dev/Grafana',
      5000: 'Flask-Dev',
      5173: 'Vite-Dev',
      4000: 'Dev-Server',
      8000: 'HTTP-Dev',
      8888: 'HTTP-Dev/Jupyter',
      
      // Monitoring & Analytics  
      9090: 'Prometheus',
      3001: 'Grafana',
      9200: 'Elasticsearch',
      9300: 'Elasticsearch-Node',
      5601: 'Kibana',
      8125: 'StatsD',
      4567: 'InfluxDB-Admin',
      
      // Container & Orchestration
      2375: 'Docker-API',
      2376: 'Docker-TLS',
      2377: 'Docker-Swarm',
      6443: 'Kubernetes-API',
      10250: 'Kubelet',
      
      // Message Queues
      5672: 'RabbitMQ',
      15672: 'RabbitMQ-Web',
      9092: 'Kafka',
      2181: 'Zookeeper',
      
      // File Systems & Storage
      2049: 'NFS',
      139: 'NetBIOS',
      445: 'SMB/CIFS',
      21: 'FTP',
      990: 'FTPS',
      
      // Directory Services
      389: 'LDAP',
      636: 'LDAPS',
      88: 'Kerberos',
      464: 'Kpasswd',
      
      // Network Services
      161: 'SNMP',
      162: 'SNMP-Trap',
      67: 'DHCP-Server',
      68: 'DHCP-Client',
      69: 'TFTP',
      
      // Media & Streaming
      8096: 'Jellyfin',
      32400: 'Plex',
      8989: 'Sonarr',
      7878: 'Radarr',
      8686: 'Lidarr',
      9117: 'Jackett',
      6767: 'Bazarr',
      8191: 'FlareSolverr',
      
      // Home Automation
      8123: 'Home-Assistant',
      1883: 'MQTT',
      8883: 'MQTT-TLS',
      
      // Backup & Sync
      8384: 'Syncthing',
      22000: 'Syncthing-Relay',
      
      // VPN
      1194: 'OpenVPN',
      500: 'IPSec',
      4500: 'IPSec-NAT',
      
      // Gaming
      25565: 'Minecraft',
      27015: 'Steam',
      
      // Misc Applications
      6052: 'X11-Forward',
      5900: 'VNC',
      3389: 'RDP'
    };
    
    // Check for common development port ranges
    if (port >= 3000 && port <= 3999) {
      return 'Dev-Server';
    } else if (port >= 8000 && port <= 8999) {
      return 'Web-Server';
    } else if (port >= 9000 && port <= 9999) {
      return 'Monitoring';
    } else if (port >= 4000 && port <= 4999) {
      return 'Application';
    } else if (port >= 5000 && port <= 5999) {
      return 'Service';
    } else if (port >= 7000 && port <= 7999) {
      return 'Custom-Service';
    } else if (port >= 32000 && port <= 65535) {
      return 'Dynamic/Private';
    }
    
    return commonPorts[port] || 'Unknown';
  }

  /**
   * Detect actual host machine IP addresses from network interfaces
   * @private
   * @returns {Promise<Array<string>>}
   */
  async _detectNetworkIPs() {
    const { execSync } = require('child_process');
    const detectedIPs = [];
    
    try {
      // Method 1: Use ip command to get all interface IPs
      const ipOutput = execSync('ip addr show | grep "inet " | grep -v "127.0.0.1" | awk \'{print $2}\' | cut -d/ -f1', 
                               { encoding: 'utf8', timeout: 3000 }).trim();
      
      if (ipOutput) {
        const ips = ipOutput.split('\n').filter(ip => ip && ip.match(/^\d+\.\d+\.\d+\.\d+$/));
        detectedIPs.push(...ips);
        logger.debug(`Found IPs via ip command: ${ips.join(', ')}`);
      }
    } catch (err) {
      logger.debug(`ip command failed: ${err.message}`);
    }

    try {
      // Method 2: Parse /proc/net/route to find network interfaces
      const routeOutput = execSync('cat /proc/net/route | tail -n +2', { encoding: 'utf8', timeout: 2000 });
      const routes = routeOutput.split('\n').filter(line => line.trim());
      
      for (const route of routes) {
        const parts = route.split('\t');
        if (parts.length >= 3) {
          const iface = parts[0];
          const dest = parts[1];
          
          // Look for non-loopback interfaces
          if (iface !== 'lo' && dest !== '00000000') {
            try {
              const ifaceIP = execSync(`ip addr show ${iface} | grep "inet " | awk '{print $2}' | cut -d/ -f1`, 
                                     { encoding: 'utf8', timeout: 1000 }).trim();
              if (ifaceIP && ifaceIP.match(/^\d+\.\d+\.\d+\.\d+$/) && !detectedIPs.includes(ifaceIP)) {
                detectedIPs.push(ifaceIP);
                logger.debug(`Found IP ${ifaceIP} on interface ${iface}`);
              }
            } catch (ifErr) {
              logger.debug(`Failed to get IP for interface ${iface}: ${ifErr.message}`);
            }
          }
        }
      }
    } catch (err) {
      logger.debug(`Route parsing failed: ${err.message}`);
    }

    // Remove Docker internal IPs (keep only host machine IPs)
    const filteredIPs = detectedIPs.filter(ip => {
      // Filter out Docker bridge IPs
      return !ip.startsWith('172.17.') && 
             !ip.startsWith('172.18.') && 
             !ip.startsWith('172.19.') && 
             !ip.startsWith('172.30.') &&
             ip !== '127.0.0.1';
    });

    logger.debug(`Filtered host IPs: ${filteredIPs.join(', ')}`);
    return filteredIPs;
  }

  /**
   * Detect the host IP address when running in Docker
   * @returns {Promise<string>}
   */
  async _detectHostIp() {
    if (this.hostIp) {
      return this.hostIp; // Return cached value
    }

    if (!this.isDocker) {
      this.hostIp = 'localhost';
      return this.hostIp;
    }

    logger.info('🔍 Detecting host IP address from Docker container...');
    
    const { execSync } = require('child_process');
    
    // Method 1: Scan network interfaces for actual host IPs
    logger.info('🔍 Scanning network interfaces for host machine IPs...');
    const networkIPs = await this._detectNetworkIPs();
    
    if (networkIPs.length > 0) {
      logger.info(`🔍 Found potential host IPs: ${networkIPs.join(', ')}`);
      
      // Test each IP to see which one can reach common services
      for (const ip of networkIPs) {
        logger.debug(`🧪 Testing connectivity to ${ip}...`);
        if (await this._testHostConnectivity(ip)) {
          this.hostIp = ip;
          logger.info(`✅ Detected and verified actual host IP: ${this.hostIp}`);
          return this.hostIp;
        } else {
          logger.debug(`❌ Host IP ${ip} not reachable`);
        }
      }
    }
    
    // Method 2: Try to get the default gateway (Docker gateway, not actual host)
    const gatewayCommands = [
      'ip route show default | awk \'/default/ {print $3}\'',
      'ip route | grep default | awk \'{print $3}\'',
      'route -n | grep "^0.0.0.0" | awk \'{print $2}\'',
      'cat /proc/net/route | awk \'$2 == "00000000" {print $3}\' | head -1 | sed \'s/../&:/g; s/:$//; s/\\(..\\):\\(..\\):\\(..\\):\\(..\\)/\\4.\\3.\\2.\\1/\''
    ];

    logger.debug('🔍 Trying gateway detection as fallback...');
    for (const cmd of gatewayCommands) {
      try {
        const result = execSync(cmd, { encoding: 'utf8', timeout: 2000 }).trim();
        if (result && result.match(/^\d+\.\d+\.\d+\.\d+$/)) {
          // Test connectivity but mark as gateway IP
          if (await this._testHostConnectivity(result)) {
            this.hostIp = result;
            logger.info(`✅ Detected Docker gateway IP as fallback: ${this.hostIp}`);
            return this.hostIp;
          } else {
            logger.debug(`Gateway IP ${result} found but not reachable`);
          }
        }
      } catch (err) {
        logger.debug(`Gateway command failed: ${cmd.split('|')[0]} - ${err.message}`);
      }
    }

    // Method 2: Try to get host IP from container's network interface
    try {
      const result = execSync('ip route get 1.1.1.1 | awk \'{print $7; exit}\'', { encoding: 'utf8', timeout: 2000 }).trim();
      if (result && result.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        // Get the gateway for this interface
        const gateway = execSync(`ip route | grep ${result} | grep default | awk '{print $3}'`, { encoding: 'utf8', timeout: 1000 }).trim();
        if (gateway && gateway.match(/^\d+\.\d+\.\d+\.\d+$/)) {
          if (await this._testHostConnectivity(gateway)) {
            this.hostIp = gateway;
            logger.info(`✅ Detected and verified host IP via interface route: ${this.hostIp}`);
            return this.hostIp;
          }
        }
      }
    } catch (err) {
      logger.debug(`Interface route detection failed: ${err.message}`);
    }

    // Method 3: Check Docker environment variables
    const dockerHostVars = [
      process.env.DOCKER_HOST_IP,
      process.env.HOST_IP,
      process.env.DOCKER_GATEWAY_IP
    ];
    
    for (const envIP of dockerHostVars) {
      if (envIP && envIP.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        if (await this._testHostConnectivity(envIP)) {
          this.hostIp = envIP;
          logger.info(`✅ Detected host IP from environment variable: ${this.hostIp}`);
          return this.hostIp;
        }
      }
    }

    // Method 4: Test common Docker host addresses and network ranges
    const commonHosts = [
      'host.docker.internal',
      '172.17.0.1',  // Default Docker bridge
      '172.18.0.1',  // Alternative bridge
      '172.19.0.1',  // Another alternative
      '172.20.0.1',  // Docker Compose networks
      '10.0.2.2',    // VirtualBox
      '192.168.65.2', // Docker Desktop
      '192.168.0.1', // Common router IP
      '192.168.1.1'  // Another common router IP
    ];

    // Add common 10.0.0.x addresses (since host is 10.0.0.9)
    for (let i = 1; i <= 20; i++) {
      commonHosts.push(`10.0.0.${i}`);
    }

    // Add common 192.168.x.x addresses
    for (let subnet = 0; subnet <= 2; subnet++) {
      for (let host = 1; host <= 10; host++) {
        commonHosts.push(`192.168.${subnet}.${host}`);
      }
    }

    logger.info('🧪 Testing common Docker host addresses and network ranges...');
    for (const host of commonHosts) {
      if (await this._testHostConnectivity(host)) {
        this.hostIp = host;
        logger.info(`✅ Detected working host IP: ${this.hostIp}`);
        return this.hostIp;
      }
    }

    // Method 5: Parse /etc/hosts for host.docker.internal or other host entries
    try {
      const hostsFile = execSync('cat /etc/hosts 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 1000 });
      const lines = hostsFile.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 2) {
            const ip = parts[0];
            const hostnames = parts.slice(1);
            
            if (ip.match(/^\d+\.\d+\.\d+\.\d+$/) && 
                (hostnames.includes('host.docker.internal') || 
                 hostnames.some(h => h.includes('host')) ||
                 hostnames.some(h => h.includes('gateway')))) {
              
              if (await this._testHostConnectivity(ip)) {
                this.hostIp = ip;
                logger.info(`✅ Detected host IP from /etc/hosts: ${this.hostIp} (${hostnames.join(', ')})`);
                return this.hostIp;
              }
            }
          }
        }
      }
    } catch (err) {
      logger.debug(`Failed to parse /etc/hosts: ${err.message}`);
    }

    // Fallback
    logger.warn('⚠️ Could not detect host IP, falling back to localhost');
    this.hostIp = 'localhost';
    return this.hostIp;
  }

  /**
   * Test if a host is reachable by trying to connect to common ports
   * @private
   */
  async _testHostConnectivity(host) {
    // Try multiple common ports to increase chance of detection
    const testPorts = [22, 80, 443, 8080, 53];
    
    for (const port of testPorts) {
      const isReachable = await new Promise((resolve) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
          socket.destroy();
          resolve(false);
        }, 500);

        socket.connect(port, host, () => {
          clearTimeout(timeout);
          socket.destroy();
          logger.debug(`✅ Host ${host} is reachable on port ${port}`);
          resolve(true);
        });

        socket.on('error', (err) => {
          clearTimeout(timeout);
          socket.destroy();
          // ECONNREFUSED is actually a good sign - the host exists but port is closed
          if (err.code === 'ECONNREFUSED') {
            logger.debug(`✅ Host ${host} is reachable (port ${port} refused connection)`);
            resolve(true);
          } else {
            // Other errors like EHOSTUNREACH, ENOTFOUND mean host is not reachable
            resolve(false);
          }
        });
      });
      
      if (isReachable) {
        return true;
      }
    }
    
    logger.debug(`❌ Host ${host} is not reachable on any test ports`);
    return false;
  }


  /**
   * Check common ports via socket connection
   * @private
   * @param {string} server - Server to check
   * @returns {Promise<Array>}
   */
  async _checkCommonPortsViaSocket(server) {
    // Determine the correct host to check
    let targetHost = server;
    
    if (this.isDocker && (server === 'localhost' || server === '127.0.0.1')) {
      // Use the detected host IP
      targetHost = await this._detectHostIp();
      logger.info(`🎯 Using detected host IP for port scanning: ${targetHost}`);
    }

    const commonPortsList = [
      // System services
      { port: 22, service: 'SSH' },
      { port: 53, service: 'DNS' },
      { port: 80, service: 'HTTP' },
      { port: 443, service: 'HTTPS' },
      
      // Database services
      { port: 3306, service: 'MySQL' },
      { port: 5432, service: 'PostgreSQL' },
      { port: 6379, service: 'Redis' },
      { port: 27017, service: 'MongoDB' },
      { port: 11211, service: 'Memcached' },
      
      // Container & orchestration
      { port: 2375, service: 'Docker' },
      { port: 2376, service: 'Docker-TLS' },
      { port: 9000, service: 'Portainer' },
      { port: 9443, service: 'Portainer-SSL' },
      
      // Unraid specific
      { port: 6901, service: 'Unraid-Nginx' },
      { port: 7000, service: 'Unraid-Docker' },
      
      // Web servers & proxies
      { port: 8080, service: 'HTTP-Alt' },
      { port: 8443, service: 'HTTPS-Alt' },
      { port: 8000, service: 'HTTP-Dev' },
      { port: 8888, service: 'HTTP-Alt2' },
      
      // Media servers
      { port: 32400, service: 'Plex' },
      { port: 8096, service: 'Jellyfin' },
      { port: 8989, service: 'Sonarr' },
      { port: 7878, service: 'Radarr' },
      { port: 8686, service: 'Lidarr' },
      { port: 9117, service: 'Jackett' },
      
      // Monitoring
      { port: 9090, service: 'Prometheus' },
      { port: 3001, service: 'Grafana' },
      { port: 9200, service: 'Elasticsearch' },
      { port: 5601, service: 'Kibana' },
      
      // Development
      { port: 3000, service: 'Node-Dev' },
      { port: 5000, service: 'Flask-Dev' },
      { port: 5173, service: 'Vite-Dev' },
      { port: 4000, service: 'Dev-Server' },
      
      // Other common services
      { port: 1883, service: 'MQTT' },
      { port: 8123, service: 'Home-Assistant' },
      { port: 25565, service: 'Minecraft' },
      { port: 3389, service: 'RDP' },
      { port: 5900, service: 'VNC' }
    ];

    const detectedPorts = [];
    
    // Check ports in parallel with controlled concurrency
    const batchSize = 10;
    for (let i = 0; i < commonPortsList.length; i += batchSize) {
      const batch = commonPortsList.slice(i, i + batchSize);
      
      const checkPromises = batch.map(({ port, service }) => {
        return new Promise(async (resolve) => {
          // Try primary host first
          const tryHost = async (host) => {
            return new Promise((hostResolve) => {
              const socket = new net.Socket();
              const timeout = setTimeout(() => {
                socket.destroy();
                hostResolve(false);
              }, 300); // Shorter timeout for multiple attempts

              socket.connect(port, host, () => {
                clearTimeout(timeout);
                socket.destroy();
                logger.debug(`✅ Socket connected to port ${port} on ${host} - port is in use`);
                hostResolve(true);
              });

              socket.on('error', (err) => {
                clearTimeout(timeout);
                socket.destroy();
                if (err.code === 'ECONNREFUSED') {
                  // Port is explicitly closed/available
                  hostResolve(false);
                } else if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
                  // Host doesn't exist, try next
                  hostResolve('skip');
                } else {
                  hostResolve(false);
                }
              });
            });
          };

          // Try primary host
          const primaryResult = await tryHost(targetHost);
          if (primaryResult === true) {
            resolve({
              port,
              protocol: 'tcp',
              service: service || this._identifyService(port),
              pid: 'unknown',
              address: server,
              source: 'socket-scan'
            });
            return;
          }

          // If primary failed with host not found, try fallbacks
          if (primaryResult === 'skip') {
            const fallbackHosts = ['localhost', '127.0.0.1'];
            if (targetHost !== 'localhost' && targetHost !== '127.0.0.1') {
              fallbackHosts.push('172.17.0.1', 'host.docker.internal');
            }
            
            for (const fallbackHost of fallbackHosts) {
              if (fallbackHost === targetHost) continue; // Skip if same as primary
              
              const fallbackResult = await tryHost(fallbackHost);
              if (fallbackResult === true) {
                logger.debug(`✅ Port ${port} found via fallback host: ${fallbackHost}`);
                resolve({
                  port,
                  protocol: 'tcp',
                  service: service || this._identifyService(port),
                  pid: 'unknown',
                  address: server,
                  source: 'socket-scan'
                });
                return;
              }
            }
          }

          resolve(null);
        });
      });

      const results = await Promise.all(checkPromises);
      const foundPorts = results.filter(r => r !== null);
      if (foundPorts.length > 0) {
        logger.debug(`Batch found ${foundPorts.length} ports: ${foundPorts.map(p => p.port).join(', ')}`);
      }
      detectedPorts.push(...foundPorts);
      
      // Small delay between batches to avoid overwhelming the system
      if (i + batchSize < commonPortsList.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    logger.info(`🔍 Socket scan complete: found ${detectedPorts.length} ports in use`);
    if (detectedPorts.length > 0) {
      const portList = detectedPorts.map(p => `${p.port}(${p.service})`).join(', ');
      logger.info(`📋 Detected ports: ${portList}`);
    } else {
      logger.warn(`⚠️ No ports detected via socket scan - host may not be accessible from container`);
    }

    return detectedPorts;
  }
}

module.exports = PortAvailabilityChecker;