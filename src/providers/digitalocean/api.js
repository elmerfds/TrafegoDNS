/**
 * DigitalOcean API client and low-level operations
 */
const axios = require('axios');
const logger = require('../../utils/logger');

/**
 * Initialize an Axios client for the DigitalOcean API
 */
function initializeClient(token, timeout) {
  logger.trace('DigitalOcean API: Initializing Axios client');
  
  return axios.create({
    baseURL: 'https://api.digitalocean.com/v2',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    timeout: timeout
  });
}

/**
 * Verify domain exists in DigitalOcean
 */
async function verifyDomain(client, domain) {
  logger.trace(`DigitalOcean API: Verifying domain "${domain}" exists`);
  
  try {
    await client.get(`/domains/${domain}`);
    logger.debug(`DigitalOcean domain verified: ${domain}`);
    return true;
  } catch (error) {
    const statusCode = error.response?.status;
    
    if (statusCode === 404) {
      logger.error(`Domain not found in DigitalOcean: ${domain}`);
      throw new Error(`Domain not found in DigitalOcean: ${domain}`);
    } else if (statusCode === 401) {
      logger.error('Invalid DigitalOcean API token');
      throw new Error('Invalid DigitalOcean API token. Please check your DIGITALOCEAN_TOKEN environment variable.');
    }
    
    logger.error(`Failed to verify DigitalOcean domain: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch all records, handling pagination
 */
async function fetchAllRecords(client, domain) {
  let allRecords = [];
  let nextPage = 1;
  let hasMorePages = true;
  
  while (hasMorePages) {
    try {
      const response = await client.get(`/domains/${domain}/records`, {
        params: { page: nextPage, per_page: 100 }
      });
      
      const records = response.data.domain_records || [];
      allRecords = allRecords.concat(records);
      
      // Check if there are more pages
      const links = response.data.links;
      const hasNextPage = links && links.pages && links.pages.next;
      
      if (hasNextPage) {
        nextPage++;
      } else {
        hasMorePages = false;
      }
    } catch (error) {
      logger.error(`Error fetching page ${nextPage} of DNS records: ${error.message}`);
      hasMorePages = false;
    }
  }
  
  return allRecords;
}

module.exports = {
  initializeClient,
  verifyDomain,
  fetchAllRecords
};