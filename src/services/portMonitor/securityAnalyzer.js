const PortAlertRepository = require('../../database/repository/portAlertRepository');
const logger = require('../../utils/logger');

/**
 * Security analyzer for port monitoring
 */
class SecurityAnalyzer {
  constructor(config, database) {
    this.config = config;
    this.db = database;
    this.alertRepository = new PortAlertRepository(database);
    
    // Security configuration
    this.enableSecurityAlerts = config.PORT_SECURITY_ALERTS || true;
    this.suspiciousPorts = this.initializeSuspiciousPorts();
    this.riskServices = this.initializeRiskServices();
    this.allowedPorts = new Set(config.PORT_SECURITY_ALLOWED_PORTS || []);
  }

  /**
   * Initialize list of suspicious ports that should trigger alerts
   */
  initializeSuspiciousPorts() {
    return {
      // Commonly exploited ports
      23: { risk: 'high', reason: 'Unencrypted Telnet service' },
      135: { risk: 'medium', reason: 'Windows RPC service' },
      139: { risk: 'medium', reason: 'NetBIOS session service' },
      445: { risk: 'high', reason: 'SMB service - frequent attack target' },
      1433: { risk: 'high', reason: 'SQL Server - should not be public' },
      1521: { risk: 'high', reason: 'Oracle database - should not be public' },
      3389: { risk: 'high', reason: 'RDP service - should be VPN protected' },
      5432: { risk: 'high', reason: 'PostgreSQL - should not be public' },
      3306: { risk: 'high', reason: 'MySQL - should not be public' },
      6379: { risk: 'high', reason: 'Redis - should not be public' },
      27017: { risk: 'high', reason: 'MongoDB - should not be public' },
      11211: { risk: 'medium', reason: 'Memcached - should not be public' },
      
      // Backdoor/malware ports
      1234: { risk: 'critical', reason: 'Common backdoor port' },
      4444: { risk: 'critical', reason: 'Common backdoor port' },
      5555: { risk: 'critical', reason: 'Common backdoor port' },
      6666: { risk: 'critical', reason: 'Common backdoor port' },
      7777: { risk: 'critical', reason: 'Common backdoor port' },
      8888: { risk: 'medium', reason: 'Alternative HTTP port - verify legitimacy' },
      9999: { risk: 'medium', reason: 'Common alternative service port' },
      
      // Development/debug ports
      3000: { risk: 'medium', reason: 'Development server - should not be in production' },
      4000: { risk: 'medium', reason: 'Development server - should not be in production' },
      5000: { risk: 'medium', reason: 'Development server - should not be in production' },
      8000: { risk: 'medium', reason: 'Development server - should not be in production' },
      9200: { risk: 'medium', reason: 'Elasticsearch - should be protected' },
      9300: { risk: 'medium', reason: 'Elasticsearch cluster - should be protected' }
    };
  }

  /**
   * Initialize risky services that should be monitored
   */
  initializeRiskServices() {
    return {
      // Unencrypted protocols
      'ftp': { risk: 'medium', reason: 'Unencrypted file transfer' },
      'telnet': { risk: 'high', reason: 'Unencrypted remote access' },
      'http': { risk: 'low', reason: 'Unencrypted web traffic' },
      'smtp': { risk: 'low', reason: 'Email service - ensure proper security' },
      'pop3': { risk: 'medium', reason: 'Unencrypted email retrieval' },
      'imap': { risk: 'medium', reason: 'Unencrypted email access' },
      
      // Database services
      'mysql': { risk: 'high', reason: 'Database service exposed' },
      'postgresql': { risk: 'high', reason: 'Database service exposed' },
      'mongodb': { risk: 'high', reason: 'Database service exposed' },
      'redis': { risk: 'high', reason: 'Cache/database service exposed' },
      'memcached': { risk: 'medium', reason: 'Cache service exposed' },
      'elasticsearch': { risk: 'medium', reason: 'Search engine exposed' },
      
      // Remote access
      'rdp': { risk: 'high', reason: 'Remote desktop exposed to internet' },
      'vnc': { risk: 'high', reason: 'VNC remote access exposed' },
      
      // Infrastructure
      'snmp': { risk: 'medium', reason: 'Network monitoring protocol' },
      'ldap': { risk: 'medium', reason: 'Directory service exposed' }
    };
  }

