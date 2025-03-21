// src/webui/components/managed/ManagedHostnameForm.jsx
import React, { useState, useEffect } from 'react';
import { Form, Button, Row, Col, Alert } from 'react-bootstrap';
import { FaExclamationTriangle } from 'react-icons/fa';

const ManagedHostnameForm = ({ onSubmit, initialData, isSubmitting, onCancel }) => {
  const [formData, setFormData] = useState({
    hostname: '',
    type: 'A',
    content: '',
    ttl: 3600,
    proxied: false,
    ...initialData
  });
  
  const [errors, setErrors] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Update content field with placeholder based on type
  useEffect(() => {
    if (!formData.content && formData.type) {
      const placeholders = {
        'A': '192.168.1.1',
        'AAAA': '2001:db8::1',
        'CNAME': 'example.com',
        'MX': 'mail.example.com',
        'TXT': 'v=spf1 include:_spf.example.com ~all',
        'SRV': 'service.example.com'
      };
      
      setFormData(prev => ({
        ...prev,
        content: ''
      }));
    }
  }, [formData.type]);
  
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Clear validation error when field is changed
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };
  
  const validateForm = () => {
    const newErrors = {};
    
    // Validate hostname
    if (!formData.hostname) {
      newErrors.hostname = 'Hostname is required';
    } else if (!formData.hostname.includes('.')) {
      newErrors.hostname = 'Hostname must be a valid domain (e.g., example.com)';
    }
    
    // Validate content based on type
    if (!formData.content) {
      newErrors.content = 'Content is required';
    } else {
      // Type-specific validations
      switch (formData.type) {
        case 'A':
          if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(formData.content)) {
            newErrors.content = 'Must be a valid IPv4 address (e.g., 192.168.1.1)';
          }
          break;
        case 'AAAA':
          // Simple IPv6 validation - could be more comprehensive
          if (!formData.content.includes(':')) {
            newErrors.content = 'Must be a valid IPv6 address';
          }
          break;
        case 'MX':
          if (!formData.content.includes('.')) {
            newErrors.content = 'Must be a valid mail server domain';
          }
          break;
      }
    }
    
    // Validate TTL
    if (formData.ttl <= 0) {
      newErrors.ttl = 'TTL must be greater than 0';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      const success = await onSubmit(formData);
      if (success) {
        // Reset form on successful submission
        setFormData({
          hostname: '',
          type: 'A',
          content: '',
          ttl: 3600,
          proxied: false
        });
      }
    }
  };
  
  const getContentPlaceholder = () => {
    const placeholders = {
      'A': '192.168.1.1',
      'AAAA': '2001:db8::1',
      'CNAME': 'example.com',
      'MX': 'mail.example.com',
      'TXT': 'v=spf1 include:_spf.example.com ~all',
      'SRV': 'service.example.com'
    };
    
    return placeholders[formData.type] || 'Enter content';
  };
  
  return (
    <Form onSubmit={handleSubmit}>
      {Object.values(errors).some(error => error) && (
        <Alert variant="danger">
          <FaExclamationTriangle className="me-2" />
          Please correct the errors below
        </Alert>
      )}
      
      <Row className="mb-3">
        <Col md={12}>
          <Form.Group>
            <Form.Label>Hostname</Form.Label>
            <Form.Control
              type="text"
              name="hostname"
              value={formData.hostname}
              onChange={handleChange}
              placeholder="e.g., api.example.com"
              isInvalid={!!errors.hostname}
              required
            />
            <Form.Control.Feedback type="invalid">
              {errors.hostname}
            </Form.Control.Feedback>
          </Form.Group>
        </Col>
      </Row>
      
      <Row className="mb-3">
        <Col md={6}>
          <Form.Group>
            <Form.Label>Record Type</Form.Label>
            <Form.Select
              name="type"
              value={formData.type}
              onChange={handleChange}
              required
            >
              <option value="A">A (IPv4 Address)</option>
              <option value="AAAA">AAAA (IPv6 Address)</option>
              <option value="CNAME">CNAME (Alias)</option>
              <option value="MX">MX (Mail Server)</option>
              <option value="TXT">TXT (Text Record)</option>
              <option value="SRV">SRV (Service Record)</option>
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>TTL (Time To Live)</Form.Label>
            <Form.Select
              name="ttl"
              value={formData.ttl}
              onChange={handleChange}
              isInvalid={!!errors.ttl}
            >
              <option value="1">Automatic</option>
              <option value="60">1 minute (60s)</option>
              <option value="300">5 minutes (300s)</option>
              <option value="600">10 minutes (600s)</option>
              <option value="1800">30 minutes (1800s)</option>
              <option value="3600">1 hour (3600s)</option>
              <option value="7200">2 hours (7200s)</option>
              <option value="86400">1 day (86400s)</option>
            </Form.Select>
            <Form.Control.Feedback type="invalid">
              {errors.ttl}
            </Form.Control.Feedback>
          </Form.Group>
        </Col>
      </Row>
      
      <Row className="mb-3">
        <Col md={12}>
          <Form.Group>
            <Form.Label>Content</Form.Label>
            <Form.Control
              type="text"
              name="content"
              value={formData.content}
              onChange={handleChange}
              placeholder={getContentPlaceholder()}
              isInvalid={!!errors.content}
              required
            />
            <Form.Control.Feedback type="invalid">
              {errors.content}
            </Form.Control.Feedback>
            <Form.Text className="text-muted">
              {formData.type === 'A' && 'Enter an IPv4 address (e.g., 192.168.1.1)'}
              {formData.type === 'AAAA' && 'Enter an IPv6 address (e.g., 2001:db8::1)'}
              {formData.type === 'CNAME' && 'Enter a domain name (e.g., example.com)'}
              {formData.type === 'MX' && 'Enter a mail server domain (e.g., mail.example.com)'}
              {formData.type === 'TXT' && 'Enter text content (e.g., v=spf1 include:_spf.example.com ~all)'}
              {formData.type === 'SRV' && 'Enter target hostname (e.g., service.example.com)'}
            </Form.Text>
          </Form.Group>
        </Col>
      </Row>
      
      {formData.type === 'MX' && (
        <Row className="mb-3">
          <Col md={12}>
            <Form.Group>
              <Form.Label>Priority</Form.Label>
              <Form.Control
                type="number"
                name="priority"
                value={formData.priority || 10}
                onChange={handleChange}
                min="0"
                max="65535"
              />
              <Form.Text className="text-muted">
                Lower values have higher priority (typically 10 for primary mail server)
              </Form.Text>
            </Form.Group>
          </Col>
        </Row>
      )}
      
      {formData.type === 'SRV' && (
        <Row className="mb-3">
          <Col md={4}>
            <Form.Group>
              <Form.Label>Priority</Form.Label>
              <Form.Control
                type="number"
                name="priority"
                value={formData.priority || 1}
                onChange={handleChange}
                min="0"
                max="65535"
              />
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group>
              <Form.Label>Weight</Form.Label>
              <Form.Control
                type="number"
                name="weight"
                value={formData.weight || 1}
                onChange={handleChange}
                min="0"
                max="65535"
              />
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group>
              <Form.Label>Port</Form.Label>
              <Form.Control
                type="number"
                name="port"
                value={formData.port || 80}
                onChange={handleChange}
                min="1"
                max="65535"
              />
            </Form.Group>
          </Col>
        </Row>
      )}
      
      {['A', 'AAAA', 'CNAME'].includes(formData.type) && (
        <Row className="mb-3">
          <Col md={12}>
            <Form.Group>
              <Form.Check
                type="checkbox"
                id="proxied-checkbox"
                name="proxied"
                label="Enable Cloudflare proxy (orange cloud)"
                checked={formData.proxied}
                onChange={handleChange}
              />
              <Form.Text className="text-muted">
                Only applicable for Cloudflare DNS provider. Enables HTTPS, CDN, and other Cloudflare features.
              </Form.Text>
            </Form.Group>
          </Col>
        </Row>
      )}
      
      <div className="d-flex justify-content-end mt-4">
        <Button variant="secondary" onClick={onCancel} className="me-2" disabled={isSubmitting}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Hostname'}
        </Button>
      </div>
    </Form>
  );
};

export default ManagedHostnameForm;
