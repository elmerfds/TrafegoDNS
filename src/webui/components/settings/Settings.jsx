// src/webui/components/settings/Settings.jsx
import React, { useState, useEffect } from 'react';
import { Container, Card, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { FaExclamationTriangle, FaCheck, FaInfoCircle, FaCog, FaTrash, FaRedo } from 'react-icons/fa';
import { fetchConfig, updateLogLevel } from '../../services/apiService';
import LogLevelSelector from './LogLevelSelector';

const Settings = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  
  // Log level state
  const [logLevel, setLogLevel] = useState('INFO');
  
  // Cleanup settings state
  const [cleanupEnabled, setCleanupEnabled] = useState(false);
  
  // Poll interval state
  const [pollInterval, setPollInterval] = useState(60000);
  
  // IP refresh interval state
  const [ipRefreshInterval, setIpRefreshInterval] = useState(3600000);
  
  // Cache refresh interval state
  const [cacheRefreshInterval, setCacheRefreshInterval] = useState(3600000);
  
  // Mock function since the actual API may not have this endpoint yet
  const mockConfig = () => {
    return {
      logLevel: 'INFO',
      cleanupEnabled: false,
      pollInterval: 60000,
      ipRefreshInterval: 3600000,
      cacheRefreshInterval: 3600000,
      operationMode: 'traefik',
      provider: 'cloudflare',
      providerDomain: 'example.com'
    };
  };

  useEffect(() => {
    loadConfig();
  }, []);
  
  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // For now, use mock data
      // In a real implementation, you'd call the API:
      // const data = await fetchConfig();
      const data = mockConfig();
      
      setConfig(data);
      
      // Set form state from config
      setLogLevel(data.logLevel);
      setCleanupEnabled(data.cleanupEnabled);
      setPollInterval(data.pollInterval);
      setIpRefreshInterval(data.ipRefreshInterval);
      setCacheRefreshInterval(data.cacheRefreshInterval);
    } catch (err) {
      console.error('Error loading configuration:', err);
      setError('Failed to load configuration. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleLogLevelChange = async (level) => {
    try {
      setSaving(true);
      setError(null);
      
      // In a real implementation, you'd call the API:
      // await updateLogLevel(level);
      
      // For now, just simulate a delay and update local state
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setLogLevel(level);
      setSuccessMessage(`Log level changed to ${level}`);
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error updating log level:', err);
      setError('Failed to update log level. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  
  const handleCleanupToggle = async (enabled) => {
    try {
      setSaving(true);
      setError(null);
      
      // For now, just simulate a delay and update local state
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setCleanupEnabled(enabled);
      setSuccessMessage(`Cleanup ${enabled ? 'enabled' : 'disabled'}`);
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error updating cleanup setting:', err);
      setError('Failed to update cleanup setting. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  
  const formatIntervalForDisplay = (milliseconds) => {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    } else if (milliseconds < 60000) {
      return `${milliseconds / 1000}s`;
    } else if (milliseconds < 3600000) {
      return `${milliseconds / 60000}m`;
    } else {
      return `${milliseconds / 3600000}h`;
    }
  };
  
  if (loading) {
    return (
      <Container className="text-center py-5">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p className="mt-3">Loading settings...</p>
      </Container>
    );
  }

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 mb-0">Settings</h1>
      </div>

      {error && (
        <Alert variant="danger" className="mb-4">
          <FaExclamationTriangle className="me-2" />
          {error}
        </Alert>
      )}
      
      {successMessage && (
        <Alert variant="success" className="mb-4">
          <FaCheck className="me-2" />
          {successMessage}
        </Alert>
      )}
      
      <Row className="g-4">
        <Col md={6}>
          <Card bg="dark" className="h-100">
            <Card.Header className="d-flex align-items-center">
              <FaCog className="me-2" />
              <h5 className="mb-0">General Settings</h5>
            </Card.Header>
            <Card.Body>
              <Form>
                <Form.Group className="mb-4">
                  <Form.Label>Log Level</Form.Label>
                  <LogLevelSelector 
                    value={logLevel} 
                    onChange={handleLogLevelChange}
                    disabled={saving}
                  />
                  <Form.Text className="text-muted">
                    Determines the verbosity of application logs.
                  </Form.Text>
                </Form.Group>
                
                <Form.Group className="mb-4">
                  <Form.Label>Cleanup Orphaned Records</Form.Label>
                  <Form.Check
                    type="switch"
                    id="cleanup-switch"
                    label={cleanupEnabled ? "Enabled" : "Disabled"}
                    checked={cleanupEnabled}
                    onChange={(e) => handleCleanupToggle(e.target.checked)}
                    disabled={saving}
                  />
                  <Form.Text className="text-muted">
                    When enabled, DNS records will be automatically removed when their associated containers are removed.
                  </Form.Text>
                </Form.Group>
                
                <div className="mb-3">
                  <h6>Current Configuration</h6>
                  <div className="bg-dark-blue p-3 rounded">
                    <div className="mb-2">
                      <strong>Operation Mode:</strong> <span className="text-capitalize">{config?.operationMode || 'Unknown'}</span>
                    </div>
                    <div className="mb-2">
                      <strong>DNS Provider:</strong> <span className="text-capitalize">{config?.provider || 'Unknown'}</span>
                    </div>
                    <div>
                      <strong>Domain:</strong> {config?.providerDomain || 'Unknown'}
                    </div>
                  </div>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
        
        <Col md={6}>
          <Card bg="dark" className="h-100">
            <Card.Header className="d-flex align-items-center">
              <FaRedo className="me-2" />
              <h5 className="mb-0">Timing Settings</h5>
            </Card.Header>
            <Card.Body>
              <Alert variant="info" className="mb-4">
                <FaInfoCircle className="me-2" />
                Timing settings can only be changed via environment variables. The values shown below are the current settings.
              </Alert>
              
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Poll Interval</Form.Label>
                  <Form.Control
                    type="text"
                    value={formatIntervalForDisplay(pollInterval)}
                    disabled
                  />
                  <Form.Text className="text-muted">
                    How often TráfegoDNS polls for changes.
                  </Form.Text>
                </Form.Group>
                
                <Form.Group className="mb-3">
                  <Form.Label>IP Refresh Interval</Form.Label>
                  <Form.Control
                    type="text"
                    value={formatIntervalForDisplay(ipRefreshInterval)}
                    disabled
                  />
                  <Form.Text className="text-muted">
                    How often public IP addresses are refreshed.
                  </Form.Text>
                </Form.Group>
                
                <Form.Group className="mb-3">
                  <Form.Label>DNS Cache Refresh Interval</Form.Label>
                  <Form.Control
                    type="text"
                    value={formatIntervalForDisplay(cacheRefreshInterval)}
                    disabled
                  />
                  <Form.Text className="text-muted">
                    How often the DNS record cache is refreshed.
                  </Form.Text>
                </Form.Group>
              </Form>
              
              <Card className="bg-dark-blue mt-4">
                <Card.Body>
                  <div className="d-flex align-items-center">
                    <FaTrash className="text-danger me-2" />
                    <h6 className="mb-0">Danger Zone</h6>
                  </div>
                  <hr className="my-3" />
                  
                  <div className="d-grid">
                    <Button variant="outline-danger" size="sm" disabled>
                      Clear DNS Cache
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Settings;