  /**
   * Analyze a port for security issues
   */
  async analyzePort(portRecord, serviceInfo) {
    try {
      if (!this.enableSecurityAlerts) {
        return;
      }

      logger.debug(`Analyzing security for port ${portRecord.host}:${portRecord.port}`);

      const alerts = [];

      // Check for suspicious ports
      const portAlert = this.checkSuspiciousPort(portRecord);
      if (portAlert) {
        alerts.push(portAlert);
      }

      // Check for risky services
      if (serviceInfo && serviceInfo.name) {
        const serviceAlert = this.checkRiskyService(portRecord, serviceInfo);
        if (serviceAlert) {
          alerts.push(serviceAlert);
        }
      }

      // Check for unexpected ports
      const unexpectedAlert = this.checkUnexpectedPort(portRecord);
      if (unexpectedAlert) {
        alerts.push(unexpectedAlert);
      }

      // Check for version vulnerabilities
      if (serviceInfo && serviceInfo.version) {
        const versionAlert = await this.checkServiceVersion(portRecord, serviceInfo);
        if (versionAlert) {
          alerts.push(versionAlert);
        }
      }

      // Create alerts in database
      for (const alert of alerts) {
        await this.createSecurityAlert(portRecord.id, alert);
      }

      // Check for patterns that might indicate compromise
      await this.checkForCompromiseIndicators(portRecord, serviceInfo);

    } catch (error) {
      logger.error(`Security analysis failed for port ${portRecord.id}:`, error);
    }
  }

  /**
   * Check if port is in suspicious list
   */
  checkSuspiciousPort(portRecord) {
    const suspiciousInfo = this.suspiciousPorts[portRecord.port];
    
    if (suspiciousInfo && !this.allowedPorts.has(portRecord.port)) {
      return {
        alert_type: 'suspicious_port',
        severity: this.mapRiskToSeverity(suspiciousInfo.risk),
        title: `Suspicious port ${portRecord.port} detected`,
        description: suspiciousInfo.reason
      };
    }

    return null;
  }

  /**
   * Check if service is risky
   */
  checkRiskyService(portRecord, serviceInfo) {
    const riskInfo = this.riskServices[serviceInfo.name];
    
    if (riskInfo) {
      return {
        alert_type: 'risky_service',
        severity: this.mapRiskToSeverity(riskInfo.risk),
        title: `Risky service detected: ${serviceInfo.name}`,
        description: `${riskInfo.reason} on port ${portRecord.port}`
      };
    }

    return null;
  }

  /**
   * Check for unexpected open ports
   */
  checkUnexpectedPort(portRecord) {
    // Check if this is a high port that appeared recently
    if (portRecord.port > 8000 && !this.isCommonHighPort(portRecord.port)) {
      return {
        alert_type: 'unexpected_open',
        severity: 'low',
        title: `Unexpected high port open: ${portRecord.port}`,
        description: `High port ${portRecord.port} is open on ${portRecord.host}`
      };
    }

    return null;
  }

  /**
   * Check if high port is commonly used
   */
  isCommonHighPort(port) {
    const commonHighPorts = [8080, 8443, 8888, 9000, 9090, 9200, 9300];
    return commonHighPorts.includes(port);
  }

  /**
   * Check service version for known vulnerabilities
   */
  async checkServiceVersion(portRecord, serviceInfo) {
    try {
      // This would integrate with vulnerability databases
      // For now, check for obviously outdated versions
      
      const vulnerableVersions = this.getKnownVulnerableVersions(serviceInfo.name);
      
      if (vulnerableVersions && serviceInfo.version) {
        const isVulnerable = vulnerableVersions.some(vulnVersion => 
          this.compareVersions(serviceInfo.version, vulnVersion) <= 0
        );
        
        if (isVulnerable) {
          return {
            alert_type: 'vulnerable_version',
            severity: 'high',
            title: `Vulnerable ${serviceInfo.name} version detected`,
            description: `Version ${serviceInfo.version} has known vulnerabilities`
          };
        }
      }

      return null;
    } catch (error) {
      logger.debug('Version vulnerability check failed:', error);
      return null;
    }
  }

