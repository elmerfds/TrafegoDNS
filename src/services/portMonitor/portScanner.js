const { spawn } = require('child_process');
const { promisify } = require('util');
const net = require('net');
const PortRepository = require('../../database/repository/portRepository');
const PortScanRepository = require('../../database/repository/portScanRepository');
const PortAlertRepository = require('../../database/repository/portAlertRepository');
const logger = require('../../utils/logger');

/**
 * Port scanner implementation using multiple scanning methods
 */
class PortScanner {
  constructor(config, database) {
    this.config = config;
    this.db = database;
    
    // Initialize repositories
    this.portRepository = new PortRepository(database);
    this.scanRepository = new PortScanRepository(database);
    this.alertRepository = new PortAlertRepository(database);
    
    // Scanning configuration
    this.timeout = config.PORT_SCAN_TIMEOUT || 5000;
    this.concurrency = config.PORT_SCAN_CONCURRENCY || 100;
    this.useNmap = config.PORT_SCAN_USE_NMAP || false;
  }

  /**
   * Create a new scan record
   */
  async createScanRecord(scanData) {
    return this.scanRepository.createScan(scanData);
  }

  /**
   * Update scan record
   */
  async updateScan(scanId, updates) {
    return this.scanRepository.updateScan(scanId, updates);
  }

  /**
   * Complete scan record
   */
  async completeScan(scanId, results) {
    return this.scanRepository.completeScan(scanId, results);
  }

  /**
   * Get active scans
   */
  async getActiveScans() {
    return this.scanRepository.getActiveScans();
  }

  /**
   * Get scan history
   */
  async getScanHistory(filters = {}) {
    return this.scanRepository.getRecentScans(filters);
  }

  /**
   * Scan a host for open ports
   */
  async scanHost(host, options = {}) {
    try {
      const {
        port_range = '1-65535',
        protocols = ['tcp'],
        container_id,
        container_name
      } = options;

      logger.debug(`Scanning host ${host} with range ${port_range}`);

      let results = [];

      // Scan for each protocol
      for (const protocol of protocols) {
        const protocolResults = await this.scanProtocol(host, protocol, port_range);
        results = results.concat(protocolResults);
      }

      // If this is a container scan, also check Docker port mappings
      if (container_id) {
        const dockerPorts = await this.getDockerPortMappings(container_id);
        results = this.mergeDockerPorts(results, dockerPorts);
      }

      return results;

    } catch (error) {
      logger.error(`Failed to scan host ${host}:`, error);
      throw error;
    }
  }

  /**
   * Scan a specific protocol
   */
  async scanProtocol(host, protocol, portRange) {
    try {
      // Choose scanning method based on configuration and availability
      if (this.useNmap && await this.isNmapAvailable()) {
        return this.scanWithNmap(host, protocol, portRange);
      } else if (protocol === 'tcp') {
        return this.scanTcpPorts(host, portRange);
      } else if (protocol === 'udp') {
        return this.scanUdpPorts(host, portRange);
      } else {
        logger.warn(`Unsupported protocol for internal scanning: ${protocol}`);
        return [];
      }
    } catch (error) {
      logger.error(`Failed to scan ${protocol} ports on ${host}:`, error);
      throw error;
    }
  }

