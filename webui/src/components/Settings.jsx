import React, { useState, useEffect } from 'react';
import './Settings.css';

function Settings() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  
  // Log level state
  const [logLevel, setLogLevel] = useState('');
  const [updatingLogLevel, setUpdatingLogLevel] = useState(false);

  useEffect(() => {
    // Fetch configuration
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/config');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch configuration: ${response.status}`);
      }
      
      const data = await response.json();
      setConfig(data);
      setLogLevel(data.logLevel || 'INFO');
      setError(null);
    } catch (err) {
      setError(`Error: ${err.message}`);
      console.error('Error fetching configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateLogLevel = async () => {
    setUpdatingLogLevel(true);
    setUpdateStatus(null);
    
    try {
      const response = await fetch('/api/config/log-level', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ level: logLevel })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to update log level: ${response.status}`);
      }
      
      // Update local config
      setConfig({
        ...config,
        logLevel
      });
      
      setUpdateStatus({
        type: 'success',
        message: `Log level updated to ${logLevel}`
      });
    } catch (err) {
      setUpdateStatus({
        type: 'error',
        message: `Error: ${err.message}`
      });
      console.error('Error updating log level:', err);
    } finally {
      setUpdatingLogLevel(false);
    }
  };

  if (loading) {
    return (
      <div className="settings loading">
        <div className="spinner"></div>
        <p>Loading settings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="settings error">
        <h1>Error Loading Settings</h1>
        <p>{error}</p>
        <button onClick={fetchConfig}>Retry</button>
      </div>
    );
  }

  return (
    <div className="settings">
      <h1>Settings</h1>
      
      <div className="settings-info">
        <p>
          Configure TráfegoDNS settings. Note that some settings can only be changed through 
          environment variables and will require restarting the container.
        </p>
      </div>
      
      <div className="settings-section">
        <h2>Application Settings</h2>
        
        <div className="setting-group">
          <h3>Log Level</h3>
          <p className="setting-description">
            Control the verbosity of logs. Higher levels include more detailed information.
          </p>
          
          <div className="setting-control">
            <select 
              value={logLevel} 
              onChange={(e) => setLogLevel(e.target.value)}
              disabled={updatingLogLevel}
            >
              <option value="ERROR">ERROR - Critical errors only</option>
              <option value="WARN">WARN - Warnings and errors</option>
              <option value="INFO">INFO - General information (Default)</option>
              <option value="DEBUG">DEBUG - Detailed information for troubleshooting</option>
              <option value="TRACE">TRACE - Extremely detailed for development</option>
            </select>
            
            <button 
              onClick={updateLogLevel} 
              disabled={updatingLogLevel || logLevel === config.logLevel}
            >
              {updatingLogLevel ? 'Updating...' : 'Update Log Level'}
            </button>
          </div>
          
          {updateStatus && (
            <div className={`update-status ${updateStatus.type}`}>
              {updateStatus.message}
            </div>
          )}
        </div>
      </div>
      
      <div className="settings-section">
        <h2>Current Configuration</h2>
        <p className="read-only-notice">
          The following settings are read-only and can only be changed through environment variables.
        </p>
        
        <div className="config-grid">
          <div className="config-item">
            <div className="config-label">DNS Provider</div>
            <div className="config-value">{config.dnsProvider}</div>
          </div>
          
          <div className="config-item">
            <div className="config-label">Operation Mode</div>
            <div className="config-value">{config.operationMode}</div>
          </div>
          
          <div className="config-item">
            <div className="config-label">Domain</div>
            <div className="config-value">{config.providerDomain}</div>
          </div>
          
          <div className="config-item">
            <div className="config-label">Default Record Type</div>
            <div className="config-value">{config.defaultRecordType}</div>
          </div>
          
          <div className="config-item">
            <div className="config-label">Default TTL</div>
            <div className="config-value">{config.defaultTTL}s</div>
          </div>
          
          <div className="config-item">
            <div className="config-label">Proxied by Default</div>
            <div className="config-value">{config.defaultProxied ? 'Yes' : 'No'}</div>
          </div>
          
          <div className="config-item">
            <div className="config-label">Cleanup Orphaned</div>
            <div className="config-value">{config.cleanupOrphaned ? 'Enabled' : 'Disabled'}</div>
          </div>
          
          <div className="config-item">
            <div className="config-label">Poll Interval</div>
            <div className="config-value">{config.pollInterval / 1000}s</div>
          </div>
          
          <div className="config-item">
            <div className="config-label">Watch Docker Events</div>
            <div className="config-value">{config.watchDockerEvents ? 'Enabled' : 'Disabled'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;