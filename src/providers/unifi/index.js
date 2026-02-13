/**
 * UniFi Provider module
 * Exports the UniFi DNS provider implementation
 */
const UnifiProvider = require('./provider');
const { convertRecord, convertToUnifiFormat } = require('./converter');
const { validateRecord } = require('./validator');

// Export the provider class as default
module.exports = UnifiProvider;

// Also export utility functions
module.exports.convertRecord = convertRecord;
module.exports.convertToUnifiFormat = convertToUnifiFormat;
module.exports.validateRecord = validateRecord;
