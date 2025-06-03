const net = require('net');
const { promisify } = require('util');
const logger = require('../../utils/logger');

/**
 * Service detection for identified open ports
 */
class ServiceDetector {
  constructor(config) {
    this.config = config;
    this.timeout = config.SERVICE_DETECTION_TIMEOUT || 3000;
    this.enableBannerGrabbing = config.ENABLE_BANNER_GRABBING || false;
    
    // Known service patterns and default ports
    this.servicePatterns = this.initializeServicePatterns();
    this.commonPorts = this.initializeCommonPorts();
  }

  /**
   * Initialize service detection patterns
   */
  initializeServicePatterns() {
    return {
      http: [
        /HTTP\/\d\.\d/,
        /Server: /,
        /Content-Type: /,
        /<html/i,
        /<HTTP>/i
      ],
      https: [
        /HTTP\/\d\.\d/,
        /SSL/,
        /TLS/
      ],
      ssh: [
        /SSH-\d\.\d/,
        /OpenSSH/,
        /libssh/
      ],
      ftp: [
        /^220.*FTP/,
        /vsftpd/,
        /ProFTPD/,
        /FileZilla/
      ],
      smtp: [
        /^220.*SMTP/,
        /^220.*mail/i,
        /ESMTP/,
        /Postfix/,
        /Sendmail/
      ],
      pop3: [
        /^\+OK.*POP3/,
        /^\+OK.*ready/
      ],
      imap: [
        /^\* OK.*IMAP/,
        /^\* OK.*ready/,
        /Dovecot/
      ],
      telnet: [
        /Telnet/,
        /login:/,
        /Username:/
      ],
      mysql: [
        /mysql_native_password/,
        /MySQL/
      ],
      postgresql: [
        /PostgreSQL/,
        /FATAL.*database/
      ],
      redis: [
        /Redis/,
        /-ERR unknown command/
      ],
      mongodb: [
        /MongoDB/,
        /ismaster/
      ],
      dns: [
        /BIND/,
        /PowerDNS/
      ],
      ldap: [
        /LDAP/,
        /Active Directory/
      ],
      snmp: [
        /SNMP/,
        /community/
      ]
    };
  }

  /**
   * Initialize common port-to-service mappings
   */
  initializeCommonPorts() {
    return {
      20: 'ftp-data',
      21: 'ftp',
      22: 'ssh',
      23: 'telnet',
      25: 'smtp',
      53: 'dns',
      67: 'dhcp',
      68: 'dhcp',
      69: 'tftp',
      80: 'http',
      110: 'pop3',
      123: 'ntp',
      135: 'rpc',
      139: 'netbios',
      143: 'imap',
      161: 'snmp',
      162: 'snmp-trap',
      389: 'ldap',
      443: 'https',
      445: 'smb',
      465: 'smtps',
      514: 'syslog',
      520: 'rip',
      587: 'smtp',
      631: 'ipp',
      636: 'ldaps',
      993: 'imaps',
      995: 'pop3s',
      1433: 'mssql',
      1521: 'oracle',
      1883: 'mqtt',
      3306: 'mysql',
      3389: 'rdp',
      5432: 'postgresql',
      5672: 'amqp',
      5984: 'couchdb',
      6379: 'redis',
      8080: 'http-alt',
      8443: 'https-alt',
      9200: 'elasticsearch',
      9300: 'elasticsearch',
      11211: 'memcached',
      27017: 'mongodb'
    };
  }

  /**
   * Detect service running on a specific port
   */
  async detectService(host, port, protocol = 'tcp') {
    try {
      logger.debug(`Detecting service on ${host}:${port}/${protocol}`);

      const detection = {
        name: null,
        version: null,
        banner: null,
        confidence: 0,
        method: 'unknown'
      };

      // Start with port-based detection
      const portBasedService = this.detectByPort(port, protocol);
      if (portBasedService) {
        detection.name = portBasedService;
        detection.confidence = 30;
        detection.method = 'port';
      }

      // For TCP services, try banner grabbing if enabled
      if (protocol === 'tcp' && this.enableBannerGrabbing) {
        try {
          const bannerResult = await this.grabBanner(host, port);
          if (bannerResult) {
            detection.banner = bannerResult.banner;
            
            const serviceInfo = this.analyzeBanner(bannerResult.banner);
            if (serviceInfo.name) {
              detection.name = serviceInfo.name;
              detection.version = serviceInfo.version;
              detection.confidence = Math.max(detection.confidence, serviceInfo.confidence);
              detection.method = 'banner';
            }
          }
        } catch (bannerError) {
          logger.debug(`Banner grabbing failed for ${host}:${port}:`, bannerError);
        }
      }

      // Try HTTP detection for web services
      if (this.isWebPort(port) || detection.name === 'http' || detection.name === 'https') {
        try {
          const httpInfo = await this.detectHttpService(host, port);
          if (httpInfo) {
            detection.name = httpInfo.name || detection.name;
            detection.version = httpInfo.version || detection.version;
            detection.confidence = Math.max(detection.confidence, httpInfo.confidence);
            detection.method = 'http';
            detection.server = httpInfo.server;
            detection.title = httpInfo.title;
          }
        } catch (httpError) {
          logger.debug(`HTTP detection failed for ${host}:${port}:`, httpError);
        }
      }

      logger.debug(`Service detection result for ${host}:${port}: ${JSON.stringify(detection)}`);
      return detection;

    } catch (error) {
      logger.error(`Service detection failed for ${host}:${port}:`, error);
      return {
        name: null,
        version: null,
        banner: null,
        confidence: 0,
        method: 'error',
        error: error.message
      };
    }
  }

