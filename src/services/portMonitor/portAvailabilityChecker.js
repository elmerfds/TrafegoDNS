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

  /**
   * Get all system ports currently in use
   * @param {string} server - Server to check
   * @returns {Promise<Array>}
   */
  async getSystemPortsInUse(server = 'localhost') {
    try {
      // For remote servers, we need SSH or agent-based checking
      if (server !== 'localhost' && server !== '127.0.0.1') {
        logger.warn(`Remote port scanning for ${server} not implemented yet`);
        return [];
      }
      
      const listeningPorts = await this.getListeningPorts();
      
      return listeningPorts.map(port => ({
        port: port.port,
        protocol: port.protocol || 'tcp',
        service: port.service || this._identifyService(port.port),
        pid: port.pid,
        address: port.address || '0.0.0.0'
      }));
    } catch (error) {
      logger.error(`Failed to get system ports in use: ${error.message}`);
      return [];
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
      logger.error(`Failed to check port ${port}/${protocol} on ${server}: ${error.message}`);
      return false;
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
      3306: 'MySQL',
      3307: 'MySQL-Alt',
      5432: 'PostgreSQL', 
      5433: 'PostgreSQL-Alt',
      6379: 'Redis',
      6380: 'Redis-Alt',
      8080: 'HTTP-Alt',
      8443: 'HTTPS-Alt',
      8000: 'HTTP-Dev',
      8888: 'HTTP-Dev',
      3000: 'Node-Dev',
      3001: 'React-Dev',
      5000: 'Flask-Dev',
      5173: 'Vite-Dev',
      4000: 'Dev-Server',
      9000: 'Portainer',
      9090: 'Prometheus',
      3001: 'Grafana',
      27017: 'MongoDB',
      27018: 'MongoDB-Alt',
      2375: 'Docker-API',
      2376: 'Docker-TLS',
      5672: 'RabbitMQ',
      15672: 'RabbitMQ-Web',
      9200: 'Elasticsearch',
      9300: 'Elasticsearch-Node',
      5601: 'Kibana',
      1433: 'SQL-Server',
      1521: 'Oracle',
      5984: 'CouchDB',
      11211: 'Memcached',
      6379: 'Redis',
      8086: 'InfluxDB',
      2049: 'NFS',
      139: 'NetBIOS',
      389: 'LDAP',
      636: 'LDAPS',
      161: 'SNMP',
      162: 'SNMP-Trap'
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
    }
    
    return commonPorts[port] || 'System';
  }
}

module.exports = PortAvailabilityChecker;