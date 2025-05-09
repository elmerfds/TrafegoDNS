/**
 * Record utility functions for DigitalOcean provider
 */
const logger = require('../../utils/logger');

/**
 * Prepare record for creation by formatting it for DigitalOcean
 */
function prepareRecordForCreation(record, domain) {
  // Make a copy of the record to avoid modifying the original
  const recordData = { ...record };
  
  // Handle the name format for DigitalOcean
  // DigitalOcean expects just the subdomain part, not the full domain
  const domainPart = `.${domain}`;
  if (recordData.name.endsWith(domainPart)) {
    recordData.name = recordData.name.slice(0, -domainPart.length);
    // If the name is exactly the domain, use @ for the apex
    if (recordData.name === '') {
      recordData.name = '@';
    }
  }
  
  // For apex domains being added via the @ symbol, we need special handling
  if (recordData.name === '@' && recordData.type === 'A') {
    logger.debug('Special handling for apex domain A record');
    
    // Log more details to help debug
    logger.debug(`Apex domain record details: 
      Name: ${recordData.name}
      Type: ${recordData.type}
      Content: ${recordData.content}
      TTL: ${recordData.ttl}
    `);
    
    // Make sure we have a valid IP
    if (!recordData.content.match(/^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$/)) {
      logger.error(`Invalid IP address for apex domain A record: ${recordData.content}`);
      throw new Error(`Invalid IP address format for apex domain A record: ${recordData.content}`);
    }
  }
  
  return recordData;
}

/**
 * Check if a record needs to be updated
 */
function recordNeedsUpdate(existing, newRecord, domain) {
  logger.trace(`Comparing records for ${newRecord.name}`);
  
  // Extract the correct content field based on record type
  let existingContent = existing.data;
  let newContent = newRecord.content;
  
  // Handle special case for apex domains in CNAME records
  if (existing.name === '@' && newContent === domain) {
    logger.trace(`Special case - apex domain matches domain name`);
    return false; // They're equivalent, no update needed
  }
  
  // Handle trailing dots for content comparison in relevant record types
  if (['CNAME', 'MX', 'SRV', 'NS'].includes(newRecord.type)) {
    // Normalize both contents by removing trailing dots for comparison
    if (existingContent && existingContent.endsWith('.')) {
      existingContent = existingContent.slice(0, -1);
    }
    if (newContent && newContent.endsWith('.')) {
      newContent = newContent.slice(0, -1);
    }
  }
  
  // Handle the case where existing content is full qualified with trailing dot
  // but new content is the domain name without dot
  if (existingContent && newContent) {
    if (existingContent === `${newContent}.`) {
      logger.trace(`Content matches with trailing dot difference`);
      existingContent = newContent; // They're equivalent
    }
    
    // Check if existing content is '@' and new content is the domain
    if (existingContent === '@' && newContent === domain) {
      logger.trace(`@ symbol matches domain name`);
      existingContent = newContent; // They're equivalent
    }
  }
  
  // Compare basic fields
  let needsUpdate = false;
  
  // Compare content/data
  if (existingContent !== newContent) {
    logger.trace(`Content different: ${existingContent} vs ${newContent}`);
    needsUpdate = true;
  }
  
  // Compare TTL
  if (existing.ttl !== newRecord.ttl) {
    logger.trace(`TTL different: ${existing.ttl} vs ${newRecord.ttl}`);
    needsUpdate = true;
  }
  
  // Type-specific field comparisons
  switch (newRecord.type) {
    case 'MX':
      if (existing.priority !== newRecord.priority) {
        logger.trace(`MX priority different: ${existing.priority} vs ${newRecord.priority}`);
        needsUpdate = true;
      }
      break;
      
    case 'SRV':
      if (existing.priority !== newRecord.priority ||
          existing.weight !== newRecord.weight ||
          existing.port !== newRecord.port) {
        logger.trace(`SRV fields different`);
        needsUpdate = true;
      }
      break;
      
    case 'CAA':
      if (existing.flags !== newRecord.flags ||
          existing.tag !== newRecord.tag) {
        logger.trace(`CAA fields different`);
        needsUpdate = true;
      }
      break;
  }
  
  // Log changes if update is needed and debug level is enabled
  if (needsUpdate && logger.level >= 3) { // DEBUG level or higher
    logger.debug(`Record ${newRecord.name} needs update:`);
    if (existingContent !== newContent) 
      logger.debug(` - Content: ${existingContent} → ${newContent}`);
    if (existing.ttl !== newRecord.ttl) 
      logger.debug(` - TTL: ${existing.ttl} → ${newRecord.ttl}`);
    
    // Log type-specific field changes
    switch (newRecord.type) {
      case 'MX':
        if (existing.priority !== newRecord.priority)
          logger.debug(` - Priority: ${existing.priority} → ${newRecord.priority}`);
        break;
        
      case 'SRV':
        if (existing.priority !== newRecord.priority)
          logger.debug(` - Priority: ${existing.priority} → ${newRecord.priority}`);
        if (existing.weight !== newRecord.weight)
          logger.debug(` - Weight: ${existing.weight} → ${newRecord.weight}`);
        if (existing.port !== newRecord.port)
          logger.debug(` - Port: ${existing.port} → ${newRecord.port}`);
        break;
        
      case 'CAA':
        if (existing.flags !== newRecord.flags)
          logger.debug(` - Flags: ${existing.flags} → ${newRecord.flags}`);
        if (existing.tag !== newRecord.tag)
          logger.debug(` - Tag: ${existing.tag} → ${newRecord.tag}`);
        break;
    }
  }
  
  return needsUpdate;
}

/**
 * Find a record in the recordCache
 * Handle DigitalOcean's @ symbol for apex domains and trailing dots for domains
 */
function findRecordInCache(recordCache, type, name, domain) {
  // First normalize the name to handle apex domain scenarios
  const domainPart = `.${domain}`;
  
  // If the name ends with the domain, extract the subdomain part
  let recordName = name;
  if (name.endsWith(domainPart)) {
    recordName = name.slice(0, -domainPart.length);
    // If the name is exactly the domain, use @ for the apex
    if (recordName === '') {
      recordName = '@';
    }
  }
  
  logger.trace(`Looking for ${type} record with name ${recordName}`);
  
  // For records that store the content with a trailing dot (like CNAME),
  // we need to handle both forms in our comparison
  const record = recordCache.records.find(r => 
    r.type === type && r.name === recordName
  );
  
  if (record) {
    logger.trace(`Found record with ID ${record.id}`);
    return record;
  }
  
  // Try once more without trailing dot for CNAME/MX/SRV records if we didn't find anything
  if (['CNAME', 'MX', 'SRV'].includes(type)) {
    logger.trace(`Trying alternate search without trailing dot`);
    
    return recordCache.records.find(r => {
      if (r.type !== type || r.name !== recordName) return false;
      
      // Compare content with and without trailing dot
      if (r.data && typeof r.data === 'string') {
        const normalizedData = r.data.endsWith('.') ? r.data.slice(0, -1) : r.data;
        logger.trace(`Comparing normalized data: ${normalizedData}`);
      }
      
      return r.type === type && r.name === recordName;
    });
  }
  
  logger.trace(`No record found`);
  return null;
}

module.exports = {
  prepareRecordForCreation,
  recordNeedsUpdate,
  findRecordInCache
};