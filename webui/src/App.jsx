import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';

// Components
import Dashboard from './components/Dashboard';
import Records from './components/Records';
import Settings from './components/Settings';
import PreservedHostnames from './components/PreservedHostnames';
import ManagedHostnames from './components/ManagedHostnames';
import ActivityLog from './components/ActivityLog';

function App() {
  const [status, setStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch initial status
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/status');
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(`Failed to connect to TráfegoDNS API: ${err.message}`);
      console.error('Error fetching status:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p>Connecting to TráfegoDNS...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-error">
        <h1>Connection Error</h1>
        <p>{error}</p>
        <button onClick={fetchStatus}>Retry</button>
      </div>
    );
  }

  return (
    <Router>
      <div className="app">
        <header className="app-header">
          <div className="logo">
            <h1>TráfegoDNS</h1>
            <span className="version">v{status.version}</span>
          </div>
          <div className="status-pill">
            <span className={`status-indicator ${status.status}`}></span>
            {status.status}
          </div>
        </header>
        
        <div className="app-container">
          <nav className="sidebar">
            <ul>
              <li>
                <Link to="/">Dashboard</Link>
              </li>
              <li>
                <Link to="/records">DNS Records</Link>
              </li>
              <li>
                <Link to="/preserved-hostnames">Preserved Hostnames</Link>
              </li>
              <li>
                <Link to="/managed-hostnames">Managed Hostnames</Link>
              </li>
              <li>
                <Link to="/activity">Activity Log</Link>
              </li>
              <li>
                <Link to="/settings">Settings</Link>
              </li>
            </ul>
            
            <div className="sidebar-footer">
              <div className="provider-info">
                <div className="provider-label">DNS Provider</div>
                <div className="provider-value">{status.provider}</div>
              </div>
              <div className="mode-info">
                <div className="mode-label">Mode</div>
                <div className="mode-value">{status.operationMode}</div>
              </div>
            </div>
          </nav>
          
          <main className="content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/records" element={<Records />} />
              <Route path="/preserved-hostnames" element={<PreservedHostnames />} />
              <Route path="/managed-hostnames" element={<ManagedHostnames />} />
              <Route path="/activity" element={<ActivityLog />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;