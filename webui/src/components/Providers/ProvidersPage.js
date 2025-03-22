// src/components/Providers/ProvidersPage.js
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Form, Button, Spinner, Alert, Table } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSyncAlt, faSave, faExchangeAlt } from '@fortawesome/free-solid-svg-icons';
import { useSettings } from '../../contexts/SettingsContext';
import { toast } from 'react-toastify';
import providersService from '../../services/providersService';
import PageHeader from '../Layout/PageHeader';

const ProvidersPage = () => {
  const { providers, switchProvider, updateProviderConfig } = useSettings();
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [providerConfigs, setProviderConfigs] = useState({});

  // Initialize form when providers are loaded
  useEffect(() => {
    if (providers && providers.current) {
      setSelectedProvider(providers.current);
      setProviderConfigs(providers.configs || {});
    }
  }, [providers]);

  const handleProviderChange = (e) => {
    setSelectedProvider(e.target.value);
  };

  const handleSwitchProvider = async () => {
    if (!selectedProvider || selectedProvider === providers.current) {
      return;
    }

    setIsSwitching(true);
    try {
      await switchProvider(selectedProvider);
      toast.success(`Switched to ${selectedProvider} provider successfully`);
    } catch (error) {
      console.error('Error switching provider:', error);
      toast.error(`Failed to switch to ${selectedProvider} provider`);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleConfigChange = (provider, field, value) => {
    setProviderConfigs(prev => ({
      ...prev,
      [provider]: {
        ...(prev[provider] || {}),
        [field]: value
      }
    }));
  };

  const handleSaveConfig = async (provider) => {
    setIsLoading(true);
    try {
      await updateProviderConfig(provider, providerConfigs[provider] || {});
      toast.success(`${provider} configuration updated successfully`);
    } catch (error) {
      console.error('Error updating provider config:', error);
      toast.error(`Failed to update ${provider} configuration`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderProviderConfig = (provider) => {
    const config = providerConfigs[provider] || {};
    
    switch (provider.toLowerCase()) {
      case 'cloudflare':
        return (
          <div>
            <Form.Group className="mb-3">
              <Form.Label>API Token</Form.Label>
              <Form.Control 
                type="password" 
                placeholder="Cloudflare API Token"
                value={config.token || ''}
                onChange={(e) => handleConfigChange(provider, 'token', e.target.value)}
              />
              <Form.Text className="text-muted">
                API token with Zone:DNS:Edit permissions for your domain
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Zone</Form.Label>
              <Form.Control 
                type="text" 
                placeholder="example.com"
                value={config.zone || ''}
                onChange={(e) => handleConfigChange(provider, 'zone', e.target.value)}
              />
              <Form.Text className="text-muted">
                Your domain name (e.g., example.com)
              </Form.Text>
            </Form.Group>
          </div>
        );
      case 'digitalocean':
        return (
          <div>
            <Form.Group className="mb-3">
              <Form.Label>API Token</Form.Label>
              <Form.Control 
                type="password" 
                placeholder="DigitalOcean API Token"
                value={config.token || ''}
                onChange={(e) => handleConfigChange(provider, 'token', e.target.value)}
              />
              <Form.Text className="text-muted">
                DigitalOcean API token with write access
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Domain</Form.Label>
              <Form.Control 
                type="text" 
                placeholder="example.com"
                value={config.domain || ''}
                onChange={(e) => handleConfigChange(provider, 'domain', e.target.value)}
              />
              <Form.Text className="text-muted">
                Your domain name (e.g., example.com)
              </Form.Text>
            </Form.Group>
          </div>
        );
      case 'route53':
        return (
          <div>
            <Form.Group className="mb-3">
              <Form.Label>Access Key</Form.Label>
              <Form.Control 
                type="text" 
                placeholder="AWS Access Key"
                value={config.accessKey || ''}
                onChange={(e) => handleConfigChange(provider, 'accessKey', e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Secret Key</Form.Label>
              <Form.Control 
                type="password" 
                placeholder="AWS Secret Key"
                value={config.secretKey || ''}
                onChange={(e) => handleConfigChange(provider, 'secretKey', e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Zone</Form.Label>
              <Form.Control 
                type="text" 
                placeholder="example.com"
                value={config.zone || ''}
                onChange={(e) => handleConfigChange(provider, 'zone', e.target.value)}
              />
              <Form.Text className="text-muted">
                Your domain name (e.g., example.com)
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Zone ID (optional)</Form.Label>
              <Form.Control 
                type="text" 
                placeholder="Z1234567890ABC"
                value={config.zoneId || ''}
                onChange={(e) => handleConfigChange(provider, 'zoneId', e.target.value)}
              />
              <Form.Text className="text-muted">
                Your Route53 hosted zone ID (alternative to Zone)
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Region</Form.Label>
              <Form.Control 
                type="text" 
                placeholder="eu-west-2"
                value={config.region || ''}
                onChange={(e) => handleConfigChange(provider, 'region', e.target.value)}
              />
              <Form.Text className="text-muted">
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

  return (
    <>
      <PageHeader 
        title="DNS Providers" 
        subtitle="Configure and manage your DNS providers" 
      />

      <Card className="mb-4">
        <Card.Header>
          <h5 className="mb-0">Active Provider</h5>
        </Card.Header>
        <Card.Body>
          {providers ? (
            <Row className="align-items-center">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Select DNS Provider</Form.Label>
                  <Form.Select 
                    value={selectedProvider} 
                    onChange={handleProviderChange}
                    disabled={isSwitching}
                  >
                    {providers.available && providers.available.map(provider => (
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
            <div className="text-center py-3">
              <Spinner animation="border" variant="primary" />
              <p className="mt-2">Loading providers...</p>
            </div>
          )}
        </Card.Body>
      </Card>

      {providers && providers.available && providers.available.map(provider => (
        <Card key={provider} className="mb-4">
          <Card.Header>
            <h5 className="mb-0">{provider.charAt(0).toUpperCase() + provider.slice(1)} Configuration</h5>
          </Card.Header>
          <Card.Body>
            <Form>
              {renderProviderConfig(provider)}
              <div className="text-end">
                <Button 
                  variant="primary" 
                  onClick={() => handleSaveConfig(provider)}
                  disabled={isLoading}
                >
                  {isLoading ? (
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

      <Card>
        <Card.Header>
          <h5 className="mb-0">Active DNS Provider Information</h5>
        </Card.Header>
        <Card.Body>
          {providers && providers.current ? (
            <Table responsive striped>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Current Provider</td>
                  <td><strong>{providers.current}</strong></td>
                </tr>
                <tr>
                  <td>Domain/Zone</td>
                  <td>
                    {providers.configs && providers.configs[providers.current] ? (
                      providers.configs[providers.current].zone || 
                      providers.configs[providers.current].domain || 
                      'Not configured'
                    ) : (
                      'Not configured'
                    )}
                  </td>
                </tr>
              </tbody>
            </Table>
          ) : (
            <Alert variant="warning">
              No DNS provider is currently active. Please configure and select a provider.
            </Alert>
          )}
        </Card.Body>
      </Card>
    </>
  );
};

export default ProvidersPage;