  /**
   * Check if nmap is available
   */
  async isNmapAvailable() {
    try {
      const { exec } = require('child_process');
      const execPromise = promisify(exec);
      
      await execPromise('which nmap');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Scan using nmap (if available)
   */
  async scanWithNmap(host, protocol, portRange) {
    return new Promise((resolve, reject) => {
      try {
        const args = [
          '-p', portRange,
          '--open',
          '-T4',
          '--max-retries', '1',
          '--host-timeout', `${this.timeout}ms`
        ];

        if (protocol === 'udp') {
          args.push('-sU');
        } else {
          args.push('-sS'); // TCP SYN scan
        }

        // Add service detection
        args.push('-sV', '--version-intensity', '0');

        // Output format
        args.push('-oX', '-'); // XML output to stdout

        args.push(host);

        const nmap = spawn('nmap', args);
        let output = '';
        let errorOutput = '';

        nmap.stdout.on('data', (data) => {
          output += data.toString();
        });

        nmap.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        nmap.on('close', (code) => {
          if (code !== 0) {
            logger.error(`nmap exited with code ${code}: ${errorOutput}`);
            reject(new Error(`nmap scan failed: ${errorOutput}`));
            return;
          }

          try {
            const results = this.parseNmapOutput(output, protocol);
            resolve(results);
          } catch (parseError) {
            logger.error('Failed to parse nmap output:', parseError);
            reject(parseError);
          }
        });

        nmap.on('error', (error) => {
          logger.error('nmap process error:', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Parse nmap XML output
   */
  parseNmapOutput(xmlOutput, protocol) {
    try {
      const results = [];
      
      // Simple XML parsing for port information
      const portRegex = /<port protocol="([^"]+)" portid="(\d+)">[\s\S]*?<state state="([^"]+)"[\s\S]*?(?:<service name="([^"]*)"[^>]*version="([^"]*)")?/g;
      
      let match;
      while ((match = portRegex.exec(xmlOutput)) !== null) {
        const [, portProtocol, portId, state, serviceName, serviceVersion] = match;
        
        if (portProtocol === protocol && state === 'open') {
          results.push({
            port: parseInt(portId),
            protocol: portProtocol,
            status: 'open',
            service: {
              name: serviceName || null,
              version: serviceVersion || null
            }
          });
        }
      }
      
      return results;
    } catch (error) {
      logger.error('Failed to parse nmap output:', error);
      return [];
    }
  }

  /**
   * Scan TCP ports using native Node.js
   */
  async scanTcpPorts(host, portRange) {
    try {
      const ports = this.parsePortRange(portRange);
      const results = [];
      
      // Batch ports to avoid overwhelming the system
      const batches = this.createBatches(ports, this.concurrency);
      
      for (const batch of batches) {
        const batchResults = await Promise.allSettled(
          batch.map(port => this.testTcpPort(host, port))
        );
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            results.push({
              port: batch[index],
              protocol: 'tcp',
              status: 'open'
            });
          }
        });
      }
      
      return results;
    } catch (error) {
      logger.error(`Failed to scan TCP ports on ${host}:`, error);
      throw error;
    }
  }

  /**
   * Test a single TCP port
   */
  async testTcpPort(host, port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let isResolved = false;

      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          socket.destroy();
          resolve(false);
        }
      }, this.timeout);

      socket.on('connect', () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          socket.destroy();
          resolve(true);
        }
      });

      socket.on('error', () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          resolve(false);
        }
      });

