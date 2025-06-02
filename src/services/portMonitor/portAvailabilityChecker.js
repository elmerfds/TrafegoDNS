/**
 * Port Availability Checker
 * Handles real-time port availability checking using various methods
 */
const net = require('net');
const { spawn } = require('child_process');
const logger = require('../../utils/logger');

class PortAvailabilityChecker {
  constructor(config) {
    this.config = config;
    this.connectionTimeout = config.PORT_CHECK_TIMEOUT || 1000; // 1 second
    this.preferredMethod = config.PORT_CHECK_METHOD || 'socket'; // socket, netstat, ss
    this.cache = new Map();
    this.cacheTimeout = config.PORT_CACHE_TIMEOUT || 5000; // 5 seconds
  }

  /**
   * Check if a single port is available
   * @param {number} port - Port to check
   * @param {string} protocol - Protocol (tcp/udp)
   * @param {string} host - Host to check (default: localhost)
   * @returns {Promise<boolean>}
   */
  async checkSinglePort(port, protocol = 'tcp', host = 'localhost') {
    const cacheKey = `${host}:${port}:${protocol}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.available;
    }

    try {
      let available = false;
      
      switch (this.preferredMethod) {
        case 'netstat':
          available = await this._checkPortWithNetstat(port, protocol);
          break;
        case 'ss':
          available = await this._checkPortWithSs(port, protocol);
          break;
        case 'socket':
        default:
          available = await this._checkPortWithSocket(port, host, protocol);
          break;
      }

      // Cache the result
      this.cache.set(cacheKey, {
        available,
        timestamp: Date.now()
      });

      return available;
    } catch (error) {
      logger.debug(`Failed to check port ${port}: ${error.message}`);
      return false;
    }
  }

  /**
   * Check multiple ports availability
   * @param {Array<number>} ports - Ports to check
   * @param {string} protocol - Protocol (tcp/udp)
   * @param {string} host - Host to check
   * @returns {Promise<Object>} - Object with port as key and availability as value
   */
  async checkMultiplePorts(ports, protocol = 'tcp', host = 'localhost') {
    const results = {};
    const concurrency = this.config.PORT_CHECK_CONCURRENCY || 10;
    
    // Process ports in batches to control concurrency
    for (let i = 0; i < ports.length; i += concurrency) {
      const batch = ports.slice(i, i + concurrency);
      const batchPromises = batch.map(async (port) => {
        const available = await this.checkSinglePort(port, protocol, host);
        return { port, available };
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        const port = batch[index];
        if (result.status === 'fulfilled') {
          results[port] = result.value.available;
        } else {
          logger.debug(`Failed to check port ${port}: ${result.reason}`);
          results[port] = false;
        }
      });
    }

    return results;
  }

  /**
   * Get all listening ports on the system
   * @param {string} protocol - Protocol filter (tcp/udp)
   * @returns {Promise<Array<Object>>}
   */
  async getListeningPorts(protocol = null) {
    try {
      const method = this.config.SYSTEM_PORT_SCAN_METHOD || 'ss';
      
      switch (method) {
        case 'netstat':
          return await this._getListeningPortsWithNetstat(protocol);
        case 'ss':
        default:
          return await this._getListeningPortsWithSs(protocol);
      }
    } catch (error) {
      logger.error(`Failed to get listening ports: ${error.message}`);
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
   * Clear the availability cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp < this.cacheTimeout) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      cacheTimeout: this.cacheTimeout
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
      return await this._checkPortWithSs(port, protocol);
    }

    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(true); // If we can't connect, assume it's available
      }, this.connectionTimeout);

      socket.connect(port, host, () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(false); // Port is in use
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        socket.destroy();
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
      const args = ['-ln'];
      if (protocol) {
        args.push(protocol === 'udp' ? '-u' : '-t');
      }
      
      const netstat = spawn('netstat', args);
      let output = '';
      
      netstat.stdout.on('data', (data) => {
        output += data.toString();
      });

      netstat.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`netstat exited with code ${code}`));
          return;
        }

        const ports = this._parseNetstatOutput(output, protocol);
        resolve(ports);
      });

      netstat.on('error', (error) => {
        reject(error);
      });
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
      const args = ['-ln'];
      if (protocol) {
        args.push(protocol === 'udp' ? '-u' : '-t');
      }
      
      const ss = spawn('ss', args);
      let output = '';
      
      ss.stdout.on('data', (data) => {
        output += data.toString();
      });

      ss.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ss exited with code ${code}`));
          return;
        }

        const ports = this._parseSsOutput(output, protocol);
        resolve(ports);
      });

      ss.on('error', (error) => {
        reject(error);
      });
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

    for (const line of lines) {
      const match = line.match(/^(tcp|udp)\s+\d+\s+\d+\s+([^:]+):(\d+)\s+/);
      if (match) {
        const [, lineProtocol, host, port] = match;
        
        if (!protocol || lineProtocol === protocol) {
          ports.push({
            port: parseInt(port),
            protocol: lineProtocol,
            host: host === '0.0.0.0' ? '*' : host,
            state: 'LISTEN'
          });
        }
      }
    }

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

    for (const line of lines) {
      // ss output format: State Recv-Q Send-Q Local Address:Port Peer Address:Port
      const parts = line.trim().split(/\s+/);
      
      if (parts.length >= 4 && (parts[0] === 'LISTEN' || parts[0] === 'UNCONN')) {
        const localAddress = parts[3];
        const match = localAddress.match(/^([^:]+):(\d+)$/);
        
        if (match) {
          const [, host, port] = match;
          const lineProtocol = parts[0] === 'UNCONN' ? 'udp' : 'tcp';
          
          if (!protocol || lineProtocol === protocol) {
            ports.push({
              port: parseInt(port),
              protocol: lineProtocol,
              host: host === '0.0.0.0' || host === '*' ? '*' : host,
              state: parts[0]
            });
          }
        }
      }
    }

    return ports;
  }
}

module.exports = PortAvailabilityChecker;