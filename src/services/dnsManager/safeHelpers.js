/**
 * Safe Helpers
 * Utilities for safe operations in the DNS manager
 */

/**
 * Safely check array length
 * @param {*} arr - Array to check
 * @returns {number} - Array length or 0 for non-arrays
 */
function safeArrayLength(arr) {
  if (!arr) return 0;
  if (!Array.isArray(arr)) return 0;
  return arr.length;
}

/**
 * Safely concatenate arrays
 * @param {...Array} arrays - Arrays to concatenate
 * @returns {Array} - Concatenated array
 */
function safeConcatArrays(...arrays) {
  return arrays.filter(arr => Array.isArray(arr)).flat();
}

/**
 * Safely get property
 * @param {Object} obj - Object to get property from
 * @param {string} path - Property path (e.g. 'a.b.c')
 * @param {*} defaultValue - Default value if property doesn't exist
 * @returns {*} - Property value or default
 */
function safeGetProperty(obj, path, defaultValue = undefined) {
  if (!obj) return defaultValue;
  if (!path) return defaultValue;
  
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return defaultValue;
    current = current[part];
  }
  
  return current !== undefined ? current : defaultValue;
}

/**
 * Safely iterate over array
 * @param {*} arr - Array to iterate
 * @param {Function} callback - Callback function (item, index)
 */
function safeForEach(arr, callback) {
  if (!arr) return;
  if (!Array.isArray(arr)) return;
  if (typeof callback !== 'function') return;
  
  arr.forEach(callback);
}

module.exports = {
  safeArrayLength,
  safeConcatArrays,
  safeGetProperty,
  safeForEach
};