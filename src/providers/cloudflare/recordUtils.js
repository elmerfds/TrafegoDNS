/**
 * Record utility functions for Cloudflare provider
 */
const logger = require('../../utils/logger');

/**
 * Check if a record needs to be updated
 */
function recordNeedsUpdate(existing, newRecord) {
  logger.trace(`Comparing records for ${newRecord.name}`);
  logger.trace(`Existing: ${JSON.stringify(existing)}`);
  logger.trace(`New: ${JSON.stringify(newRecord)}`);
  
  // For proxied records in Cloudflare, TTL is always forced to 1 (Auto)
  // So we should ignore TTL differences for proxied records
  const isProxiedRecord = existing.proxied === true || newRecord.proxied === true;
  
  // Basic field comparison
  let needsUpdate = existing.content !== newRecord.content;
  
  // Only compare TTL for non-proxied records
  if (!isProxiedRecord) {
    needsUpdate = needsUpdate || (existing.ttl !== newRecord.ttl);
  }
  
  logger.trace(`Basic comparison - content: ${existing.content} vs ${newRecord.content}, ttl: ${existing.ttl} vs ${newRecord.ttl}`);
  
  // Only compare proxied for supported record types
  if (['A', 'AAAA', 'CNAME'].includes(newRecord.type)) {
    const proxiedDiff = existing.proxied !== newRecord.proxied;
    logger.trace(`Proxied status - existing: ${existing.proxied}, new: ${newRecord.proxied}, different: ${proxiedDiff}`);
    
    if (proxiedDiff) {
      // Log at INFO level to make proxied status changes more visible
      if (newRecord.proxied === false) {
        logger.info(`🔓 Disabling Cloudflare proxy for ${newRecord.name} (changing from proxied to unproxied)`);
      } else {
        logger.info(`🔒 Enabling Cloudflare proxy for ${newRecord.name} (changing from unproxied to proxied)`);
      }
    }
    
    needsUpdate = needsUpdate || proxiedDiff;
  }
  
  // Type-specific field comparisons
  switch (newRecord.type) {
    case 'MX':
      const mxDiff = existing.priority !== newRecord.priority;
      logger.trace(`MX priority - existing: ${existing.priority}, new: ${newRecord.priority}, different: ${mxDiff}`);
      needsUpdate = needsUpdate || mxDiff;
      break;
      
    case 'SRV':
      const srvPriorityDiff = existing.priority !== newRecord.priority;
      const srvWeightDiff = existing.weight !== newRecord.weight;
      const srvPortDiff = existing.port !== newRecord.port;
      
      logger.trace(`SRV fields - priority diff: ${srvPriorityDiff}, weight diff: ${srvWeightDiff}, port diff: ${srvPortDiff}`);
      
      needsUpdate = needsUpdate || 
        srvPriorityDiff ||
        srvWeightDiff ||
        srvPortDiff;
      break;
      
    case 'CAA':
      const caaFlagsDiff = existing.flags !== newRecord.flags;
      const caaTagDiff = existing.tag !== newRecord.tag;
      
      logger.trace(`CAA fields - flags diff: ${caaFlagsDiff}, tag diff: ${caaTagDiff}`);
      
      needsUpdate = needsUpdate || 
        caaFlagsDiff ||
        caaTagDiff;
      break;
  }
  
  // If an update is needed, log the specific differences at DEBUG level
  if (needsUpdate && logger.level >= 3) { // DEBUG level or higher
    logger.debug(`Record ${newRecord.name} needs update:`);
    if (existing.content !== newRecord.content) 
      logger.debug(` - Content: ${existing.content} → ${newRecord.content}`);
    if (!isProxiedRecord && existing.ttl !== newRecord.ttl) 
      logger.debug(` - TTL: ${existing.ttl} → ${newRecord.ttl}`);
    if (['A', 'AAAA', 'CNAME'].includes(newRecord.type) && existing.proxied !== newRecord.proxied)
      logger.debug(` - Proxied: ${existing.proxied} → ${newRecord.proxied}`);
  }
  
  logger.trace(`Final result - needs update: ${needsUpdate}`);
  return needsUpdate;
}

module.exports = {
  recordNeedsUpdate
};