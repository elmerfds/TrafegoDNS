/**
 * DNS Record Actions
 * Action handlers for DNS record operations
 */
const logger = require('../../utils/logger');

/**
 * Register DNS action handlers with the action broker
 * @param {ActionBroker} broker - The action broker
 * @param {Object} services - Application services
 */
function registerDnsActions(broker, services) {
  // Get DNS records
  broker.registerHandler('DNS_RECORDS_FETCH', async (action, broker) => {
    const { DNSManager } = services;
    if (!DNSManager) {
      throw new Error('DNS Manager not initialized');
    }

    try {
      // Get records from the provider
      const records = await DNSManager.dnsProvider.getRecordsFromCache(true);

      // Update state with the records
      broker.updateState('dns.records', records, action, 'dns:records:loaded');
      return records;
    } catch (error) {
      logger.error(`Failed to fetch DNS records: ${error.message}`);
      throw error;
    }
  });

  // Create DNS record
  broker.registerHandler('DNS_RECORD_CREATE', async (action, broker) => {
    const { DNSManager } = services;
    if (!DNSManager) {
      throw new Error('DNS Manager not initialized');
    }

    const { type, name, content, ttl, proxied } = action.payload;

    try {
      // Create record config
      const recordConfig = {
        type: type.toUpperCase(),
        name,
        content,
        ttl: ttl || DNSManager.config.defaultTTL,
        proxied: proxied === true
      };

      // Add type-specific fields if applicable
      if (type.toUpperCase() === 'MX' && action.payload.priority) {
        recordConfig.priority = parseInt(action.payload.priority);
      } else if (type.toUpperCase() === 'SRV') {
        if (action.payload.priority) recordConfig.priority = parseInt(action.payload.priority);
        if (action.payload.weight) recordConfig.weight = parseInt(action.payload.weight);
        if (action.payload.port) recordConfig.port = parseInt(action.payload.port);
      } else if (type.toUpperCase() === 'CAA') {
        if (action.payload.flags !== undefined) recordConfig.flags = parseInt(action.payload.flags);
        if (action.payload.tag) recordConfig.tag = action.payload.tag;
      }

      // Create the record
      const createdRecord = await DNSManager.dnsProvider.createRecord(recordConfig);

      // Track the record
      DNSManager.recordTracker.trackRecord(createdRecord);

      // Get current records and add the new one
      const currentRecords = broker.stateStore.getState('dns.records') || [];
      const updatedRecords = [...currentRecords, createdRecord];

      // Update state with enhanced event data
      broker.updateState('dns.records', updatedRecords, action, 'dns:record:created', {
        record: createdRecord
      });
      return createdRecord;
    } catch (error) {
      logger.error(`Failed to create DNS record: ${error.message}`);
      throw error;
    }
  });

  // Update DNS record
  broker.registerHandler('DNS_RECORD_UPDATE', async (action, broker) => {
    const { DNSManager } = services;
    if (!DNSManager) {
      throw new Error('DNS Manager not initialized');
    }

    const { id, content, ttl, proxied } = action.payload;

    try {
      // Get current records
      const records = broker.stateStore.getState('dns.records') || [];
      const recordToUpdate = records.find(r => r.id === id);

      if (!recordToUpdate) {
        throw new Error(`Record with ID ${id} not found`);
      }

      // Create update config
      const updateConfig = {
        ...recordToUpdate,
        content: content || recordToUpdate.content || recordToUpdate.data || recordToUpdate.value,
        ttl: ttl || recordToUpdate.ttl
      };

      // Only add proxied if explicitly provided
      if (proxied !== undefined) {
        updateConfig.proxied = proxied === true;
      }

      // Add type-specific fields if applicable
      if (recordToUpdate.type === 'MX' && action.payload.priority) {
        updateConfig.priority = parseInt(action.payload.priority);
      } else if (recordToUpdate.type === 'SRV') {
        if (action.payload.priority) updateConfig.priority = parseInt(action.payload.priority);
        if (action.payload.weight) updateConfig.weight = parseInt(action.payload.weight);
        if (action.payload.port) updateConfig.port = parseInt(action.payload.port);
      } else if (recordToUpdate.type === 'CAA') {
        if (action.payload.flags !== undefined) updateConfig.flags = parseInt(action.payload.flags);
        if (action.payload.tag) updateConfig.tag = action.payload.tag;
      }

      // Update the record
      const updatedRecord = await DNSManager.dnsProvider.updateRecord(id, updateConfig);

      // Track the updated record
      DNSManager.recordTracker.trackRecord(updatedRecord);

      // Update record in state
      const updatedRecords = records.map(r => 
        r.id === id ? updatedRecord : r
      );

      // Update state with enhanced event data
      broker.updateState('dns.records', updatedRecords, action, 'dns:record:updated', {
        record: updatedRecord
      });
      return updatedRecord;
    } catch (error) {
      logger.error(`Failed to update DNS record: ${error.message}`);
      throw error;
    }
  });

  // Delete DNS record
  broker.registerHandler('DNS_RECORD_DELETE', async (action, broker) => {
    const { DNSManager } = services;
    if (!DNSManager) {
      throw new Error('DNS Manager not initialized');
    }

    const { id } = action.payload;

    try {
      // Get current records
      const records = broker.stateStore.getState('dns.records') || [];
      const recordToDelete = records.find(r => r.id === id);

      if (!recordToDelete) {
        throw new Error(`Record with ID ${id} not found`);
      }

      // Delete the record
      await DNSManager.dnsProvider.deleteRecord(id);

      // Untrack the record
      DNSManager.recordTracker.untrackRecord(recordToDelete);

      // Remove record from state
      const updatedRecords = records.filter(r => r.id !== id);

      // Update state with enhanced event data
      broker.updateState('dns.records', updatedRecords, action, 'dns:record:deleted', {
        record: recordToDelete,
        reason: 'Deleted via API'
      });
      return { id, success: true };
    } catch (error) {
      logger.error(`Failed to delete DNS record: ${error.message}`);
      throw error;
    }
  });

  // Force DNS refresh
  broker.registerHandler('DNS_REFRESH', async (action, broker) => {
    const { DNSManager } = services;
    if (!DNSManager) {
      throw new Error('DNS Manager not initialized');
    }

    try {
      // Force a refresh
      await DNSManager.refreshRecords();
      
      // Get updated records
      const records = await DNSManager.dnsProvider.getRecordsFromCache(true);
      
      // Update state
      broker.updateState('dns.records', records, action, 'dns:records:refreshed');
      return { success: true };
    } catch (error) {
      logger.error(`Failed to refresh DNS records: ${error.message}`);
      throw error;
    }
  });
}

module.exports = { registerDnsActions };