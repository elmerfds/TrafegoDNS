import React, { useState, useEffect } from 'react';
import './ActivityLog.css';

function ActivityLog() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(null);

  useEffect(() => {
    // Fetch activity log on component mount
    fetchActivityLog();
    
    // Set up periodic refresh
    const interval = setInterval(fetchActivityLog, 10000); // Refresh every 10 seconds
    setRefreshInterval(interval);
    
    // Clean up on unmount
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
      clearInterval(interval);
    };
  }, []);

  const fetchActivityLog = async () => {
    try {
      if (loading) {
        // Only show loading indicator on initial load
        setLoading(true);
      }
      
      const response = await fetch('/api/activity-log');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch activity log: ${response.status}`);
      }
      
      const data = await response.json();
      setActivities(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(`Error: ${err.message}`);
      console.error('Error fetching activity log:', err);
    } finally {
      setLoading(false);
    }
  };

  // Format the activity message based on type
  const formatActivity = (activity) => {
    const { type, data } = activity;
    
    switch (type) {
      case 'record_created':
        return `Created ${data.count || 1} DNS record(s)`;
        
      case 'record_updated':
        return `Updated ${data.count || 1} DNS record(s)`;
        
      case 'record_deleted':
        if (data.name && data.type) {
          return `Deleted ${data.type} record for ${data.name}`;
        }
        return `Deleted ${data.count || 1} DNS record(s)`;
        
      case 'error':
        return `Error in ${data.source}: ${data.error}`;
        
      default:
        return JSON.stringify(data);
    }
  };

  // Format timestamp to readable format
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Get appropriate CSS class for activity type
  const getActivityClass = (type) => {
    switch (type) {
      case 'record_created':
        return 'created';
      case 'record_updated':
        return 'updated';
      case 'record_deleted':
        return 'deleted';
      case 'error':
        return 'error';
      default:
        return 'info';
    }
  };

  if (loading && activities.length === 0) {
    return (
      <div className="activity-log loading">
        <div className="spinner"></div>
        <p>Loading activity log...</p>
      </div>
    );
  }

  return (
    <div className="activity-log">
      <h1>Activity Log</h1>
      
      <div className="log-controls">
        <button className="refresh-button" onClick={fetchActivityLog}>
          Refresh
        </button>
        <span className="auto-refresh-note">
          Auto-refreshes every 10 seconds
        </span>
      </div>
      
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={fetchActivityLog}>Retry</button>
        </div>
      )}
      
      <div className="activities-list">
        {activities.length === 0 ? (
          <div className="no-activities">
            <p>No activities recorded yet.</p>
          </div>
        ) : (
          <ul>
            {activities.map((activity, index) => (
              <li 
                key={`${activity.timestamp}-${index}`} 
                className={`activity-item ${getActivityClass(activity.type)}`}
              >
                <div className="activity-timestamp">
                  {formatTimestamp(activity.timestamp)}
                </div>
                <div className="activity-message">
                  {formatActivity(activity)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default ActivityLog;