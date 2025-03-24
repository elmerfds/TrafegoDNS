// src/components/Providers/ProvidersPage.js - With masked value handling
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faExchangeAlt, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { useSettings } from '../../contexts/SettingsContext';
import { toast } from 'react-toastify';
import providersService from '../../services/providersService';

const ProvidersPage = () => {
  const { providers } = useSettings();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [showTokens, setShowTokens] = useState({});
  
  // Provider data states - separate from settings context
  const [providerConfigs, setProviderConfigs] = useState({});
  
  // Form input states
  const [inputValues, setInputValues] = useState({});
  
  // Load provider data
  useEffect(() => {
    if (providers && providers.current) {
      setSelectedProvider(providers.current);
      
      // Initialize separate provider configs state
      // Important: Clone the data to avoid reference issues
      setProviderConfigs(providers.configs ? JSON.parse(JSON.stringify(providers.configs)) : {});
      
      // Initialize input values as empty objects for each provider
      const initialInputs = {};
      if (providers.available) {
        providers.available.forEach(provider => {
          initialInputs[provider] = {};
        });
      }
      setInputValues(initialInputs);
      
      setIsLoading(false);
    }
  }, [providers]);

  const handleProviderChange = (e) => {
    setSelectedProvider(e.target.value);
  };

  const handleSwitchProvider = async () => {
    if (!selectedProvider || selectedProvider === providers?.current) {
      return;
    }

    setIsSwitching(true);
    try {
      await providersService.switchProvider(selectedProvider);
      toast.success(`Switched to ${selectedProvider} provider successfully`);
      // The settings context will handle the state update
    } catch (error) {
      console.error('Error switching provider:', error);
      toast.error(`Failed to switch to ${selectedProvider} provider`);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleInputChange = (provider, field, value) => {
    setInputValues(prev => ({
      ...prev,
      [provider]: {
        ...(prev[provider] || {}),
        [field]: value
      }
    }));
  };

  const handleSaveConfig = async (provider) => {
    if (!inputValues[provider] || Object.keys(inputValues[provider]).length === 0) {
      toast.warn('No changes to save');
      return;
    }
    
    setIsSaving(true);
    try {
      await providersService.updateProviderConfig(provider, inputValues[provider]);
      
      // After successful save, update our local providerConfigs state
      // to show that values are configured (even if they're masked)
      setProviderConfigs(prev => {
        const updated = { ...prev };
        if (!updated[provider]) updated[provider] = {};
        
        // For each saved field, mark it as configured in our local state
        Object.keys(inputValues[provider]).forEach(field => {
          if (inputValues[provider][field]) {
            // For sensitive fields, just store "configured" indicator
            if (isSensitiveField(field)) {
              updated[provider][field] = 'CONFIGURED';
            } else {
              updated[provider][field] = inputValues[provider][field];
            }
          }
        });
        
        return updated;
      });
      
      // Clear input values after save
      setInputValues(prev => ({
        ...prev,
        [provider]: {}
      }));
      
      toast.success(`${provider} configuration updated successfully`);
    } catch (error) {
      console.error('Error updating provider config:', error);
      toast.error(`Failed to update ${provider} configuration`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleShowToken = (provider, field) => {
    setShowTokens(prev => ({
      ...prev,
      [provider]: {
        ...(prev[provider] || {}),
        [field]: !(prev[provider] && prev[provider][field])
      }
    }));
  };

  // Helper to check if a field is a sensitive field that should be masked
  const isSensitiveField = (field) => {
    return ['token', 'apiKey', 'secretKey', 'accessKey', 'password'].includes(field);
  };

  // Helper to safely check if a field has a configured value
  const hasConfiguredValue = (provider, field) => {
    if (!providerConfigs || !providerConfigs[provider]) return false;
    
    const value = providerConfigs[provider][field];
    
    // A value exists if it's not undefined/null/empty AND not just asterisks
    return value !== undefined && 
           value !== null && 
           value !== '' && 
           value !== '***' &&
           value !== '********';
  };

  // Helper to check if a field has a masked value
  const hasMaskedValue = (provider, field) => {
    if (!providers?.configs || !providers.configs[provider]) return false;
    
    const value = providers.configs[provider][field];
    return value === '***' || value === '********' || value === 'CONFIGURED';
  };

  // Render field display value (sensitive fields show "Configured" or "Not configured")
  const getFieldDisplayValue = (provider, field) => {
    if (isSensitiveField(field)) {
      if (hasConfiguredValue(provider, field) || hasMaskedValue(provider, field)) {
        return 'Configured';
      }
      return 'Not configured';
    }
    
    // For non-sensitive fields, return the actual value if it exists
    if (providerConfigs[provider] && providerConfigs[provider][field]) {
      return providerConfigs[provider][field];
    }
    
    return 'Not configured';
  };

  const renderProviderConfig = (provider) => {
    const isShowingToken = showTokens[provider] || {};
    const providerInput = inputValues[provider] || {};
    
    switch (provider.toLowerCase()) {
      case 'cloudflare':
        return (
          <div>
            <Form.Group className="mb-3">
              <Form.Label className="text-white">API Token</Form.Label>
              <div className="input-group">
                <Form.Control 
                  type={isShowingToken.token ? "text" : "password"} 
                  placeholder="Cloudflare API Token"
                  value={providerInput.token || ''}
                  onChange={(e) => handleInputChange(provider, 'token', e.target.value)}
                  className="bg-dark text-white border-secondary"
                />
                <Button 
                  variant="outline-secondary"
                  onClick={() => toggleShowToken(provider, 'token')}
                >
                  <FontAwesomeIcon icon={isShowingToken.token ? faEyeSlash : faEye} />
                </Button>
              </div>
              <Form.Text className="text-muted">
                Current: {getFieldDisplayValue(provider, 'token')}
              </Form.Text>
              <Form.Text className="text-muted d-block mt-2">
                API token with Zone:DNS:Edit permissions for your domain
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="text-white">Zone</Form.Label>
              <Form.Control 
                type="text" 
                placeholder="example.com"
                value={providerInput.zone || ''}
                onChange={(e) => handleInputChange(provider, 'zone', e.target.value)}
                className="bg-dark text-white border-secondary"
              />
              <Form.Text className="text-muted">
                Current: {getFieldDisplayValue(provider, 'zone')}
              </Form.Text>
              <Form.Text className="text-muted d-block mt-2">
                Your domain name (e.g., example.com)
              </Form.Text>
            </Form.Group>
          </div>
        );
      case 'digitalocean':
        return (
          <div>
            <Form.Group className="mb-3">
              <Form.Label className="text-white">API Token</Form.Label>
              <div className="input-group">
                <Form.Control 
                  type={isShowingToken.token ? "text" : "password"} 
                  placeholder="DigitalOcean API Token"
                  value={providerInput.token || ''}
                  onChange={(e) => handleInputChange(provider, 'token', e.target.value)}
                  className="bg-dark text-white border-secondary"
                />
                <Button 
                  variant="outline-secondary"
                  onClick={() => toggleShowToken(provider, 'token')}
                >
                  <FontAwesomeIcon icon={isShowingToken.token ? faEyeSlash : faEye} />
                </Button>
              </div>
              <Form.Text className="text-muted">
                Current: {getFieldDisplayValue(provider, 'token')}
              </Form.Text>
              <Form.Text className="text-muted d-block mt-2">
                DigitalOcean API token with write access
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="text-white">Domain</Form.Label>
              <Form.Control 
                type="text" 
                placeholder="example.com"
                value={providerInput.domain || ''}
                onChange={(e) => handleInputChange(provider, 'domain', e.target.value)}
                className="bg-dark text-white border-secondary"
              />
              <Form.Text className="text-muted">
                Current: {getFieldDisplayValue(provider, 'domain')}
              </Form.Text>
              <Form.Text className="text-muted d-block mt-2">
                Your domain name (e.g., example.com)
              </Form.Text>
            </Form.Group>
          </div>
        );
      case 'route53':
        return (
          <div>
            <Form.Group className="mb-3">
              <Form.Label className="text-white">Access Key</Form.Label>
              <div className="input-group">
                <Form.Control 
                  type={isShowingToken.accessKey ? "text" : "password"} 
                  placeholder="AWS Access Key"
                  value={providerInput.accessKey || ''}
                  onChange={(e) => handleInputChange(provider, 'accessKey', e.target.value)}
                  className="bg-dark text-white border-secondary"
                />
                <Button 
                  variant="outline-secondary"
                  onClick={() => toggleShowToken(provider, 'accessKey')}
                >
                  <FontAwesomeIcon icon={isShowingToken.accessKey ? faEyeSlash : faEye} />
                </Button>
              </div>
              <Form.Text className="text-muted">
                Current: {getFieldDisplayValue(provider, 'accessKey')}
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="text-white">Secret Key</Form.Label>
              <div className="input-group">
                <Form.Control 
                  type={isShowingToken.secretKey ? "text" : "password"} 
                  placeholder="AWS Secret Key"
                  value={providerInput.secretKey || ''}
                  onChange={(e) => handleInputChange(provider, 'secretKey', e.target.value)}
                  className="bg-dark text-white border-secondary"
                />
                <Button 
                  variant="outline-secondary"
                  onClick={() => toggleShowToken(provider, 'secretKey')}
                >
                  <FontAwesomeIcon icon={isShowingToken.secretKey ? faEyeSlash : faEye} />
                </Button>
              </div>
              <Form.Text className="text-muted">
                Current: {getFieldDisplayValue(provider, 'secretKey')}
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="text-white">Zone</Form.Label>
              <Form.Control 
                type="text" 
                placeholder="example.com"
                value={providerInput.zone || ''}
                onChange={(e) => handleInputChange(provider, 'zone', e.target.value)}
                className="bg-dark text-white border-secondary"
              />
              <Form.Text className="text-muted">
                Current: {getFieldDisplayValue(provider, 'zone')}
              </Form.Text>
              <Form.Text className="text-muted d-block mt-2">
                Your domain name (e.g., example.com)
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="text-white">Zone ID (optional)</Form.Label>
              <Form.Control 
                type="text" 
                placeholder="Z1234567890ABC"
                value={providerInput.zoneId || ''}
                onChange={(e) => handleInputChange(provider, 'zoneId', e.target.value)}
                className="bg-dark text-white border-secondary"
              />
              <Form.Text className="text-muted">
                Current: {getFieldDisplayValue(provider, 'zoneId')}
              </Form.Text>
              <Form.Text className="text-muted d-block mt-2">
                Your Route53 hosted zone ID (alternative to Zone)
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="text-white">Region</Form.Label>
              <Form.Control 
                type="text" 
                placeholder="eu-west-2"
                value={providerInput.region || ''}
                onChange={(e) => handleInputChange(provider, 'region', e.target.value)}
                className="bg-dark text-white border-secondary"
              />
              <Form.Text className="text-muted">
                Current: {getFieldDisplayValue(provider, 'region') || 'Default: eu-west-2'}
              </Form.Text>
              <Form.Text className="text-muted d-block mt-2">
                AWS region for API calls (default: eu-west-2)
              </Form.Text>
            </Form.Group>
          </div>
        );
      default:
        return (
          <Alert variant="warning">
            Configuration for {provider} is not available.
          </Alert>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3 text-white">Loading provider configurations...</p>
      </div>
    );
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="mb-0 text-white">DNS Providers</h1>
          <p className="text-muted mb-0">Configure and manage your DNS providers</p>
        </div>
      </div>

      <Card className="mb-4 bg-dark text-white">
        <Card.Header className="border-bottom border-secondary">
          <h5 className="mb-0">Active Provider</h5>
        </Card.Header>
        <Card.Body>
          {providers?.available?.length > 0 ? (
            <Row className="align-items-center">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Select DNS Provider</Form.Label>
                  <Form.Select 
                    value={selectedProvider} 
                    onChange={handleProviderChange}
                    disabled={isSwitching}
                    className="bg-dark text-white border-secondary"
                  >
                    {providers.available.map(provider => (
                      <option key={provider} value={provider}>
                        {provider.charAt(0).toUpperCase() + provider.slice(1)}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6} className="mt-3 mt-md-0">
                <Button 
                  variant="primary"
                  onClick={handleSwitchProvider}
                  disabled={isSwitching || selectedProvider === providers.current}
                >
                  {isSwitching ? (
                    <>
                      <Spinner size="sm" animation="border" className="me-2" />
                      Switching...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faExchangeAlt} className="me-2" />
                      Switch Provider
                    </>
                  )}
                </Button>
              </Col>
            </Row>
          ) : (
            <Alert variant="warning">
              No DNS providers available. Check your server configuration.
            </Alert>
          )}
        </Card.Body>
      </Card>

      {providers?.available?.map(provider => (
        <Card key={provider} className="mb-4 bg-dark text-white">
          <Card.Header className="border-bottom border-secondary">
            <h5 className="mb-0">{provider.charAt(0).toUpperCase() + provider.slice(1)} Configuration</h5>
          </Card.Header>
          <Card.Body>
            <Form>
              {renderProviderConfig(provider)}
              <div className="text-end">
                <Button 
                  variant="primary" 
                  onClick={() => handleSaveConfig(provider)}
                  disabled={isSaving || !inputValues[provider] || Object.keys(inputValues[provider]).length === 0}
                >
                  {isSaving ? (
                    <>
                      <Spinner size="sm" animation="border" className="me-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faSave} className="me-2" />
                      Save Configuration
                    </>
                  )}
                </Button>
              </div>
            </Form>
          </Card.Body>
        </Card>
      ))}
    </>
  );
};

export default ProvidersPage;