  /**
   * Detect service based on port number
   */
  detectByPort(port, protocol) {
    const service = this.commonPorts[port];
    
    if (service) {
      return service;
    }

    // Handle common port ranges
    if (port >= 1024 && port <= 5000) {
      return 'dynamic';
    }

    if (port >= 8000 && port <= 8999) {
      return 'http-alt';
    }

    if (port >= 9000 && port <= 9999) {
      return 'app-server';
    }

    return null;
  }

  /**
   * Grab banner from a TCP service
   */
  async grabBanner(host, port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let banner = '';
      let isResolved = false;

      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          socket.destroy();
          resolve(banner ? { banner: banner.trim() } : null);
        }
      }, this.timeout);

      socket.on('connect', () => {
        // Send common probes for different services
        socket.write('GET / HTTP/1.0\r\n\r\n'); // HTTP probe
      });

      socket.on('data', (data) => {
        banner += data.toString();
        
        // Stop collecting after reasonable amount of data
        if (banner.length > 2048) {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
            socket.destroy();
            resolve({ banner: banner.trim() });
          }
        }
      });

      socket.on('error', () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          resolve(banner ? { banner: banner.trim() } : null);
        }
      });

      socket.on('close', () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          resolve(banner ? { banner: banner.trim() } : null);
        }
      });

      socket.connect(port, host);
    });
  }

  /**
   * Analyze banner to identify service
   */
  analyzeBanner(banner) {
    const result = {
      name: null,
      version: null,
      confidence: 0
    };

    if (!banner) return result;

    const bannerLower = banner.toLowerCase();

    // Check against service patterns
    for (const [serviceName, patterns] of Object.entries(this.servicePatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(banner)) {
          result.name = serviceName;
          result.confidence = 70;
          
          // Try to extract version information
          const version = this.extractVersion(banner, serviceName);
          if (version) {
            result.version = version;
            result.confidence = 85;
          }
          
          return result;
        }
      }
    }

    // Fallback to keyword detection
    const keywords = {
      'apache': { name: 'http', confidence: 60 },
      'nginx': { name: 'http', confidence: 60 },
      'iis': { name: 'http', confidence: 60 },
      'openssh': { name: 'ssh', confidence: 80 },
      'mysql': { name: 'mysql', confidence: 75 },
      'postgresql': { name: 'postgresql', confidence: 75 },
      'redis': { name: 'redis', confidence: 75 },
      'mongodb': { name: 'mongodb', confidence: 75 }
    };

    for (const [keyword, info] of Object.entries(keywords)) {
      if (bannerLower.includes(keyword)) {
        result.name = info.name;
        result.confidence = info.confidence;
        
        const version = this.extractVersion(banner, keyword);
        if (version) {
          result.version = version;
          result.confidence += 10;
        }
        
        return result;
      }
    }

    return result;
  }

  /**
   * Extract version information from banner
   */
  extractVersion(banner, serviceName) {
    try {
      const versionPatterns = {
        apache: /Apache\/(\d+\.\d+\.\d+)/i,
        nginx: /nginx\/(\d+\.\d+\.\d+)/i,
        openssh: /OpenSSH_(\d+\.\d+)/i,
        mysql: /(\d+\.\d+\.\d+)/,
        postgresql: /PostgreSQL\s+(\d+\.\d+)/i,
        redis: /redis_version:(\d+\.\d+\.\d+)/i
      };

      const pattern = versionPatterns[serviceName.toLowerCase()];
      if (pattern) {
        const match = banner.match(pattern);
        return match ? match[1] : null;
      }

      // Generic version pattern
      const genericPattern = /(\d+\.\d+(?:\.\d+)?)/;
      const match = banner.match(genericPattern);
      return match ? match[1] : null;

    } catch (error) {
      logger.debug('Version extraction failed:', error);
      return null;
    }
  }

  /**
   * Detect HTTP-based services
   */
  async detectHttpService(host, port) {
    try {
      const isHttps = port === 443 || port === 8443;
      const protocol = isHttps ? 'https' : 'http';
      const url = `${protocol}://${host}:${port}/`;

      // Use a lightweight HTTP client
      const response = await this.makeHttpRequest(url);
      
      if (response) {
        const result = {
          name: isHttps ? 'https' : 'http',
          confidence: 60,
          server: response.server,
          title: response.title,
          statusCode: response.statusCode
        };

        // Analyze server header
        if (response.server) {
          const serverInfo = this.analyzeServerHeader(response.server);
          if (serverInfo.name) {
            result.name = serverInfo.name;
            result.version = serverInfo.version;
            result.confidence = 80;
          }
        }

        // Analyze response content for specific applications
        if (response.body) {
          const appInfo = this.analyzeHttpContent(response.body);
          if (appInfo.name) {
            result.name = appInfo.name;
            result.version = appInfo.version || result.version;
            result.confidence = Math.max(result.confidence, appInfo.confidence);
          }
        }

        return result;
      }

      return null;
    } catch (error) {
      logger.debug(`HTTP detection failed for ${host}:${port}:`, error);
      return null;
    }
  }

  /**
   * Make HTTP request for service detection
   */
  async makeHttpRequest(url) {
    return new Promise((resolve) => {
      try {
        const { request } = require(url.startsWith('https') ? 'https' : 'http');
        
        const options = {
          timeout: this.timeout,
          headers: {
            'User-Agent': 'TrafegoDNS-PortScanner/1.0'
          }
        };

        const req = request(url, options, (res) => {
          let body = '';
          
          res.on('data', (chunk) => {
            body += chunk.toString();
            // Limit body size for detection
            if (body.length > 4096) {
              res.destroy();
            }
          });

          res.on('end', () => {
            const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
            
            resolve({
              statusCode: res.statusCode,
              server: res.headers.server,
              title: titleMatch ? titleMatch[1].trim() : null,
              body: body.substring(0, 4096)
            });
          });
        });

        req.on('error', () => {
          resolve(null);
        });

        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });

        req.end();
      } catch (error) {
        resolve(null);
      }
    });
  }

  /**
   * Analyze server header for service identification
   */
  analyzeServerHeader(serverHeader) {
    const result = { name: null, version: null };

    if (!serverHeader) return result;

    const serverLower = serverHeader.toLowerCase();

    // Common web servers
    const serverPatterns = {
      apache: /apache\/(\d+\.\d+\.\d+)/i,
      nginx: /nginx\/(\d+\.\d+\.\d+)/i,
      iis: /microsoft-iis\/(\d+\.\d+)/i,
      lighttpd: /lighttpd\/(\d+\.\d+\.\d+)/i,
      caddy: /caddy\/(\d+\.\d+\.\d+)/i,
      traefik: /traefik\/(\d+\.\d+\.\d+)/i
    };

    for (const [name, pattern] of Object.entries(serverPatterns)) {
      const match = serverHeader.match(pattern);
      if (match) {
        result.name = name;
        result.version = match[1];
        return result;
      }
    }

    // Simple name detection
    if (serverLower.includes('apache')) result.name = 'apache';
    else if (serverLower.includes('nginx')) result.name = 'nginx';
    else if (serverLower.includes('iis')) result.name = 'iis';
    else if (serverLower.includes('lighttpd')) result.name = 'lighttpd';
    else if (serverLower.includes('caddy')) result.name = 'caddy';
    else if (serverLower.includes('traefik')) result.name = 'traefik';

    return result;
  }

  /**
   * Analyze HTTP content for application detection
   */
  analyzeHttpContent(content) {
    const result = { name: null, version: null, confidence: 0 };

    if (!content) return result;

    const contentLower = content.toLowerCase();

    // Application signatures
    const appSignatures = {
      wordpress: {
        patterns: [/wp-content/i, /wp-admin/i, /wordpress/i],
        versionPattern: /wordpress\s+(\d+\.\d+(?:\.\d+)?)/i,
        confidence: 85
      },
      drupal: {
        patterns: [/drupal/i, /sites\/default/i],
        versionPattern: /drupal\s+(\d+\.\d+)/i,
        confidence: 85
      },
      joomla: {
        patterns: [/joomla/i, /administrator\/index\.php/i],
        versionPattern: /joomla!\s+(\d+\.\d+)/i,
        confidence: 85
      },
      phpbb: {
        patterns: [/phpbb/i, /viewforum\.php/i],
        versionPattern: /phpbb\s+(\d+\.\d+)/i,
        confidence: 80
      },
      mediawiki: {
        patterns: [/mediawiki/i, /Special:Version/i],
        versionPattern: /mediawiki\s+(\d+\.\d+)/i,
        confidence: 80
      }
    };

    for (const [appName, signature] of Object.entries(appSignatures)) {
      const hasPattern = signature.patterns.some(pattern => pattern.test(content));
      
      if (hasPattern) {
        result.name = appName;
        result.confidence = signature.confidence;
        
        const versionMatch = content.match(signature.versionPattern);
        if (versionMatch) {
          result.version = versionMatch[1];
          result.confidence += 10;
        }
        
        return result;
      }
    }

    return result;
  }

  /**
   * Check if port is commonly used for web services
   */
  isWebPort(port) {
    const webPorts = [80, 443, 8000, 8080, 8443, 8888, 9000, 9090, 3000, 4000, 5000];
    return webPorts.includes(port);
  }

  /**
   * Get service confidence level description
   */
  getConfidenceDescription(confidence) {
    if (confidence >= 80) return 'High';
    if (confidence >= 60) return 'Medium';
    if (confidence >= 30) return 'Low';
    return 'Very Low';
  }
}

module.exports = ServiceDetector;