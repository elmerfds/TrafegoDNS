// src/components/DNSRecords/ManagedHostnamesTab.js
import React, { useState } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Form, 
  Modal, 
  Badge, 
  InputGroup, 
  Alert, 
  Spinner,
  Row,
  Col 
} from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlus, 
  faTrash, 
  faEdit, 
  faSearch,
  faExclamationTriangle,
  faInfoCircle, 
  faShieldAlt, 
  faSave, 
  faTimes
} from '@fortawesome/free-solid-svg-icons';
import { toast } from 'react-toastify';
import recordsService from '../../services/recordsService';
import RecordTypeBadge from './RecordTypeBadge';

const ManagedHostnamesTab = ({ managedHostnames = [], updateManagedHostnames, providerName, onHostnamesChanged }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedHostname, setSelectedHostname] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [formData, setFormData] = useState({
    hostname: '',
    type: 'A',
    content: '',
    ttl: 300,
    proxied: true
  });

  const filteredHostnames = managedHostnames.filter(item => 
    item.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.content && item.content.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value.toLowerCase());
  };

  const handleAddClick = () => {
    setFormData({
      hostname: '',
      type: 'A',
      content: '',
      ttl: 300,
      proxied: true
    });
    setShowAddModal(true);
  };

  const handleEditClick = (hostnameConfig) => {
    setSelectedHostname(hostnameConfig);
    setFormData({
      hostname: hostnameConfig.hostname,
      type: hostnameConfig.type,
      content: hostnameConfig.content,
      ttl: hostnameConfig.ttl,
      proxied: hostnameConfig.proxied !== undefined ? hostnameConfig.proxied : true
    });
    setShowEditModal(true);
  };

  const handleDeleteClick = async (hostname) => {
    setDeletingId(hostname.hostname);
    try {
      const updatedHostnames = managedHostnames.filter(item => item.hostname !== hostname.hostname);
      await recordsService.updateManagedHostnames(updatedHostnames);
      updateManagedHostnames(updatedHostnames);
      onHostnamesChanged();
      toast.success(`Successfully removed managed hostname: ${hostname.hostname}`);
    } catch (error) {
      console.error('Error deleting managed hostname:', error);
      toast.error(`Failed to delete managed hostname: ${error.response?.data?.message || error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    
    // Validate the form
    if (!formData.hostname || !formData.type || !formData.content) {
      toast.error('Hostname, type, and content are required');
      return;
    }

    // Check if it already exists
    if (managedHostnames.some(item => item.hostname === formData.hostname)) {
      toast.error('This hostname is already managed');
      return;
    }

    setIsSubmitting(true);
    try {
      const newManagedHostname = {
        ...formData,
        ttl: parseInt(formData.ttl, 10)
      };
      
      const updatedHostnames = [...managedHostnames, newManagedHostname];
      await recordsService.updateManagedHostnames(updatedHostnames);
      updateManagedHostnames(updatedHostnames);
      onHostnamesChanged();
      setShowAddModal(false);
      toast.success(`Successfully added managed hostname: ${formData.hostname}`);
    } catch (error) {
      console.error('Error adding managed hostname:', error);
      toast.error(`Failed to add managed hostname: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    
    // Validate the form
    if (!formData.hostname || !formData.type || !formData.content) {
      toast.error('Hostname, type, and content are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedHostname = {
        ...formData,
        ttl: parseInt(formData.ttl, 10)
      };
      
      const updatedHostnames = managedHostnames.map(item => 
        item.hostname === selectedHostname.hostname ? updatedHostname : item
      );
      
      await recordsService.updateManagedHostnames(updatedHostnames);
      updateManagedHostnames(updatedHostnames);
      onHostnamesChanged();
      setShowEditModal(false);
      toast.success(`Successfully updated managed hostname: ${formData.hostname}`);
    } catch (error) {
      console.error('Error updating managed hostname:', error);
      toast.error(`Failed to update managed hostname: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canShowProxied = (providerName || '').toLowerCase() === 'cloudflare';

  // Record type options based on provider
  const recordTypes = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV'];
  
  return (
    <Card>
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center">
          <span>Managed Hostnames</span>
          <div>
            <Button 
              variant="primary" 
              size="sm" 
              onClick={handleAddClick}
            >
              <FontAwesomeIcon icon={faPlus} className="me-1" />
              Add Managed Hostname
            </Button>
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        <Alert variant="info" className="mb-3">
          <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
          Managed hostnames are DNS records that you want to manually manage through TráfegoDNS, 
          rather than having them automatically detected from Docker containers. These records will be created and maintained even if no container is using them.
        </Alert>

        {managedHostnames.length > 5 && (
          <InputGroup size="sm" className="mb-3" style={{ maxWidth: '300px' }}>
            <InputGroup.Text>
              <FontAwesomeIcon icon={faSearch} />
            </InputGroup.Text>
            <Form.Control
              placeholder="Search managed hostnames..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </InputGroup>
        )}

        {filteredHostnames.length === 0 ? (
          <Alert variant="warning">
            <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
            {searchTerm ? 'No matching managed hostnames found' : 'No managed hostnames defined'}
          </Alert>
        ) : (
          <div className="table-responsive">
            <Table hover>
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>Type</th>
                  <th>Content</th>
                  <th>TTL</th>
                  {canShowProxied && <th>Proxied</th>}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHostnames.map((hostname, index) => (
                  <tr key={index}>
                    <td>{hostname.hostname}</td>
                    <td>
                      <RecordTypeBadge type={hostname.type} />
                    </td>
                    <td className="text-truncate" style={{ maxWidth: '200px' }}>
                      {hostname.content}
                    </td>
                    <td>{hostname.ttl}</td>
                    {canShowProxied && (
                      <td>
                        {hostname.proxied ? (
                          <Badge bg="success">
                            <FontAwesomeIcon icon={faShieldAlt} className="me-1" />
                            Yes
                          </Badge>
                        ) : (
                          <Badge bg="secondary">No</Badge>
                        )}
                      </td>
                    )}
                    <td>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        className="me-1"
                        onClick={() => handleEditClick(hostname)}
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => handleDeleteClick(hostname)}
                        disabled={deletingId === hostname.hostname}
                      >
                        {deletingId === hostname.hostname ? (
                          <Spinner animation="border" size="sm" />
                        ) : (
                          <FontAwesomeIcon icon={faTrash} />
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card.Body>
      <Card.Footer className="text-muted">
        Total managed hostnames: {managedHostnames.length}
      </Card.Footer>

      {/* Add Managed Hostname Modal */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Add Managed Hostname</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleAddSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Hostname</Form.Label>
              <Form.Control
                type="text"
                name="hostname"
                value={formData.hostname}
                onChange={handleInputChange}
                placeholder="e.g., api.example.com"
                required
              />
            </Form.Group>

            <Row className="mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Type</Form.Label>
                  <Form.Select
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    required
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
                    required
                  />
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
                required
              />
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
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner size="sm" animation="border" className="me-1" />
                  Saving...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faSave} className="me-1" />
                  Save Hostname
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Edit Managed Hostname Modal */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Edit Managed Hostname</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleEditSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Hostname</Form.Label>
              <Form.Control
                type="text"
                name="hostname"
                value={formData.hostname}
                onChange={handleInputChange}
                placeholder="e.g., api.example.com"
                required
              />
            </Form.Group>

            <Row className="mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Type</Form.Label>
                  <Form.Select
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    required
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
                    required
                  />
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
                required
              />
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
                  id="proxied-checkbox-edit"
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
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner size="sm" animation="border" className="me-1" />
                  Saving...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faSave} className="me-1" />
                  Update Hostname
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Card>
  );
};