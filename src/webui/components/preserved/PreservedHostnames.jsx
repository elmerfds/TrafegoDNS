// src/webui/components/preserved/PreservedHostnames.jsx
import React, { useState, useEffect } from 'react';
import { Container, Card, Table, Button, Form, Alert, Spinner, Modal, InputGroup } from 'react-bootstrap';
import { FaPlus, FaTrash, FaExclamationTriangle, FaCheck, FaInfoCircle, FaShieldAlt } from 'react-icons/fa';
import { fetchPreservedHostnames, addPreservedHostname, removePreservedHostname } from '../../services/apiService';

const PreservedHostnames = () => {
  const [hostnames, setHostnames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newHostname, setNewHostname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [hostnameToDelete, setHostnameToDelete] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    loadHostnames();
  }, []);

  const loadHostnames = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchPreservedHostnames();
      setHostnames(data?.hostnames || []);
    } catch (err) {
      console.error('Error loading preserved hostnames:', err);
      setError('Failed to load preserved hostnames. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      
      // Validate hostname
      if (!newHostname.trim()) {
        setError('Hostname cannot be empty');
        return;
      }
      
      await addPreservedHostname(newHostname);
      await loadHostnames();
      
      setShowAddModal(false);
      setNewHostname('');
      setSuccessMessage(`Hostname "${newHostname}" has been added to the preserved list`);
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error adding hostname:', err);
      setError('Failed to add hostname. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      setSubmitting(true);
      setError(null);
      
      await removePreservedHostname(hostnameToDelete);
      await loadHostnames();
      
      setShowDeleteModal(false);
      setHostnameToDelete(null);
      setSuccessMessage(`Hostname "${hostnameToDelete}" has been removed from the preserved list`);
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error removing hostname:', err);
      setError('Failed to remove hostname. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Container className="text-center py-5">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p className="mt-3">Loading preserved hostnames...</p>
      </Container>
    );
  }

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 mb-0">Preserved Hostnames</h1>
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
            <FaShieldAlt className="me-2 text-warning" size={24} />
            <div>
              <h5 className="mb-0">What are preserved hostnames?</h5>
              <p className="text-muted mb-0">
                Preserved hostnames are never deleted during cleanup operations, even if they become orphaned.
              </p>
            </div>
          </div>
          <Alert variant="info" className="mb-0">
            <FaInfoCircle className="me-2" />
            Wildcards are supported (e.g., <code>*.admin.example.com</code> will preserve all subdomains of admin.example.com)
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
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {hostnames.length > 0 ? (
                  hostnames.map((hostname, index) => (
                    <tr key={index}>
                      <td>{hostname}</td>
                      <td>
                        {hostname.startsWith('*.') ? (
                          <span className="text-warning">Wildcard</span>
                        ) : (
                          <span className="text-info">Exact Match</span>
                        )}
                      </td>
                      <td className="text-end">
                        <Button 
                          variant="outline-danger" 
                          size="sm"
                          onClick={() => {
                            setHostnameToDelete(hostname);
                            setShowDeleteModal(true);
                          }}
                        >
                          <FaTrash />
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="text-center py-4">
                      <p className="mb-0">No preserved hostnames found</p>
                      <p className="text-muted">Add hostnames to protect them from automated cleanup</p>
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
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)} centered>
        <Form onSubmit={handleAddSubmit}>
          <Modal.Header closeButton>
            <Modal.Title>Add Preserved Hostname</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {error && (
              <Alert variant="danger" className="mb-3">
                <FaExclamationTriangle className="me-2" />
                {error}
              </Alert>
            )}
            <Form.Group>
              <Form.Label>Hostname</Form.Label>
              <InputGroup>
                <Form.Control
                  type="text"
                  placeholder="Enter hostname (e.g., api.example.com)"
                  value={newHostname}
                  onChange={(e) => setNewHostname(e.target.value)}
                  required
                />
              </InputGroup>
              <Form.Text className="text-muted">
                You can use wildcards (e.g., *.admin.example.com)
              </Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowAddModal(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add Hostname'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Removal</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Are you sure you want to remove this hostname from the preserved list?</p>
          <div className="bg-dark p-3 rounded mb-3">
            <strong>{hostnameToDelete}</strong>
          </div>
          <Alert variant="warning">
            <FaExclamationTriangle className="me-2" />
            This hostname will no longer be protected from cleanup operations.
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

export default PreservedHostnames;
