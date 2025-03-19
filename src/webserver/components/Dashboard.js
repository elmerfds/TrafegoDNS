import React, { useState, useEffect } from 'react';
import './Dashboard.css';

function Dashboard() {
  const [stats, setStats] = useState({
    records: 0,
    trackedRecords: 0,
    preservedHostnames: 0,
    managedHostnames: 0
  });
  
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState(null);

  useEffect(() => {
    // Fetch dashboard data
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch all necessary data in parallel
      const [recordsResponse, trackedResponse, preservedResponse, managedResponse, configResponse] = await Promise.all([
        fetch('/api/records'),
        fetch('/api/records/tracked'),
        fetch('/api/preserved-hostnames'),
        fetch('/api/managed-hostnames'),
        fetch('/api/config')
      ]);
      
      // Parse responses
      const records = await recordsResponse.json();
      const trackedRecords = await trackedResponse.json();
      const preservedHostnames = await preservedResponse.json();
      const managedHostnames = await managedResponse.json();
      const config = await configResponse.json();
      
      // Update stats
      setStats({
        records: records.length,
        trackedRecords: Array.isArray(trackedRecords) ? trackedRecords.length : 0,
        preservedHostnames: Array.isArray(preservedHostnames) ? preservedHostnames.length : 0,
        managedHostnames: Array.isArray(managedHostnames) ? managedHostnames.length : 0
      });
      
      // Update config
      setConfig(config);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshSuccess(null);
    
    try {
      const response = await fetch('/api/refresh', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      setRefreshSuccess(true);
      
      // Refetch data after refresh
      setTimeout(() => {
        fetchDashboardData();
      }, 1000);
    } catch (error) {
      console.error('Error refreshing DNS records:', error);
      setRefreshSuccess(false);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard loading">
        <div className="spinner"></div>
        <p>Loading dashboard data...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      
      <div className="refresh-bar">
        <button 
          className={`refresh-button ${refreshing ? 'refreshing' : ''} ${refreshSuccess === true ? 'success' : ''} ${refreshSuccess === false ? 'error' : ''}`}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh DNS Records'}
        </button>
        
        {refreshSuccess === true && (
          <span className="refresh-status success">Refresh successful!</span>
        )}
        
        {refreshSuccess === false && (
          <span className="refresh-status error">Refresh failed. Check logs for details.</span>
        )}
      </div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.records}</div>
          <div className="stat-label">Total DNS Records</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value">{stats.trackedRecords}</div>
          <div className="stat-label">Managed by TráfegoDNS</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value">{stats.preservedHostnames}</div>
          <div className="stat-label">Preserved Hostnames</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value">{stats.managedHostnames}</div>
          <div className="stat-label">Managed Hostnames</div>
        </div>
      </div>
      
      <div className="config-section">
        <h2>Active Configuration</h2>
        
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
            <div className="config-label">Log Level</div>
            <div className="config-value">{config.logLevel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;