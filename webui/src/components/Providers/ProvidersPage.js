// src/components/Providers/ProvidersPage.js - Fixed version
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faExchangeAlt, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { useSettings } from '../../contexts/SettingsContext';
import { toast } from 'react-toastify';
import providersService from '../../services/providersService';

const ProvidersPage = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [showTokens, setShowTokens] = useState({});
  
  // Provider data states
  const [providerData, setProviderData] = useState({
    current: '',
    available: [],
    configs: {}
  });
  
  // Form input states
  const [inputValues, setInputValues] = useState({});
  
  // Load provider data directly from API
  useEffect(() => {
    fetchProviderData();
  }, []);
  
  const fetchProviderData = async () => {
    setIsLoading(true);
    try {
      // Use the enhanced service method to get detailed provider configs
      const response = await providersService.fetchAllProviderConfigs();
      console.log('Provider data loaded:', response);
      
      setProviderData(response);
      setSelectedProvider(response.current || '');
      
      // Initialize input values from current configs
      const initialInputs = {};
      if (response.configs) {
        Object.keys(response.configs).forEach(provider => {
          initialInputs[provider] = { ...response.configs[provider] };
        });
      }
      setInputValues(initialInputs);
      
    } catch (error) {
      console.error('Error fetching provider data:', error);
      toast.error('Failed to load provider configurations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProviderChange = (e) => {
    setSelectedProvider(e.target.value);
  };

  const handleSwitchProvider = async () => {
    if (!selectedProvider || selectedProvider === providerData.current) {
      return;
    }

    setIsSwitching(true);
    try {
      await providersService.switchProvider(selectedProvider);
      
      // Update local state
      setProviderData(prev => ({
        ...prev,
        current: selectedProvider
      }));
      
      toast.success(`Switched to ${selectedProvider} provider successfully`);
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
    if (!inputValues[provider]) return;
    
    setIsSaving(true);
    try {
      await providersService.updateProviderConfig(provider, inputValues[provider]);
      
      // Update local provider data state
      setProviderData(prev => ({
        ...prev,
        configs: {
          ...prev.configs,
          [provider]: inputValues[provider]
        }
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

  // Helper to safely get current config value
  const getCurrentValue = (provider, field) => {
    if (
      providerData.configs && 
      providerData.configs[provider] && 
      providerData.configs[provider][field] !== undefined
    ) {
      return providerData.configs[provider][field];
    }
    return null;
  };

  // Helper to check if a field has a configured value
  const hasConfiguredValue = (provider, field) => {
    const value = getCurrentValue(provider, field);
    return value !== null && value !== undefined && value !== '';
  };

  // Mask sensitive values (show first 4 and last 4 characters)
  const maskValue = (value, show = false) => {
    if (!value) return '';
    if (show) return value;
    
    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }
    
    return `${value.substring(0, 4)}${'*'.repeat(value.length - 8)}${value.substring(value.length - 4)}`;
  };

  const renderProviderConfig = (provider) => {
    const config = providerData.configs?.[provider] || {};
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
                {hasConfiguredValue(provider, 'token') ? 
                  `Current: ${maskValue(config.token, isShowingToken.token)}` : 
                  'No token configured'}
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
                {hasConfiguredValue(provider, 'zone') ? 
                  `Current: ${config.zone}` : 
                  'No zone configured'}
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
                {hasConfiguredValue(provider, 'token') ? 
                  `Current: ${maskValue(config.token, isShowingToken.token)}` : 
                  'No token configured'}
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
                {hasConfiguredValue(provider, 'domain') ? 
                  `Current: ${config.domain}` : 
                  'No domain configured'}
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
                {hasConfiguredValue(provider, 'accessKey') ? 
                  `Current: ${maskValue(config.accessKey, isShowingToken.accessKey)}` : 
                  'No access key configured'}
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
                {hasConfiguredValue(provider, 'secretKey') ? 
                  `Current: ${maskValue(config.secretKey, isShowingToken.secretKey)}` : 
                  'No secret key configured'}
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
                {hasConfiguredValue(provider, 'zone') ? 
                  `Current: ${config.zone}` : 
                  'No zone configured'}
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
                {hasConfiguredValue(provider, 'zoneId') ? 
                  `Current: ${config.zoneId}` : 
                  'No zone ID configured'}
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
                {hasConfiguredValue(provider, 'region') ? 
                  `Current: ${config.region}` : 
                  'Default: eu-west-2'}
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
          {providerData.available && providerData.available.length > 0 ? (
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
                    {providerData.available.map(provider => (
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
                  disabled={isSwitching || selectedProvider === providerData.current}
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

      {providerData.available && providerData.available.map(provider => (
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
                  disabled={isSaving}
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