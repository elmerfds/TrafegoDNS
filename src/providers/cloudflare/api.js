/**
 * Cloudflare API client and low-level operations
 */
const axios = require('axios');
const logger = require('../../utils/logger');

/**
 * Initialize an Axios client for the Cloudflare API
 */
function initializeClient(token, timeout) {
  logger.trace('Cloudflare API: Initializing Axios client');
  
  return axios.create({
    baseURL: 'https://api.cloudflare.com/client/v4',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    timeout: timeout
  });
}

/**
 * Fetch zone ID from Cloudflare
 */
async function fetchZoneId(client, zone) {
  logger.trace(`Cloudflare API: Fetching zone ID for "${zone}"`);
  
  try {
    const response = await client.get('/zones', {
      params: { name: zone }
    });
    
    logger.trace(`Cloudflare API: Received ${response.data.result.length} zones from API`);
    
    if (response.data.result.length === 0) {
      logger.trace(`Cloudflare API: Zone "${zone}" not found in Cloudflare`);
      throw new Error(`Zone not found: ${zone}`);
    }
    
    const zoneId = response.data.result[0].id;
    logger.debug(`Cloudflare zone ID for ${zone}: ${zoneId}`);
    
    return zoneId;
  } catch (error) {
    logger.error(`Failed to fetch Cloudflare zone ID: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch DNS records for a zone
 */
async function fetchRecords(client, zoneId) {
  logger.trace(`Cloudflare API: Fetching records for zone ${zoneId}`);
  
  try {
    const response = await client.get(`/zones/${zoneId}/dns_records`, {
      params: { per_page: 100 } // Get as many records as possible in one request
    });
    
    let records = response.data.result;
    
    // If there are more records (pagination), fetch them as well
    let nextPage = response.data.result_info?.next_page_url;
    let pageCount = 1;
    
    while (nextPage) {
      pageCount++;
      logger.debug(`Fetching additional DNS records page from Cloudflare (page ${pageCount})`);
      logger.trace(`Cloudflare API: Fetching pagination URL: ${nextPage}`);
      
      const pageResponse = await axios.get(nextPage, {
        headers: client.defaults.headers
      });
      
      const newRecords = pageResponse.data.result;
      logger.trace(`Cloudflare API: Received ${newRecords.length} additional records from page ${pageCount}`);
      
      records = [
        ...records,
        ...newRecords
      ];
      
      nextPage = pageResponse.data.result_info?.next_page_url;
    }
    
    logger.debug(`Fetched ${records.length} DNS records from Cloudflare`);
    return records;
  } catch (error) {
    logger.error(`Failed to fetch DNS records: ${error.message}`);
    throw error;
  }
}

module.exports = {
  initializeClient,
  fetchZoneId,
  fetchRecords
};