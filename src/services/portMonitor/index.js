const PortScanner = require('./portScanner');
const ServiceDetector = require('./serviceDetector');
const SecurityAnalyzer = require('./securityAnalyzer');
const EventBus = require('../../events/EventBus');
const EventTypes = require('../../events/EventTypes');
const logger = require('../../utils/logger');

/**
 * Main port monitoring service that orchestrates scanning, detection, and analysis
 */
class PortMonitor {
  constructor(config, database) {
    this.config = config;
    this.db = database;
    this.eventBus = EventBus.getInstance();
    
    // Initialize sub-services
    this.scanner = new PortScanner(config, database);
    this.serviceDetector = new ServiceDetector(config);
    this.securityAnalyzer = new SecurityAnalyzer(config, database);
    
    // Scanning state
    this.activeScanCallbacks = new Map();
    this.scanInterval = null;
    
    this.setupEventHandlers();
  }

  /**
   * Initialize the port monitor
   */
  async initialize() {
    try {
      logger.info('Initializing port monitor...');
      
      // Start automatic scanning if enabled
      if (this.config.PORT_MONITOR_AUTO_SCAN) {
        await this.startAutoScanning();
      }
      
      logger.info('Port monitor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize port monitor:', error);
      throw error;
    }
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Listen for container events to trigger targeted scans
    this.eventBus.on(EventTypes.CONTAINER_STARTED, this.handleContainerEvent.bind(this));
    this.eventBus.on(EventTypes.CONTAINER_STOPPED, this.handleContainerEvent.bind(this));
  }

  /**
   * Handle container lifecycle events
   */
  async handleContainerEvent(event) {
    try {
      const { container } = event;
      
      if (!container || !this.config.PORT_MONITOR_CONTAINER_SCAN) {
        return;
      }

      // Extract container IP and ports
      const containerIp = this.extractContainerIp(container);
      if (!containerIp) {
        return;
      }

      logger.debug(`Triggering port scan for container ${container.name} at ${containerIp}`);
      
      // Trigger a targeted scan for this container
      await this.scanHost(containerIp, {
        scan_type: 'container',
        container_id: container.id,
        container_name: container.name,
        triggered_by: 'container_event'
      });
      
    } catch (error) {
      logger.error('Error handling container event:', error);
    }
  }

  /**
   * Extract container IP address
   */
  extractContainerIp(container) {
    try {
      // Try different network configurations
      const networks = container.NetworkSettings?.Networks || {};
      
      for (const network of Object.values(networks)) {
        if (network.IPAddress) {
          return network.IPAddress;
        }
      }
      
      // Fallback to default gateway if available
      return container.NetworkSettings?.Gateway || null;
    } catch (error) {
      logger.debug('Could not extract container IP:', error);
      return null;
    }
  }

  /**
   * Start automatic scanning
   */
  async startAutoScanning() {
    try {
      const interval = this.config.PORT_MONITOR_SCAN_INTERVAL || 300000; // 5 minutes default
      
      logger.info(`Starting automatic port scanning with ${interval}ms interval`);
      
      this.scanInterval = setInterval(async () => {
        try {
          await this.performScheduledScan();
        } catch (error) {
          logger.error('Error in scheduled port scan:', error);
        }
      }, interval);
      
      // Perform initial scan
      await this.performScheduledScan();
      
    } catch (error) {
      logger.error('Failed to start auto scanning:', error);
      throw error;
    }
  }

