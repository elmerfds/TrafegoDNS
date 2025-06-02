const PortRepository = require('../../../database/repository/portRepository');
const PortScanRepository = require('../../../database/repository/portScanRepository');
const PortAlertRepository = require('../../../database/repository/portAlertRepository');
const { paginateResults } = require('../utils/paginationUtils');
const logger = require('../../../utils/logger');

/**
 * Controller for port management operations
 */
class PortController {
  constructor(database, portMonitor) {
    this.db = database;
    this.portMonitor = portMonitor;
    this.portRepository = new PortRepository(database);
    this.scanRepository = new PortScanRepository(database);
    this.alertRepository = new PortAlertRepository(database);
  }

  /**
   * Get all ports with optional filtering and pagination
   */
  async getAllPorts(req, res) {
    try {
      const {
        host,
        status,
        protocol,
        container_id,
        service_name,
        port_range,
        page = 1,
        limit = 50,
        sort_by = 'host',
        sort_order = 'asc'
      } = req.query;

      const filters = {
        host,
        status,
        protocol,
        container_id,
        service_name,
        port_range
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      // Get total count for pagination
      const totalCount = await this.portRepository.getPortCount(filters);

      // Add pagination to filters
      const offset = (parseInt(page) - 1) * parseInt(limit);
      filters.limit = parseInt(limit);
      filters.offset = offset;

      // Get ports
      const ports = await this.portRepository.getAllPorts(filters);

      // Apply sorting if not default
      if (sort_by !== 'host' || sort_order !== 'asc') {
        ports.sort((a, b) => {
          let aVal = a[sort_by];
          let bVal = b[sort_by];
          
          if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
          }
          
          if (sort_order === 'desc') {
            return bVal > aVal ? 1 : -1;
          } else {
            return aVal > bVal ? 1 : -1;
          }
        });
      }

      const paginatedResult = paginateResults(
        ports,
        parseInt(page),
        parseInt(limit),
        totalCount
      );

      res.json({
        success: true,
        data: paginatedResult.data,
        pagination: paginatedResult.pagination
      });

    } catch (error) {
      logger.error('Failed to get ports:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve ports',
        error: error.message
      });
    }
  }

  /**
   * Get ports for a specific host
   */
  async getPortsByHost(req, res) {
    try {
      const { host } = req.params;
      const ports = await this.portRepository.getPortsByHost(host);

      res.json({
        success: true,
        data: ports,
        total: ports.length
      });

    } catch (error) {
      logger.error(`Failed to get ports for host ${req.params.host}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve host ports',
        error: error.message
      });
    }
  }

  /**
   * Get ports for a specific container
   */
  async getPortsByContainer(req, res) {
    try {
      const { containerId } = req.params;
      const ports = await this.portRepository.getPortsByContainer(containerId);

      res.json({
        success: true,
        data: ports,
        total: ports.length
      });

    } catch (error) {
      logger.error(`Failed to get ports for container ${req.params.containerId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve container ports',
        error: error.message
      });
    }
  }

  /**
   * Get a specific port by ID
   */
  async getPortById(req, res) {
    try {
      const { id } = req.params;
      const port = await this.portRepository.getPortById(id);

      if (!port) {
        return res.status(404).json({
          success: false,
          message: 'Port not found'
        });
      }

      // Get alerts for this port
      const alerts = await this.alertRepository.getAlerts({ port_id: id });

      res.json({
        success: true,
        data: {
          ...port,
          alerts
        }
      });

    } catch (error) {
      logger.error(`Failed to get port ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve port',
        error: error.message
      });
    }
  }

  /**
   * Update port information
   */
  async updatePort(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Validate allowed fields
      const allowedFields = ['description', 'labels', 'service_name', 'service_version'];
      const filteredUpdates = {};
      
      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      });

      if (Object.keys(filteredUpdates).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update'
        });
      }

      const updatedPort = await this.portRepository.updatePort(id, filteredUpdates);

      if (!updatedPort) {
        return res.status(404).json({
          success: false,
          message: 'Port not found'
        });
      }

      res.json({
        success: true,
        data: updatedPort,
        message: 'Port updated successfully'
      });

    } catch (error) {
      logger.error(`Failed to update port ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to update port',
        error: error.message
      });
    }
  }

  /**
   * Delete a port
   */
  async deletePort(req, res) {
    try {
      const { id } = req.params;
      const success = await this.portRepository.deletePort(id);

      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Port not found'
        });
      }

      res.json({
        success: true,
        message: 'Port deleted successfully'
      });

    } catch (error) {
      logger.error(`Failed to delete port ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete port',
        error: error.message
      });
    }
  }

  /**
   * Trigger a port scan
   */
  async triggerScan(req, res) {
    try {
      const {
        host,
        port_range = '1-65535',
        protocols = ['tcp'],
        scan_type = 'manual'
      } = req.body;

      if (!host) {
        return res.status(400).json({
          success: false,
          message: 'Host is required'
        });
      }

      // Get user from token
      const user = req.user?.username || 'api';

      logger.info(`Starting port scan for ${host} requested by ${user}`);

      // Start scan asynchronously
      const scanPromise = this.portMonitor.scanHost(host, {
        port_range,
        protocols,
        scan_type,
        created_by: user
      });

      // Don't wait for completion, return immediately
      res.json({
        success: true,
        message: 'Port scan initiated',
        host,
        scan_parameters: {
          port_range,
          protocols,
          scan_type
        }
      });

      // Let scan continue in background
      scanPromise.catch(error => {
        logger.error(`Background scan failed for ${host}:`, error);
      });

    } catch (error) {
      logger.error('Failed to trigger port scan:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate port scan',
        error: error.message
      });
    }
  }

  /**
   * Get scan history
   */
  async getScanHistory(req, res) {
    try {
      const {
        host,
        scan_type,
        status,
        created_by,
        page = 1,
        limit = 20
      } = req.query;

      const filters = {
        host,
        scan_type,
        status,
        created_by,
        limit: parseInt(limit)
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const scans = await this.scanRepository.getRecentScans(filters);

      res.json({
        success: true,
        data: scans,
        total: scans.length
      });

    } catch (error) {
      logger.error('Failed to get scan history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve scan history',
        error: error.message
      });
    }
  }

  /**
   * Get active scans
   */
  async getActiveScans(req, res) {
    try {
      const activeScans = await this.scanRepository.getActiveScans();

      res.json({
        success: true,
        data: activeScans,
        total: activeScans.length
      });

    } catch (error) {
      logger.error('Failed to get active scans:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve active scans',
        error: error.message
      });
    }
  }

  /**
   * Cancel an active scan
   */
  async cancelScan(req, res) {
    try {
      const { scanId } = req.params;
      
      const success = await this.portMonitor.cancelScan(scanId);

      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Scan not found or already completed'
        });
      }

      res.json({
        success: true,
        message: 'Scan cancelled successfully'
      });

    } catch (error) {
      logger.error(`Failed to cancel scan ${req.params.scanId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel scan',
        error: error.message
      });
    }
  }

  /**
   * Get port statistics
   */
  async getPortStatistics(req, res) {
    try {
      const stats = await this.portRepository.getPortStatistics();
      const scanStats = await this.scanRepository.getScanStatistics();
      const alertStats = await this.alertRepository.getAlertStatistics();

      res.json({
        success: true,
        data: {
          ports: stats,
          scans: scanStats,
          alerts: alertStats
        }
      });

    } catch (error) {
      logger.error('Failed to get port statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve port statistics',
        error: error.message
      });
    }
  }

  /**
   * Get port alerts
   */
  async getPortAlerts(req, res) {
    try {
      const {
        port_id,
        alert_type,
        severity,
        acknowledged,
        host,
        page = 1,
        limit = 20
      } = req.query;

      const filters = {
        port_id,
        alert_type,
        severity,
        acknowledged: acknowledged !== undefined ? acknowledged === 'true' : undefined,
        host
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      // Get total count for pagination
      const totalCount = await this.alertRepository.getAlertCount(filters);

      // Add pagination
      const offset = (parseInt(page) - 1) * parseInt(limit);
      filters.limit = parseInt(limit);
      filters.offset = offset;

      const alerts = await this.alertRepository.getAlerts(filters);

      const paginatedResult = paginateResults(
        alerts,
        parseInt(page),
        parseInt(limit),
        totalCount
      );

      res.json({
        success: true,
        data: paginatedResult.data,
        pagination: paginatedResult.pagination
      });

    } catch (error) {
      logger.error('Failed to get port alerts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve port alerts',
        error: error.message
      });
    }
  }

  /**
   * Acknowledge port alerts
   */
  async acknowledgeAlert(req, res) {
    try {
      const { alertId } = req.params;
      const user = req.user?.username || 'api';

      const alert = await this.alertRepository.acknowledgeAlert(alertId, user);

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }

      res.json({
        success: true,
        data: alert,
        message: 'Alert acknowledged successfully'
      });

    } catch (error) {
      logger.error(`Failed to acknowledge alert ${req.params.alertId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to acknowledge alert',
        error: error.message
      });
    }
  }

  /**
   * Acknowledge multiple alerts
   */
  async acknowledgeMultipleAlerts(req, res) {
    try {
      const { alert_ids } = req.body;
      const user = req.user?.username || 'api';

      if (!Array.isArray(alert_ids) || alert_ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'alert_ids must be a non-empty array'
        });
      }

      const count = await this.alertRepository.acknowledgeAlerts(alert_ids, user);

      res.json({
        success: true,
        message: `${count} alerts acknowledged successfully`,
        acknowledged_count: count
      });

    } catch (error) {
      logger.error('Failed to acknowledge multiple alerts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to acknowledge alerts',
        error: error.message
      });
    }
  }

  /**
   * Export port data
   */
  async exportPorts(req, res) {
    try {
      const { format = 'json', host, status } = req.query;

      const filters = { host, status };
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const ports = await this.portRepository.getAllPorts(filters);

      if (format === 'csv') {
        const csv = this.convertToCSV(ports);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=ports.csv');
        res.send(csv);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=ports.json');
        res.json({
          export_date: new Date().toISOString(),
          total_ports: ports.length,
          filters,
          data: ports
        });
      }

    } catch (error) {
      logger.error('Failed to export port data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export port data',
        error: error.message
      });
    }
  }

  /**
   * Convert port data to CSV format
   */
  convertToCSV(ports) {
    if (ports.length === 0) {
      return 'No data available';
    }

    const headers = [
      'host', 'port', 'protocol', 'status', 'service_name', 'service_version',
      'description', 'container_id', 'container_name', 'first_seen', 'last_seen'
    ];

    const csvRows = [headers.join(',')];

    ports.forEach(port => {
      const row = headers.map(header => {
        let value = port[header] || '';
        if (typeof value === 'string' && value.includes(',')) {
          value = `"${value}"`;
        }
        return value;
      });
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }
}

module.exports = PortController;