  /**
   * Get known vulnerable versions for a service
   */
  getKnownVulnerableVersions(serviceName) {
    // This would be populated from vulnerability feeds
    // Simplified example data
    const knownVulnerabilities = {
      'apache': ['2.4.25', '2.4.20', '2.2.32'],
      'nginx': ['1.10.3', '1.12.0'],
      'mysql': ['5.7.17', '5.6.35'],
      'postgresql': ['9.6.1', '9.5.5'],
      'openssh': ['7.4', '7.3']
    };

    return knownVulnerabilities[serviceName.toLowerCase()];
  }

  /**
   * Simple version comparison
   */
  compareVersions(version1, version2) {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;
      
      if (v1part < v2part) return -1;
      if (v1part > v2part) return 1;
    }
    
    return 0;
  }

  /**
   * Check for indicators of compromise
   */
  async checkForCompromiseIndicators(portRecord, serviceInfo) {
    try {
      // Check for unusual port combinations on the same host
      const hostPorts = await this.getHostPorts(portRecord.host);
      
      // Look for patterns that might indicate malware
      const suspiciousPatterns = this.detectSuspiciousPatterns(hostPorts);
      
      for (const pattern of suspiciousPatterns) {
        await this.createSecurityAlert(portRecord.id, {
          alert_type: 'compromise_indicator',
          severity: 'critical',
          title: 'Potential compromise detected',
          description: pattern.description
        });
      }

    } catch (error) {
      logger.debug('Compromise indicator check failed:', error);
    }
  }

  /**
   * Get all ports for a host
   */
  async getHostPorts(host) {
    try {
      const stmt = this.db.prepare(`
        SELECT port, protocol, service_name, status 
        FROM ports 
        WHERE host = ? AND status = 'open'
        ORDER BY port
      `);
      
      return stmt.all(host);
    } catch (error) {
      logger.error(`Failed to get host ports for ${host}:`, error);
      return [];
    }
  }

  /**
   * Detect suspicious port patterns
   */
  detectSuspiciousPatterns(hostPorts) {
    const patterns = [];
    
    // Check for multiple backdoor ports
    const backdoorPorts = hostPorts.filter(p => 
      [1234, 4444, 5555, 6666, 7777].includes(p.port)
    );
    
    if (backdoorPorts.length > 1) {
      patterns.push({
        description: `Multiple potential backdoor ports detected: ${backdoorPorts.map(p => p.port).join(', ')}`
      });
    }

    // Check for unusual high port concentration
    const highPorts = hostPorts.filter(p => p.port > 8000);
    if (highPorts.length > 10) {
      patterns.push({
        description: `Unusual number of high ports open: ${highPorts.length} ports above 8000`
      });
    }

    // Check for database services on non-standard ports
    const dbServices = hostPorts.filter(p => 
      ['mysql', 'postgresql', 'mongodb', 'redis'].includes(p.service_name)
    );
    
    const nonStandardDbPorts = dbServices.filter(p => 
      !this.isStandardDbPort(p.service_name, p.port)
    );
    
    if (nonStandardDbPorts.length > 0) {
      patterns.push({
        description: `Database services on non-standard ports: ${nonStandardDbPorts.map(p => `${p.service_name}:${p.port}`).join(', ')}`
      });
    }

    return patterns;
  }

  /**
   * Check if port is standard for database service
   */
  isStandardDbPort(serviceName, port) {
    const standardPorts = {
      'mysql': [3306],
      'postgresql': [5432],
      'mongodb': [27017],
      'redis': [6379]
    };

    return standardPorts[serviceName]?.includes(port) || false;
  }

  /**
   * Create a security alert
   */
  async createSecurityAlert(portId, alertData) {
    try {
      // Check if similar alert already exists
      const existingAlert = await this.checkExistingAlert(portId, alertData.alert_type);
      
      if (!existingAlert) {
        await this.alertRepository.createAlert({
          port_id: portId,
          ...alertData
        });
        
        logger.info(`Security alert created: ${alertData.title}`);
      }
    } catch (error) {
      logger.error('Failed to create security alert:', error);
    }
  }

  /**
   * Check if similar alert already exists
   */
  async checkExistingAlert(portId, alertType) {
    try {
      const stmt = this.db.prepare(`
        SELECT id FROM port_alerts 
        WHERE port_id = ? AND alert_type = ? AND acknowledged = 0
        LIMIT 1
      `);
      
      return stmt.get(portId, alertType) !== undefined;
    } catch (error) {
      logger.error('Failed to check existing alerts:', error);
      return false;
    }
  }

  /**
   * Map risk level to alert severity
   */
  mapRiskToSeverity(riskLevel) {
    const mapping = {
      'low': 'low',
      'medium': 'medium',
      'high': 'high',
      'critical': 'critical'
    };
    
    return mapping[riskLevel] || 'medium';
  }

  /**
   * Get security statistics
   */
  async getSecurityStatistics() {
    try {
      const stats = {};
      
      // Alert counts by severity
      const severityStmt = this.db.prepare(`
        SELECT severity, COUNT(*) as count 
        FROM port_alerts 
        WHERE acknowledged = 0
        GROUP BY severity
      `);
      stats.alertsBySeverity = severityStmt.all().reduce((acc, row) => {
        acc[row.severity] = row.count;
        return acc;
      }, {});
      
      // Most alerting ports
      const portsStmt = this.db.prepare(`
        SELECT p.port, p.host, COUNT(pa.id) as alert_count
        FROM port_alerts pa
        JOIN ports p ON p.id = pa.port_id
        WHERE pa.acknowledged = 0
        GROUP BY p.port, p.host
        ORDER BY alert_count DESC
        LIMIT 10
      `);
      stats.mostAlertingPorts = portsStmt.all();
      
      // Alert types
      const typesStmt = this.db.prepare(`
        SELECT alert_type, COUNT(*) as count 
        FROM port_alerts 
        WHERE acknowledged = 0
        GROUP BY alert_type
      `);
      stats.alertsByType = typesStmt.all().reduce((acc, row) => {
        acc[row.alert_type] = row.count;
        return acc;
      }, {});
      
      return stats;
    } catch (error) {
      logger.error('Failed to get security statistics:', error);
      return {};
    }
  }

  /**
   * Run security audit on all open ports
   */
  async runSecurityAudit() {
    try {
      logger.info('Starting security audit...');
      
      const stmt = this.db.prepare(`
        SELECT * FROM ports 
        WHERE status = 'open'
        ORDER BY host, port
      `);
      
      const openPorts = stmt.all();
      let auditCount = 0;
      let alertCount = 0;
      
      for (const port of openPorts) {
        try {
          const beforeAlerts = await this.alertRepository.getAlertCount({ port_id: port.id, acknowledged: false });
          
          // Mock service info - in real implementation, this would come from recent scans
          const serviceInfo = {
            name: port.service_name,
            version: port.service_version
          };
          
          await this.analyzePort(port, serviceInfo);
          
          const afterAlerts = await this.alertRepository.getAlertCount({ port_id: port.id, acknowledged: false });
          alertCount += (afterAlerts - beforeAlerts);
          auditCount++;
          
        } catch (error) {
          logger.error(`Audit failed for port ${port.id}:`, error);
        }
      }
      
      logger.info(`Security audit completed: ${auditCount} ports audited, ${alertCount} new alerts created`);
      
      return {
        portsAudited: auditCount,
        newAlerts: alertCount
      };
      
    } catch (error) {
      logger.error('Security audit failed:', error);
      throw error;
    }
  }
}

module.exports = SecurityAnalyzer;