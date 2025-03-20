/**
 * Utility functions for date and time handling
 */

/**
 * Format a timestamp as a relative time (e.g., "5 minutes ago")
 * @param {string|number|Date} timestamp - The timestamp to format
 * @returns {string} - Formatted relative time
 */
export const formatRelativeTime = (timestamp) => {
  if (!timestamp) return 'never';
  
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (isNaN(seconds)) return 'invalid date';
  
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else if (seconds < 604800) {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
};

/**
 * Format a timestamp as a full date and time
 * @param {string|number|Date} timestamp - The timestamp to format
 * @returns {string} - Formatted date and time
 */
export const formatDateTime = (timestamp) => {
  if (!timestamp) return 'N/A';
  
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  
  if (isNaN(date.getTime())) return 'Invalid date';
  
  return date.toLocaleString();
};

/**
 * Format a duration in milliseconds to a human-readable format
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} - Formatted duration
 */
export const formatDuration = (milliseconds) => {
  if (!milliseconds || milliseconds <= 0) return 'N/A';
  
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  } else if (milliseconds < 60000) {
    const seconds = Math.round(milliseconds / 1000);
    return `${seconds}s`;
  } else if (milliseconds < 3600000) {
    const minutes = Math.round(milliseconds / 60000);
    return `${minutes}m`;
  } else if (milliseconds < 86400000) {
    const hours = Math.round(milliseconds / 3600000);
    return `${hours}h`;
  } else {
    const days = Math.round(milliseconds / 86400000);
    return `${days}d`;
  }
};

/**
 * Get time elapsed since a timestamp
 * @param {string|number|Date} timestamp - The timestamp to check against
 * @returns {number} - Milliseconds elapsed
 */
export const getTimeElapsedSince = (timestamp) => {
  if (!timestamp) return null;
  
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return Date.now() - date.getTime();
};

/**
 * Check if a timestamp is older than a specified duration
 * @param {string|number|Date} timestamp - The timestamp to check
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {boolean} - True if timestamp is older than duration
 */
export const isOlderThan = (timestamp, milliseconds) => {
  const elapsed = getTimeElapsedSince(timestamp);
  return elapsed !== null && elapsed > milliseconds;
};
