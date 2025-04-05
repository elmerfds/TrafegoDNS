/**
 * CloudFlare Zero Trust Provider module
 * Exports the CloudFlare Zero Trust Tunnel provider implementation
 */
const CFZeroTrustProvider = require('./provider');
const { convertRecord, convertToCFZeroTrustFormat } = require('./converter');
const { validateRecord } = require('./validator');

// Export the provider class as default
module.exports = CFZeroTrustProvider;

// Also export utility functions
module.exports.convertRecord = convertRecord;
module.exports.convertToCFZeroTrustFormat = convertToCFZeroTrustFormat;
module.exports.validateRecord = validateRecord;