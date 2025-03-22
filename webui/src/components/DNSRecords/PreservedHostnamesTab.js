// src/components/DNSRecords/PreservedHostnamesTab.js
import React, { useState } from 'react';
import { Card, Form, Button, ListGroup, InputGroup, Alert, Spinner, Badge } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlus, 
  faTrash, 
  faSave, 
  faTimes, 
  faSearch, 
  faInfoCircle, 
  faExclamationTriangle,
  faEdit
} from '@fortawesome/free-solid-svg-icons';
import { toast } from 'react-toastify';
import recordsService from '../../services/recordsService';

const PreservedHostnamesTab = ({ hostnames = [], updateHostnames, onHostnamesChanged }) => {
  const [newHostname, setNewHostname] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedHostnames, setEditedHostnames] = useState([...hostnames]);

  const filteredHostnames = editMode 
    ? editedHostnames.filter(hostname => hostname.toLowerCase().includes(searchTerm.toLowerCase()))
    : hostnames.filter(hostname => hostname.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newHostname.trim()) return;

    // Check if hostname already exists
    if (editedHostnames.includes(newHostname.trim())) {
      toast.warning('This hostname is already in the preserved list');
      return;
    }

    setEditedHostnames([...editedHostnames, newHostname.trim()]);
    setNewHostname('');

    if (!editMode) {
      saveHostnames([...hostnames, newHostname.trim()]);
    }
  };

  const handleRemoveHostname = (hostnameToRemove) => {
    const updatedHostnames = editedHostnames.filter(hostname => hostname !== hostnameToRemove);
    setEditedHostnames(updatedHostnames);

    if (!editMode) {
      saveHostnames(updatedHostnames);
    }
  };

  const saveHostnames = async (newHostnames = editedHostnames) => {
    setIsSubmitting(true);
    try {
      await recordsService.updatePreservedHostnames(newHostnames);
      updateHostnames(newHostnames);
      onHostnamesChanged();
      toast.success('Preserved hostnames updated successfully');
      setEditMode(false);
    } catch (error) {
      console.error('Error updating preserved hostnames:', error);
      toast.error(`Failed to update preserved hostnames: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelEdit = () => {
    setEditedHostnames([...hostnames]);
    setEditMode(false);
  };

  return (
    <Card>
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center">
          <span>Preserved Hostnames</span>
          <div>
            {editMode ? (
              <>
                <Button 
                  variant="success" 
                  size="sm" 
                  className="me-2" 
                  onClick={() => saveHostnames()}
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
                      Save Changes
                    </>
                  )}
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={cancelEdit}
                  disabled={isSubmitting}
                >
                  <FontAwesomeIcon icon={faTimes} className="me-1" />
                  Cancel
                </Button>
              </>
            ) : (
              <Button 
                variant="primary" 
                size="sm" 
                onClick={() => setEditMode(true)}
              >
                <FontAwesomeIcon icon={faEdit} className="me-1" />
                Edit in Bulk
              </Button>
            )}
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        <Alert variant="info" className="mb-3">
          <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
          Preserved hostnames will <strong>never</strong> be automatically removed from your DNS provider, even if they are no longer in use.
          You can use wildcards (e.g., <code>*.example.com</code>) to preserve all subdomains of a domain.
        </Alert>

        <Form onSubmit={handleAddSubmit} className="mb-3">
          <InputGroup>
            <Form.Control
              type="text"
              placeholder="Enter hostname to preserve (e.g., api.example.com or *.example.com)"
              value={newHostname}
              onChange={(e) => setNewHostname(e.target.value)}
            />
            <Button type="submit" variant="primary">
              <FontAwesomeIcon icon={faPlus} className="me-1" />
              Add
            </Button>
          </InputGroup>
        </Form>

        {filteredHostnames.length > 5 && (
          <InputGroup size="sm" className="mb-3" style={{ maxWidth: '300px' }}>
            <InputGroup.Text>
              <FontAwesomeIcon icon={faSearch} />
            </InputGroup.Text>
            <Form.Control
              placeholder="Search hostnames..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </InputGroup>
        )}

        {filteredHostnames.length === 0 ? (
          <Alert variant="warning">
            <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
            {searchTerm ? 'No matching hostnames found' : 'No preserved hostnames defined'}
          </Alert>
        ) : (
          <ListGroup>
            {filteredHostnames.map((hostname, index) => (
              <ListGroup.Item 
                key={index} 
                className="d-flex justify-content-between align-items-center"
              >
                <div>
                  {hostname.startsWith('*.') ? (
                    <Badge bg="info" className="me-2">Wildcard</Badge>
                  ) : null}
                  {hostname}
                </div>
                <Button 
                  variant="outline-danger" 
                  size="sm" 
                  onClick={() => handleRemoveHostname(hostname)}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Card.Body>
      <Card.Footer className="text-muted">
        Total preserved hostnames: {editedHostnames.length}
      </Card.Footer>
    </Card>
  );
};

export default PreservedHostnamesTab;