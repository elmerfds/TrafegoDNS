import React, { useState, useEffect } from 'react';
import './ManagedHostnames.css';

function ManagedHostnames() {
  const [managedHostnames, setManagedHostnames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState({});
  
  // Form state for adding new managed hostname
  const [newHostname, setNewHostname] = useState({
    hostname: '',
    type: 'A',
    content: '',
    ttl: 3600,
    proxied: false
  });
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState(null);

  useEffect(() => {
    // Fetch managed hostnames and config
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch managed hostnames and config in parallel
      const [managedResponse, configResponse] = await Promise.all([
        fetch('/api/managed-hostnames'),
        fetch('/api/config')
      ]);
      
      if (!managedResponse.ok) {
        throw new Error(`Failed to fetch managed hostnames: ${managedResponse.status}`);
      }
      
      if (!configResponse.ok) {
        throw new Error(`Failed to fetch config: ${configResponse.status}`);
      }
      
      // Parse responses
      const managedData = await managedResponse.json();
      const configData = await configResponse.json();
      
      setManagedHostnames(Array.isArray(managedData) ? managedData : []);
      setConfig(configData);
      
      // Initialize new hostname content based on config
      setNewHostname(prevState => ({
        ...prevState,
        content: configData.defaultContent || '',
        proxied: configData.defaultProxied || false
      }));
      
      setError(null);
    } catch (err) {
      setError(`Error: ${err.message}`);
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newHostname.hostname.trim()) {
      setAddError('Hostname is required');
      return;
    }
    
    setIsAdding(true);
    setAddError(null);
    
    try {
      const response = await fetch('/api/managed-hostnames', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newHostname)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to add hostname: ${response.status}`);
      }
      
      // Refresh the list
      fetchData();
      
      // Reset form
      setNewHostname({
        hostname: '',
        type: 'A',
        content: config.defaultContent || '',
        ttl: 3600,
        proxied: config.defaultProxied || false
      });
    } catch (err) {
      setAddError(`Error: ${err.message}`);
      console.error('Error adding managed hostname:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Handle checkbox
    const inputValue = type === 'checkbox' ? checked : value;
    
    // Handle number inputs
    const parsedValue = type === 'number' ? parseInt(value, 10) : inputValue;
    
    setNewHostname(prevState => ({
      ...prevState,
      [name]: parsedValue
    }));
  };

  const handleTypeChange = (e) => {
    const newType = e.target.value;
    let newContent = newHostname.content;
    
    // Set default content based on record type
    if (newType === 'A') {
      // For A records, use IP address
      newContent = config.defaultContent || '';
    } else if (newType === 'CNAME') {
      // For CNAME records, use domain
      newContent = config.providerDomain || '';
    }
    
    setNewHostname(prevState => ({
      ...prevState,
      type: newType,
      content: newContent
    }));
  };

  const handleRemoveHostname = async (hostname) => {
    if (!confirm(`Are you sure you want to remove ${hostname} from managed hostnames?`)) {
      return;
    }
    
    try {
      const response = await fetch(`/api/managed-hostnames/${encodeURIComponent(hostname)}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to remove hostname: ${response.status}`);
      }
      
      // Remove from local state
      setManagedHostnames(managedHostnames.filter(item => item.hostname !== hostname));
    } catch (err) {
      setError(`Error removing hostname: ${err.message}`);
      console.error('Error removing managed hostname:', err);
    }
  };

  if (loading && managedHostnames.length === 0) {
    return (
      <div className="managed-hostnames loading">
        <div className="spinner"></div>
        <p>Loading managed hostnames...</p>
      </div>
    );
  }

  return (
    <div className="managed-hostnames">
      <h1>Managed Hostnames</h1>
      
      <div className="managed-info">
        <p>
          Managed hostnames are DNS records that are created and maintained manually,
          independent of any container or Traefik configuration.
        </p>
      </div>
      
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={fetchData}>Retry</button>
        </div>
      )}
      
      <div className="add-hostname-form">
        <h2>Add Managed Hostname</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="hostname">Hostname:</label>
              <input
                type="text"
                id="hostname"
                name="hostname"
                placeholder="e.g., app.example.com"
                value={newHostname.hostname}
                onChange={handleInputChange}
                disabled={isAdding}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="type">Record Type:</label>
              <select
                id="type"
                name="type"
                value={newHostname.type}
                onChange={handleTypeChange}
                disabled={isAdding}
              >
                <option value="A">A</option>
                <option value="AAAA">AAAA</option>
                <option value="CNAME">CNAME</option>
                <option value="MX">MX</option>
                <option value="TXT">TXT</option>
                <option value="SRV">SRV</option>
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="content">Content:</label>
              <input
                type="text"
                id="content"
                name="content"
                placeholder={newHostname.type === 'A' ? 'e.g., 192.168.1.1' : 'e.g., example.com'}
                value={newHostname.content}
                onChange={handleInputChange}
                disabled={isAdding}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="ttl">TTL (seconds):</label>
              <input
                type="number"
                id="ttl"
                name="ttl"
                min="60"
                step="1"
                value={newHostname.ttl}
                onChange={handleInputChange}
                disabled={isAdding}
              />
            </div>
          </div>
          
          {config.dnsProvider === 'cloudflare' && (
            <div className="form-row">
              <div className="form-group checkbox-group">
                <label htmlFor="proxied">
                  <input
                    type="checkbox"
                    id="proxied"
                    name="proxied"
                    checked={newHostname.proxied}
                    onChange={handleInputChange}
                    disabled={isAdding || !['A', 'AAAA', 'CNAME'].includes(newHostname.type)}
                  />
                  Proxied through Cloudflare
                </label>
              </div>
            </div>
          )}
          
          <div className="form-row">
            <button type="submit" className="submit-button" disabled={isAdding}>
              {isAdding ? 'Adding...' : 'Add Managed Hostname'}
            </button>
          </div>
          
          {addError && (
            <div className="add-error-message">{addError}</div>
          )}
        </form>
      </div>
      
      <div className="managed-hostnames-list">
        <h2>Current Managed Hostnames</h2>
        
        {managedHostnames.length === 0 ? (
          <div className="no-hostnames">
            <p>No managed hostnames configured yet.</p>
          </div>
        ) : (
          <table className="hostnames-table">
            <thead>
              <tr>
                <th>Hostname</th>
                <th>Type</th>
                <th>Content</th>
                <th>TTL</th>
                {config.dnsProvider === 'cloudflare' && <th>Proxied</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {managedHostnames.map(item => (
                <tr key={item.hostname} className="hostname-item">
                  <td className="hostname">{item.hostname}</td>
                  <td className="type">{item.type}</td>
                  <td className="content">{item.content}</td>
                  <td className="ttl">{item.ttl}s</td>
                  {config.dnsProvider === 'cloudflare' && (
                    <td className="proxied">
                      {item.proxied ? (
                        <span className="badge proxied">Yes</span>
                      ) : (
                        <span className="badge unproxied">No</span>
                      )}
                    </td>
                  )}
                  <td className="actions">
                    <button
                      className="remove-button"
                      onClick={() => handleRemoveHostname(item.hostname)}
                      title="Remove hostname"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default ManagedHostnames;