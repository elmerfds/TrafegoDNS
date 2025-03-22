// src/components/DNSRecords/RecordCreateForm.js
import React, { useState } from 'react';
import { Card, Button, Form, Row, Col, Spinner, Alert } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faShieldAlt, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { toast } from 'react-toastify';
import recordsService from '../../services/recordsService';

const RecordCreateForm = ({ providerName, onRecordCreated }) => {
  const initialFormState = {
    name: '',
    type: 'A',
    content: '',
    ttl: 300,
    proxied: false
  };

  const [formData, setFormData] = useState({ ...initialFormState });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [formVisible, setFormVisible] = useState(false);

  // Record type options
  const recordTypes = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV'];
  
  // Check if we can show proxied option (Cloudflare only)
  const canShowProxied = (providerName || '').toLowerCase() === 'cloudflare';

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
    
    // Clear validation error for this field
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Record name is required';
    }
    
    if (!formData.content.trim()) {
      errors.content = 'Content is required';
    }
    
    // Type-specific validations
    if (formData.type === 'A') {
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipv4Regex.test(formData.content)) {
        errors.content = 'Invalid IPv4 address format';
      }
    } else if (formData.type === 'AAAA') {
      // Basic IPv6 validation
      if (!formData.content.includes(':')) {
        errors.content = 'Invalid IPv6 address format';
      }
    }
    
    if (formData.ttl && (isNaN(formData.ttl) || parseInt(formData.ttl) < 0)) {
      errors.ttl = 'TTL must be a positive number';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Prepare record data
      const recordData = {
        ...formData,
        ttl: formData.ttl ? parseInt(formData.ttl) : null
      };
      
      const response = await recordsService.createRecord(recordData);
      toast.success(`Successfully created DNS record: ${formData.name}`);
      
      // Reset form
      setFormData({ ...initialFormState });
      
      // Call the callback
      if (onRecordCreated) {
        onRecordCreated(response.data.record);
      }
      
      // Hide the form if desired
      if (!formVisible) {
        setFormVisible(false);
      }
    } catch (error) {
      console.error('Error creating record:', error);
      toast.error(`Failed to create record: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleFormVisibility = () => {
    setFormVisible(!formVisible);
    if (!formVisible) {
      // Reset form and errors when opening
      setFormData({ ...initialFormState });
      setValidationErrors({});
    }
  };

  return (
    <Card className="mb-4">
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center">
          <span>{formVisible ? 'Create New DNS Record' : 'Add DNS Record'}</span>
          <Button 
            variant={formVisible ? "outline-secondary" : "primary"} 
            size="sm"
            onClick={toggleFormVisibility}
          >
            {formVisible ? 'Cancel' : (
              <>
                <FontAwesomeIcon icon={faPlus} className="me-1" />
                Create Record
              </>
            )}
          </Button>
        </div>
      </Card.Header>
      
      {formVisible && (
        <Card.Body>
          <Alert variant="info" className="mb-3">
            <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
            Create a new DNS record directly with your provider. This record will be tracked by TráfegoDNS.
          </Alert>

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Record Name</Form.Label>
              <Form.Control
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., api.example.com"
                isInvalid={!!validationErrors.name}
              />
              <Form.Control.Feedback type="invalid">
                {validationErrors.name}
              </Form.Control.Feedback>
              <Form.Text className="text-muted">
                Fully qualified domain name
              </Form.Text>
            </Form.Group>

            <Row className="mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Type</Form.Label>
                  <Form.Select
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                  >
                    {recordTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>TTL (seconds)</Form.Label>
                  <Form.Control
                    type="number"
                    name="ttl"
                    value={formData.ttl}
                    onChange={handleInputChange}
                    min="1"
                    isInvalid={!!validationErrors.ttl}
                  />
                  <Form.Control.Feedback type="invalid">
                    {validationErrors.ttl}
                  </Form.Control.Feedback>
                  <Form.Text className="text-muted">
                    Time to live in seconds (1 = Auto for Cloudflare)
                  </Form.Text>
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>Content</Form.Label>
              <Form.Control
                type="text"
                name="content"
                value={formData.content}
                onChange={handleInputChange}
                placeholder={formData.type === 'A' ? '192.168.1.1' : 
                           formData.type === 'CNAME' ? 'example.com' : ''}
                isInvalid={!!validationErrors.content}
              />
              <Form.Control.Feedback type="invalid">
                {validationErrors.content}
              </Form.Control.Feedback>
              <Form.Text className="text-muted">
                {formData.type === 'A' && 'IP address (e.g., 192.168.1.1)'}
                {formData.type === 'AAAA' && 'IPv6 address'}
                {formData.type === 'CNAME' && 'Target domain (e.g., example.com)'}
                {formData.type === 'MX' && 'Mail server (e.g., mail.example.com)'}
                {formData.type === 'TXT' && 'Text content'}
              </Form.Text>
            </Form.Group>

            {canShowProxied && ['A', 'AAAA', 'CNAME'].includes(formData.type) && (
              <Form.Group className="mb-3">
                <Form.Check
                  type="checkbox"
                  id="create-proxied-checkbox"
                  name="proxied"
                  checked={formData.proxied}
                  onChange={handleInputChange}
                  label={
                    <>
                      <FontAwesomeIcon icon={faShieldAlt} className="me-1 text-success" />
                      Proxied through Cloudflare
                    </>
                  }
                />
                <Form.Text className="text-muted">
                  Enables Cloudflare security and performance features
                </Form.Text>
              </Form.Group>
            )}

            <div className="d-flex justify-content-end">
              <Button 
                type="submit" 
                variant="primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-1" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faPlus} className="me-1" />
                    Create Record
                  </>
                )}
              </Button>
            </div>
          </Form>
        </Card.Body>
      )}
    </Card>
  );
};

export default RecordCreateForm;