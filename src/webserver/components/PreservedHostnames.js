import React, { useState, useEffect } from 'react';
import './PreservedHostnames.css';

function PreservedHostnames() {
  const [hostnames, setHostnames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newHostname, setNewHostname] = useState('');
  const [addingHostname, setAddingHostname] = useState(false);
  const [addError, setAddError] = useState(null);

  useEffect(() => {
    fetchPreservedHostnames();
  }, []);

  const fetchPreservedHostnames = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/preserved-hostnames');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch preserved hostnames: ${response.status}`);
      }
      
      const data = await response.json();
      setHostnames(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(`Error: ${err.message}`);
      console.error('Error fetching preserved hostnames:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddHostname = async (e) => {
    e.preventDefault();
    
    if (!newHostname.trim()) {
      setAddError('Hostname cannot be empty');
      return;
    }
    
    setAddingHostname(true);
    setAddError(null);
    
    try {
      const response = await fetch('/api/preserved-hostnames', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hostname: newHostname.trim() })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to add hostname: ${response.status}`);
      }
      
      // Add to local state and clear input
      setHostnames([...hostnames, newHostname.trim()]);
      setNewHostname('');
    } catch (err) {
      setAddError(`Error: ${err.message}`);
      console.error('Error adding preserved hostname:', err);
    } finally {
      setAddingHostname(false);
    }
  };

  const handleRemoveHostname = async (hostname) => {
    if (!confirm(`Are you sure you want to remove ${hostname} from preserved hostnames?`)) {
      return;
    }
    
    try {
      const response = await fetch(`/api/preserved-hostnames/${encodeURIComponent(hostname)}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to remove hostname: ${response.status}`);
      }
      
      // Remove from local state
      setHostnames(hostnames.filter(h => h !== hostname));
    } catch (err) {
      setError(`Error removing hostname: ${err.message}`);
      console.error('Error removing preserved hostname:', err);
    }
  };

  if (loading && hostnames.length === 0) {
    return (
      <div className="preserved-hostnames loading">
        <div className="spinner"></div>
        <p>Loading preserved hostnames...</p>
      </div>
    );
  }

  return (
    <div className="preserved-hostnames">
      <h1>Preserved Hostnames</h1>
      
      <div className="preserved-info">
        <p>
          Preserved hostnames will never be deleted by the cleanup process, even if they become orphaned.
          You can use wildcards (e.g., <code>*.admin.example.com</code>) to preserve multiple hostnames with a single rule.
        </p>
      </div>
      
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={fetchPreservedHostnames}>Retry</button>
        </div>
      )}
      
      <div className="add-hostname">
        <form onSubmit={handleAddHostname}>
          <input
            type="text"
            placeholder="Enter hostname to preserve..."
            value={newHostname}
            onChange={(e) => setNewHostname(e.target.value)}
            disabled={addingHostname}
          />
          <button type="submit" disabled={addingHostname}>
            {addingHostname ? 'Adding...' : 'Add Hostname'}
          </button>
        </form>
        
        {addError && (
          <div className="add-error-message">{addError}</div>
        )}
      </div>
      
      <div className="hostnames-list">
        <h2>Current Preserved Hostnames</h2>
        
        {hostnames.length === 0 ? (
          <div className="no-hostnames">
            <p>No preserved hostnames configured yet.</p>
          </div>
        ) : (
          <ul>
            {hostnames.map(hostname => (
              <li key={hostname} className="hostname-item">
                <span className="hostname">
                  {hostname.startsWith('*.') ? (
                    <>
                      <span className="wildcard">*.</span>
                      <span className="domain">{hostname.substring(2)}</span>
                    </>
                  ) : (
                    <span className="domain">{hostname}</span>
                  )}
                </span>
                <button
                  className="remove-button"
                  onClick={() => handleRemoveHostname(hostname)}
                  title="Remove hostname"
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default PreservedHostnames;