  /**
   * Stop automatic scanning
   */
  stopAutoScanning() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      logger.info('Stopped automatic port scanning');
    }
  }

  /**
   * Perform a scheduled scan
   */
  async performScheduledScan() {
    try {
      const targets = this.config.PORT_MONITOR_TARGETS || ['localhost'];
      
      for (const target of targets) {
        await this.scanHost(target, {
          scan_type: 'scheduled',
          triggered_by: 'automatic'
        });
      }
      
    } catch (error) {
      logger.error('Error in scheduled scan:', error);
    }
  }

  /**
   * Scan a specific host for open ports
   */
  async scanHost(host, options = {}) {
    try {
      const {
        scan_type = 'manual',
        port_range,
        protocols = ['tcp'],
        created_by = 'system',
        container_id,
        container_name,
        callback
      } = options;

      logger.info(`Starting port scan for host: ${host}`);
      const startTime = Date.now();

      // Create scan record
      const scan = await this.scanner.createScanRecord({
        host,
        scan_type,
        created_by,
        metadata: {
          port_range,
          protocols,
          container_id,
          container_name,
          ...options
        }
      });

      // Store callback if provided
      if (callback) {
        this.activeScanCallbacks.set(scan.id, callback);
      }

      // Emit scan started event
      this.eventBus.emit(EventTypes.PORT_SCAN_STARTED, {
        scan,
        host,
        scan_type
      });

      try {
        // Perform the actual port scan
        const scanResults = await this.scanner.scanHost(host, {
          port_range,
          protocols,
          container_id,
          container_name
        });

        // Process scan results
        const processedResults = await this.processScanResults(
          scan.id,
          host,
          scanResults,
          options
        );

        // Update scan record with results
        const scanDuration = Date.now() - startTime;
        await this.scanner.completeScan(scan.id, {
          ports_discovered: processedResults.discovered,
          ports_changed: processedResults.changed,
          scan_duration: scanDuration
        });

        // Execute callback if provided
        if (callback) {
          try {
            await callback(null, processedResults);
          } catch (callbackError) {
            logger.error('Error in scan callback:', callbackError);
          }
          this.activeScanCallbacks.delete(scan.id);
        }

        // Emit scan completed event
        this.eventBus.emit(EventTypes.PORT_SCAN_COMPLETED, {
          scan_id: scan.id,
          host,
          results: processedResults,
          duration: scanDuration
        });

        logger.info(`Port scan completed for ${host}: ${processedResults.discovered} ports discovered, ${processedResults.changed} changes`);
        
        return processedResults;

      } catch (scanError) {
        // Handle scan failure
        await this.scanner.completeScan(scan.id, {
          error_message: scanError.message,
          scan_duration: Date.now() - startTime
        });

        // Execute callback with error
        if (callback) {
          try {
            await callback(scanError);
          } catch (callbackError) {
            logger.error('Error in scan error callback:', callbackError);
          }
          this.activeScanCallbacks.delete(scan.id);
        }

        // Emit scan failed event
        this.eventBus.emit(EventTypes.PORT_SCAN_FAILED, {
          scan_id: scan.id,
          host,
          error: scanError.message
        });

        throw scanError;
      }

    } catch (error) {
      logger.error(`Failed to scan host ${host}:`, error);
      throw error;
    }
  }

  /**
   * Process scan results and update database
   */
  async processScanResults(scanId, host, scanResults, options = {}) {
    try {
      const { container_id, container_name } = options;
      let discovered = 0;
      let changed = 0;

      // Process each discovered port
      for (const portData of scanResults) {
        const {
          port,
          protocol = 'tcp',
          status = 'open',
          service
        } = portData;

        // Detect service information
        const serviceInfo = await this.serviceDetector.detectService(
          host,
          port,
          protocol
        );

        // Create or update port record
        const portRecord = await this.scanner.portRepository.upsertPort({
          host,
          port,
          protocol,
          status,
          service_name: serviceInfo.name || service?.name,
          service_version: serviceInfo.version || service?.version,
          container_id,
          container_name
        });

        discovered++;

        // Check if this is a new port or status change
        const isNewOrChanged = await this.detectPortChange(
          scanId,
          portRecord,
          serviceInfo
        );

        if (isNewOrChanged) {
          changed++;
        }

        // Perform security analysis
        await this.securityAnalyzer.analyzePort(portRecord, serviceInfo);
      }

      // Mark missing ports as closed
      const closedPorts = await this.scanner.portRepository.markMissingPortsAsClosed(
        host,
        scanResults,
        scanId
      );

      changed += closedPorts;

      return {
        discovered,
        changed,
        closed: closedPorts,
        scan_id: scanId
      };

    } catch (error) {
      logger.error('Failed to process scan results:', error);
      throw error;
    }
  }

  /**
   * Detect if a port represents a new discovery or change
   */
  async detectPortChange(scanId, portRecord, serviceInfo) {
    try {
      // Check if this port was previously unknown or closed
      const historyStmt = this.db.prepare(`
        SELECT * FROM port_history 
        WHERE port_id = ? 
        ORDER BY detected_at DESC 
        LIMIT 1
      `);

      const lastHistory = historyStmt.get(portRecord.id);

      // If no history, this is a new port
      if (!lastHistory) {
        await this.recordPortChange(scanId, portRecord, 'discovered', null, serviceInfo);
        return true;
      }

      // Check for status changes
      if (lastHistory.new_status !== portRecord.status) {
        const changeType = portRecord.status === 'open' ? 'opened' : 'closed';
        await this.recordPortChange(scanId, portRecord, changeType, lastHistory.new_status, serviceInfo);
        return true;
      }

      // Check for service changes
      if (lastHistory.new_service !== portRecord.service_name) {
        await this.recordPortChange(scanId, portRecord, 'service_changed', null, serviceInfo);
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Failed to detect port change:', error);
      return false;
    }
  }

  /**
   * Record a port change in history
   */
  async recordPortChange(scanId, portRecord, changeType, oldStatus, serviceInfo) {
    try {
      const historyStmt = this.db.prepare(`
        INSERT INTO port_history (
          port_id, host, port, protocol, old_status, new_status,
          old_service, new_service, change_type, scan_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      historyStmt.run(
        portRecord.id,
        portRecord.host,
        portRecord.port,
        portRecord.protocol,
        oldStatus,
        portRecord.status,
        null, // old_service - would need to track this separately
        portRecord.service_name,
        changeType,
        scanId
      );

      // Emit port change event
      this.eventBus.emit(EventTypes.PORT_CHANGED, {
        port: portRecord,
        change_type: changeType,
        old_status: oldStatus,
        service_info: serviceInfo,
        scan_id: scanId
      });

    } catch (error) {
      logger.error('Failed to record port change:', error);
    }
  }

  /**
   * Get active scans
   */
  async getActiveScans() {
    return this.scanner.getActiveScans();
  }

  /**
   * Get scan history
   */
  async getScanHistory(filters = {}) {
    return this.scanner.getScanHistory(filters);
  }

  /**
   * Cancel an active scan
   */
  async cancelScan(scanId) {
    try {
      // Remove callback if exists
      this.activeScanCallbacks.delete(scanId);
      
      // Update scan status
      await this.scanner.updateScan(scanId, {
        status: 'cancelled',
        error_message: 'Scan cancelled by user'
      });

      logger.info(`Cancelled scan ${scanId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to cancel scan ${scanId}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup old records
   */
  async cleanup() {
    try {
      logger.info('Starting port monitor cleanup...');
      
      // Cleanup old scan records
      const scansDeleted = await this.scanner.scanRepository.cleanupOldScans(
        this.config.PORT_MONITOR_SCAN_RETENTION_DAYS || 30
      );
      
      // Cleanup old alerts
      const alertsDeleted = await this.scanner.alertRepository.cleanupOldAlerts(
        this.config.PORT_MONITOR_ALERT_RETENTION_DAYS || 90
      );
      
      logger.info(`Cleanup completed: ${scansDeleted} scans, ${alertsDeleted} alerts deleted`);
      
    } catch (error) {
      logger.error('Port monitor cleanup failed:', error);
    }
  }

  /**
   * Shutdown the port monitor
   */
  async shutdown() {
    try {
      logger.info('Shutting down port monitor...');
      
      this.stopAutoScanning();
      
      // Cancel any active scans
      for (const scanId of this.activeScanCallbacks.keys()) {
        await this.cancelScan(scanId);
      }
      
      logger.info('Port monitor shutdown complete');
    } catch (error) {
      logger.error('Error during port monitor shutdown:', error);
    }
  }
}

module.exports = PortMonitor;