      socket.connect(port, host);
    });
  }

  /**
   * Scan UDP ports (basic implementation)
   */
  async scanUdpPorts(host, portRange) {
    try {
      // UDP scanning is more complex and less reliable without root privileges
      // This is a basic implementation that checks common UDP services
      const commonUdpPorts = [53, 67, 68, 69, 123, 161, 162, 514, 520, 631];
      const ports = this.parsePortRange(portRange).filter(p => commonUdpPorts.includes(p));
      const results = [];

      for (const port of ports) {
        const isOpen = await this.testUdpPort(host, port);
        if (isOpen) {
          results.push({
            port,
            protocol: 'udp',
            status: 'open'
          });
        }
      }

      return results;
    } catch (error) {
      logger.error(`Failed to scan UDP ports on ${host}:`, error);
      throw error;
    }
  }

  /**
   * Test a single UDP port (basic implementation)
   */
  async testUdpPort(host, port) {
    return new Promise((resolve) => {
      try {
        const dgram = require('dgram');
        const client = dgram.createSocket('udp4');
        let isResolved = false;

        const timeout = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            client.close();
            resolve(false);
          }
        }, this.timeout);

        client.on('message', () => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
            client.close();
            resolve(true);
          }
        });

        client.on('error', () => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
            client.close();
            resolve(false);
          }
        });

        // Send a test packet
        client.send(Buffer.from('test'), port, host);
      } catch (error) {
        resolve(false);
      }
    });
  }

  /**
   * Get Docker port mappings for a container
   */
  async getDockerPortMappings(containerId) {
    try {
      const { exec } = require('child_process');
      const execPromise = promisify(exec);
      
      const { stdout } = await execPromise(
        `docker inspect ${containerId} --format='{{json .NetworkSettings.Ports}}'`
      );
      
      const ports = JSON.parse(stdout.trim());
      const mappings = [];
      
      Object.entries(ports).forEach(([containerPort, hostPorts]) => {
        if (hostPorts) {
          const [port, protocol] = containerPort.split('/');
          hostPorts.forEach(hostPort => {
            mappings.push({
              container_port: parseInt(port),
              host_port: parseInt(hostPort.HostPort),
              protocol: protocol || 'tcp',
              host_ip: hostPort.HostIp || '0.0.0.0'
            });
          });
        }
      });
      
      return mappings;
    } catch (error) {
      logger.debug(`Failed to get Docker port mappings for ${containerId}:`, error);
      return [];
    }
  }

  /**
   * Merge Docker port information with scan results
   */
  mergeDockerPorts(scanResults, dockerPorts) {
    const merged = [...scanResults];
    
    dockerPorts.forEach(dockerPort => {
      const existing = merged.find(
        r => r.port === dockerPort.host_port && r.protocol === dockerPort.protocol
      );
      
      if (existing) {
        existing.docker_mapping = dockerPort;
      } else {
        // Add Docker-exposed port even if not detected in scan
        merged.push({
          port: dockerPort.host_port,
          protocol: dockerPort.protocol,
          status: 'open',
          docker_mapping: dockerPort,
          source: 'docker'
        });
      }
    });
    
    return merged;
  }

  /**
   * Parse port range string into array of port numbers
   */
  parsePortRange(portRange) {
    try {
      const ports = [];
      const ranges = portRange.split(',');
      
      ranges.forEach(range => {
        range = range.trim();
        
        if (range.includes('-')) {
          const [start, end] = range.split('-').map(p => parseInt(p.trim()));
          for (let port = start; port <= end; port++) {
            if (port >= 1 && port <= 65535) {
              ports.push(port);
            }
          }
        } else {
          const port = parseInt(range);
          if (port >= 1 && port <= 65535) {
            ports.push(port);
          }
        }
      });
      
      return [...new Set(ports)].sort((a, b) => a - b);
    } catch (error) {
      logger.error(`Failed to parse port range: ${portRange}`, error);
      return [];
    }
  }

  /**
   * Create batches of items for concurrent processing
   */
  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Scan local host using system commands
   */
  async scanLocalHost() {
    try {
      const results = [];
      
      // Try netstat first
      try {
        const netstatResults = await this.scanWithNetstat();
        results.push(...netstatResults);
      } catch (error) {
        logger.debug('netstat scan failed:', error);
      }
      
      // Try ss if netstat failed or for additional information
      try {
        const ssResults = await this.scanWithSs();
        // Merge with netstat results, preferring ss data
        const merged = this.mergeLocalScanResults(results, ssResults);
        return merged;
      } catch (error) {
        logger.debug('ss scan failed:', error);
      }
      
      return results;
    } catch (error) {
      logger.error('Failed to scan local host:', error);
      throw error;
    }
  }

  /**
   * Scan using netstat
   */
  async scanWithNetstat() {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      
      exec('netstat -tuln', (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        
        try {
          const results = this.parseNetstatOutput(stdout);
          resolve(results);
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
  }

  /**
   * Scan using ss (socket statistics)
   */
  async scanWithSs() {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      
      exec('ss -tuln', (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        
        try {
          const results = this.parseSsOutput(stdout);
          resolve(results);
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
  }

  /**
   * Parse netstat output
   */
  parseNetstatOutput(output) {
    const results = [];
    const lines = output.split('\n');
    
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4 && (parts[0] === 'tcp' || parts[0] === 'udp')) {
        const protocol = parts[0];
        const localAddress = parts[3];
        
        if (localAddress.includes(':')) {
          const lastColonIndex = localAddress.lastIndexOf(':');
          const port = parseInt(localAddress.substring(lastColonIndex + 1));
          const host = localAddress.substring(0, lastColonIndex) || '0.0.0.0';
          
          if (!isNaN(port) && port > 0) {
            results.push({
              port,
              protocol: protocol === 'tcp6' ? 'tcp' : protocol,
              status: 'open',
              host: host === '::' ? '::1' : (host === '0.0.0.0' ? 'localhost' : host),
              source: 'netstat'
            });
          }
        }
      }
    });
    
    return results;
  }

  /**
   * Parse ss output
   */
  parseSsOutput(output) {
    const results = [];
    const lines = output.split('\n');
    
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && (parts[0] === 'tcp' || parts[0] === 'udp')) {
        const protocol = parts[0];
        const localAddress = parts[4];
        
        if (localAddress.includes(':')) {
          const lastColonIndex = localAddress.lastIndexOf(':');
          const port = parseInt(localAddress.substring(lastColonIndex + 1));
          const host = localAddress.substring(0, lastColonIndex) || '0.0.0.0';
          
          if (!isNaN(port) && port > 0) {
            results.push({
              port,
              protocol,
              status: 'open',
              host: host === '::' ? '::1' : (host === '0.0.0.0' ? 'localhost' : host),
              source: 'ss'
            });
          }
        }
      }
    });
    
    return results;
  }

  /**
   * Merge results from multiple local scan methods
   */
  mergeLocalScanResults(netstatResults, ssResults) {
    const merged = new Map();
    
    // Add netstat results
    netstatResults.forEach(result => {
      const key = `${result.host}:${result.port}:${result.protocol}`;
      merged.set(key, result);
    });
    
    // Add or update with ss results (prefer ss data)
    ssResults.forEach(result => {
      const key = `${result.host}:${result.port}:${result.protocol}`;
      merged.set(key, result);
    });
    
    return Array.from(merged.values());
  }
}

module.exports = PortScanner;