// src/components/Settings/SettingsPage.js
import React, { useState } from 'react';
import { Card, Form, Button, Row, Col, Spinner, Alert } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faRedo, faExchangeAlt } from '@fortawesome/free-solid-svg-icons';
import { useSettings } from '../../contexts/SettingsContext';
import { toast } from 'react-toastify';
import PageHeader from '../Layout/PageHeader';
import { useAuth } from '../../contexts/AuthContext';

const SettingsPage = () => {
  const { settings, operationMode, updateSettings, resetSettings, switchOperationMode } = useSettings();
  const { hasRole } = useAuth();
  const [formData, setFormData] = useState({});
  const [selectedMode, setSelectedMode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Initialize form data when settings are loaded
  React.useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
    if (operationMode) {
      setSelectedMode(operationMode.current);
    }
  }, [settings, operationMode]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleModeChange = (e) => {
    setSelectedMode(e.target.value);
  };

  const handleSwitchMode = async () => {
    if (!selectedMode || selectedMode === operationMode.current) {
      return;
    }

    setIsSwitchingMode(true);
    try {
      await switchOperationMode(selectedMode);
      toast.success(`Switched to ${selectedMode} mode successfully`);
    } catch (error) {
      console.error('Error switching mode:', error);
      toast.error(`Failed to switch to ${selectedMode} mode`);
    } finally {
      setIsSwitchingMode(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Convert numeric strings to numbers
      const parsedData = {
        ...formData,
        pollInterval: parseInt(formData.pollInterval, 10)
      };
      
      await updateSettings(parsedData);
      toast.success('Settings updated successfully');
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error('Failed to update settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetSettings();
      toast.success('Settings reset to defaults');
    } catch (error) {
      console.error('Error resetting settings:', error);
      toast.error('Failed to reset settings');
    } finally {
      setIsResetting(false);
    }
  };

  const isAdmin = hasRole('admin');

  if (!settings || !operationMode) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3">Loading settings...</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Configure application behavior" />

      <Card className="mb-4">
        <Card.Header>
          <h5 className="mb-0">Operation Mode</h5>
        </Card.Header>
        <Card.Body>
          <Row className="align-items-center">
            <Col md={6}>
              <Form.Group>
                <Form.Label>Select Operation Mode</Form.Label>
                <Form.Select 
                  value={selectedMode} 
                  onChange={handleModeChange}
                  disabled={isSwitchingMode || !isAdmin}
                >
                  {operationMode.available && operationMode.available.map(mode => (
                    <option key={mode} value={mode}>
                      {mode.charAt(0).toUpperCase() + mode.slice(1)} Mode
                    </option>
                  ))}
                </Form.Select>
                <Form.Text className="text-muted">
                  Traefik mode uses the Traefik API to detect hostnames. Direct mode uses Docker labels directly.
                </Form.Text>
              </Form.Group>
            </Col>
            <Col md={6} className="mt-3 mt-md-0">
              {isAdmin ? (
                <Button 
                  variant="primary"
                  onClick={handleSwitchMode}
                  disabled={isSwitchingMode || selectedMode === operationMode.current}
                >
                  {isSwitchingMode ? (
                    <>
                      <Spinner size="sm" animation="border" className="me-2" />
                      Switching...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faExchangeAlt} className="me-2" />
                      Switch Mode
                    </>
                  )}
                </Button>
              ) : (
                <Alert variant="info">
                  Admin privileges required to change operation mode
                </Alert>
              )}
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Application Settings</h5>
          {isAdmin && (
            <Button 
              variant="outline-secondary" 
              size="sm"
              onClick={handleReset}
              disabled={isResetting}
            >
              {isResetting ? (
                <>
                  <Spinner size="sm" animation="border" className="me-1" />
                  Resetting...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faRedo} className="me-1" />
                  Reset to Defaults
                </>
              )}
            </Button>
          )}
        </Card.Header>
        <Card.Body>
          <Form onSubmit={handleSubmit}>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Poll Interval (ms)</Form.Label>
                  <Form.Control
                    type="number"
                    name="pollInterval"
                    value={formData.pollInterval || ''}
                    onChange={handleInputChange}
                    disabled={!isAdmin}
                    min="5000"
                  />
                  <Form.Text className="text-muted">
                    How often to poll for changes (minimum 5000ms)
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Log Level</Form.Label>
                  <Form.Select
                    name="logLevel"
                    value={formData.logLevel || ''}
                    onChange={handleInputChange}
                    disabled={!isAdmin}
                  >
                    <option value="ERROR">ERROR</option>
                    <option value="WARN">WARN</option>
                    <option value="INFO">INFO</option>
                    <option value="DEBUG">DEBUG</option>
                    <option value="TRACE">TRACE</option>
                  </Form.Select>
                  <Form.Text className="text-muted">
                    Controls the verbosity of logging
                  </Form.Text>
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Check
                    type="checkbox"
                    label="Watch Docker Events"
                    name="watchDockerEvents"
                    checked={formData.watchDockerEvents || false}
                    onChange={handleInputChange}
                    disabled={!isAdmin}
                  />
                  <Form.Text className="text-muted">
                    Automatically detect container changes via Docker events
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Check
                    type="checkbox"
                    label="Cleanup Orphaned Records"
                    name="cleanupOrphaned"
                    checked={formData.cleanupOrphaned || false}
                    onChange={handleInputChange}
                    disabled={!isAdmin}
                  />
                  <Form.Text className="text-muted">
                    Automatically remove DNS records for deleted containers
                  </Form.Text>
                </Form.Group>
              </Col>
            </Row>

            {isAdmin ? (
              <div className="d-flex justify-content-end">
                <Button 
                  type="submit" 
                  variant="primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Spinner size="sm" animation="border" className="me-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faSave} className="me-2" />
                      Save Settings
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <Alert variant="info">
                Admin privileges required to edit settings
              </Alert>
            )}
          </Form>
        </Card.Body>
      </Card>
    </>
  );
};

export default SettingsPage;