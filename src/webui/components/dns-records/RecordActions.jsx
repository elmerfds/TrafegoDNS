// src/webui/components/dns-records/RecordActions.jsx
import React, { useState } from 'react';
import { Button, Dropdown, Modal, Alert } from 'react-bootstrap';
import { FaEllipsisV, FaTrash, FaEdit, FaExclamationTriangle, FaInfoCircle } from 'react-icons/fa';

const RecordActions = ({ record, onRefresh }) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async () => {
    try {
      setDeleting(true);
      setError(null);
      
      // In a real implementation, this would make an API call
      // await deleteRecord(record.id);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setShowDeleteModal(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error deleting record:', err);
      setError('Failed to delete record. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const isSystemRecord = record.type === 'NS' || record.type === 'SOA';
  const isPreserved = record.preserved;
  
  return (
    <>
      <Dropdown align="end">
        <Dropdown.Toggle variant="dark" size="sm" id={`dropdown-${record.id}`} className="btn-icon">
          <FaEllipsisV />
        </Dropdown.Toggle>

        <Dropdown.Menu variant="dark">
          <Dropdown.Item onClick={() => setShowDetailsModal(true)}>
            <FaInfoCircle className="me-2" />
            View Details
          </Dropdown.Item>
          <Dropdown.Item disabled>
            <FaEdit className="me-2" />
            Edit
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item 
            className="text-danger" 
            onClick={() => setShowDeleteModal(true)}
            disabled={isSystemRecord || isPreserved}
          >
            <FaTrash className="me-2" />
            Delete
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && (
            <Alert variant="danger" className="mb-3">
              <FaExclamationTriangle className="me-2" />
              {error}
            </Alert>
          )}
          <p>Are you sure you want to delete this record?</p>
          <div className="bg-dark p-3 rounded mb-3">
            <div><strong>Type:</strong> {record.type}</div>
            <div><strong>Name:</strong> {record.name}</div>
            <div><strong>Content:</strong> {record.content}</div>
          </div>
          <Alert variant="warning">
            <FaExclamationTriangle className="me-2" />
            This action cannot be undone.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete Record'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Record Details Modal */}
      <Modal show={showDetailsModal} onHide={() => setShowDetailsModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Record Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="bg-dark p-3 rounded mb-3">
            <dl className="row mb-0">
              <dt className="col-sm-4">Type</dt>
              <dd className="col-sm-8">{record.type}</dd>
              
              <dt className="col-sm-4">Name</dt>
              <dd className="col-sm-8">{record.name}</dd>
              
              <dt className="col-sm-4">Content</dt>
              <dd className="col-sm-8">{record.content}</dd>
              
              <dt className="col-sm-4">TTL</dt>
              <dd className="col-sm-8">{record.ttl === 1 ? 'Auto' : record.ttl}</dd>
              
              {record.proxied !== undefined && (
                <>
                  <dt className="col-sm-4">Proxied</dt>
                  <dd className="col-sm-8">{record.proxied ? 'Yes' : 'No'}</dd>
                </>
              )}
              
              {record.priority !== undefined && (
                <>
                  <dt className="col-sm-4">Priority</dt>
                  <dd className="col-sm-8">{record.priority}</dd>
                </>
              )}
              
              {record.id && (
                <>
                  <dt className="col-sm-4">ID</dt>
                  <dd className="col-sm-8"><code>{record.id}</code></dd>
                </>
              )}
              
              {record.managedBy && (
                <>
                  <dt className="col-sm-4">Managed By</dt>
                  <dd className="col-sm-8">{record.managedBy}</dd>
                </>
              )}
              
              {record.preserved && (
                <>
                  <dt className="col-sm-4">Preserved</dt>
                  <dd className="col-sm-8">Yes</dd>
                </>
              )}
              
              {record.createdAt && (
                <>
                  <dt className="col-sm-4">Created</dt>
                  <dd className="col-sm-8">{new Date(record.createdAt).toLocaleString()}</dd>
                </>
              )}
            </dl>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDetailsModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default RecordActions;
