// src/components/DNSRecords/RecordEditModal.js
import React, { useState, useEffect } from 'react';
import { Modal, Form, Button, Row, Col, Spinner } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faShieldAlt } from '@fortawesome/free-solid-svg-icons';

const RecordEditModal = ({ show, onHide, record, onSave, providerName, editMode = false }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    type: 'A',
    content: '',
    ttl: 300,
    proxied: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  // Record type options based on provider
  const recordTypes = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV'];
  
  // Check if we can show proxied option (Cloudflare only)
  const canShowProxied = (providerName || '').toLowerCase() === 'cloudflare';

  useEffect(() => {
    if (record) {
      setFormData({
        id: record.id || '',
        name: record.name || '',
        type: record.type || 'A',
        content: record.content || '',
        ttl: record.ttl || 300,
        proxied: record.proxied !== undefined ? record.proxied : false
      });
    }
  }, [record]);

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
      // Basic IPv6 validation - could be more comprehensive
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
      
      await onSave(recordData);
    } catch (error) {
      console.error('Error saving record:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>{editMode ? 'Edit DNS Record' : 'Create DNS Record'}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Record Name</Form.Label>
            <Form.Control
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              isInvalid={!!validationErrors.name}
              disabled={editMode} // Can't change name in edit mode
            />
            <Form.Control.Feedback type="invalid">
              {validationErrors.name}
            </Form.Control.Feedback>
            <Form.Text className="text-muted">
              Fully qualified domain name (e.g., api.example.com)
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
                  disabled={editMode} // Can't change type in edit mode
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
                id="proxied-checkbox"
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
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner animation="border" size="sm" className="me-1" />
                Saving...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faSave} className="me-1" />
                Save Changes
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default RecordEditModal;