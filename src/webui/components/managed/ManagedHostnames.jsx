// src/webui/components/managed/ManagedHostnames.jsx
import React, { useState, useEffect } from 'react';
import { Container, Card, Table, Button, Form, Alert, Spinner, Modal, InputGroup, Row, Col, Badge } from 'react-bootstrap';
import { FaPlus, FaTrash, FaExclamationTriangle, FaCheck, FaInfoCircle, FaServer, FaEdit } from 'react-icons/fa';
import { fetchManagedHostnames, addManagedHostname, removeManagedHostname } from '../../services/apiService';
import ManagedHostnameForm from './ManagedHostnameForm';

const ManagedHostnames = () => {
  const [hostnames, setHostnames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [hostnameToDelete, setHostnameToDelete] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    loadHostnames();
  }, []);

  const loadHostnames = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchManagedHostnames();
      setHostnames(data?.hostnames || []);
    } catch (err) {
      console.error('Error loading managed hostnames:', err);
      setError('Failed to load managed hostnames. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubmit = async (hostnameData) => {
    try {
      setSubmitting(true);
      setError(null);
      
      await addManagedHostname(hostnameData);
      await loadHostnames();
      
      setShowAddModal(false);
      setSuccessMessage(`Hostname "${hostnameData.hostname}" has been added to the managed list`);
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error adding hostname:', err);
      setError('Failed to add hostname. Please try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
    return true;
  };

  const handleDeleteConfirm = async () => {
    try {
      setSubmitting(true);
      setError(null);
      
      await removeManagedHostname(hostnameToDelete);
      await loadHostnames();
      
      setShowDeleteModal(false);
      setHostnameToDelete(null);
      setSuccessMessage(`Hostname "${hostnameToDelete}" has been removed from the managed list`);
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error removing hostname:', err);
      setError('Failed to remove hostname. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getRecordTypeLabel = (recordType) => {
    const types = {
      'A': 'primary',
      'AAAA': 'secondary',
      'CNAME': 'info',
      'MX': 'warning',
      'TXT': 'danger',
      'SRV': 'success'
    };
    
    return types[recordType] || 'primary';
  };

  if (loading) {
    return (
      <Container className="text-center py-5">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p className="mt-3">Loading managed hostnames...</p>
      </Container>
    );
  }

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 mb-0">Managed Hostnames</h1>
        <Button 
          variant="primary" 
          onClick={() => setShowAddModal(true)}
          className="d-flex align-items-center"
        >
          <FaPlus className="me-2" />
          Add Hostname
        </Button>
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

      <Card bg="dark" className="mb-4">
        <Card.Body>
          <div className="d-flex align-items-center mb-3">
            <FaServer className="me-2 text-primary" size={24} />
            <div>
              <h5 className="mb-0">What are managed hostnames?</h5>
              <p className="text-muted mb-0">
                Managed hostnames are DNS records that TráfegoDNS creates and maintains independently of running containers.
              </p>
            </div>
          </div>
          <Alert variant="info" className="mb-0">
            <FaInfoCircle className="me-2" />
            These records are useful for static services, external endpoints, or services that don't run in containers.
          </Alert>
        </Card.Body>
      </Card>

      <Card bg="dark">
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table variant="dark" className="align-middle mb-0">
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>Type</th>
                  <th>Content</th>
                  <th>TTL</th>
                  <th>Proxied</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {hostnames.length > 0 ? (
                  hostnames.map((hostname, index) => (
                    <tr key={index}>
                      <td>{hostname.hostname}</td>
                      <td>
                        <Badge bg={getRecordTypeLabel(hostname.type)}>
                          {hostname.type}
                        </Badge>
                      </td>
                      <td>{hostname.content}</td>
                      <td>{hostname.ttl === 1 ? 'Auto' : hostname.ttl}</td>
                      <td>
                        {hostname.proxied ? (
                          <Badge bg="success">Yes</Badge>
                        ) : (
                          <Badge bg="secondary">No</Badge>
                        )}
                      </td>
                      <td className="text-end">
                        <Button 
                          variant="outline-danger" 
                          size="sm"
                          onClick={() => {
                            setHostnameToDelete(hostname.hostname);
                            setShowDeleteModal(true);
                          }}
                          className="ms-2"
                        >
                          <FaTrash />
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="text-center py-4">
                      <p className="mb-0">No managed hostnames found</p>
                      <p className="text-muted">Add hostnames to maintain DNS records for services outside of containers</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </Card.Body>
        <Card.Footer>
          <div className="d-flex justify-content-between align-items-center">
            <span className="text-muted">
              {hostnames.length} hostname{hostnames.length !== 1 ? 's' : ''} 
            </span>
          </div>
        </Card.Footer>
      </Card>

      {/* Add Hostname Modal */}
      <Modal 
        show={showAddModal} 
        onHide={() => setShowAddModal(false)} 
        centered
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>Add Managed Hostname</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ManagedHostnameForm 
            onSubmit={handleAddSubmit}
            isSubmitting={submitting}
            onCancel={() => setShowAddModal(false)}
          />
        </Modal.Body>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Removal</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Are you sure you want to remove this hostname from the managed list?</p>
          <div className="bg-dark p-3 rounded mb-3">
            <strong>{hostnameToDelete}</strong>
          </div>
          <Alert variant="warning">
            <FaExclamationTriangle className="me-2" />
            This will delete the DNS record. This action cannot be undone.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteConfirm} disabled={submitting}>
            {submitting ? 'Removing...' : 'Remove Hostname'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default ManagedHostnames;
