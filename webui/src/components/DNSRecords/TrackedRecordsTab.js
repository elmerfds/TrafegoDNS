// src/components/DNSRecords/TrackedRecordsTab.js
import React, { useState } from 'react';
import { Table, Card, Form, Button, InputGroup, Modal, Badge, Spinner } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faTrash, 
  faEdit, 
  faSearch, 
  faExclamationTriangle, 
  faCheck, 
  faShieldAlt,
  faServer
} from '@fortawesome/free-solid-svg-icons';
import { toast } from 'react-toastify';
import recordsService from '../../services/recordsService';
import RecordEditModal from './RecordEditModal';
import RecordCreateForm from './RecordCreateForm';
import RecordTypeBadge from './RecordTypeBadge';

const TrackedRecordsTab = ({ records = [], updateRecords, providerName, onRecordsChanged }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [recordFilter, setRecordFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value.toLowerCase());
  };

  const handleRecordFilterChange = (e) => {
    setRecordFilter(e.target.value);
  };

  const handleProviderFilterChange = (e) => {
    setProviderFilter(e.target.value);
  };

  // Get unique record types for filter
  const recordTypes = ['all', ...new Set(records.map(record => record.type))];
  
  // Get unique providers for filter
  const uniqueProviders = ['all', ...new Set(records.map(record => record.provider).filter(Boolean))];

  const filteredRecords = records.filter(record => {
    const matchesSearch = !searchTerm || 
      record.name.toLowerCase().includes(searchTerm) || 
      record.type.toLowerCase().includes(searchTerm) || 
      (record.content && record.content.toLowerCase().includes(searchTerm));
    
    const matchesType = recordFilter === 'all' || record.type === recordFilter;
    const matchesProvider = providerFilter === 'all' || record.provider === providerFilter;
    
    return matchesSearch && matchesType && matchesProvider;
  });

  const handleDeleteClick = (record) => {
    setConfirmDelete(record);
  };

  const handleEditClick = (record) => {
    setCurrentRecord({...record});
    setShowEditModal(true);
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    
    setIsDeleting(true);
    try {
      await recordsService.deleteRecord(confirmDelete.id);
      toast.success(`Successfully deleted DNS record: ${confirmDelete.name}`);
      onRecordsChanged();
    } catch (error) {
      console.error('Error deleting record:', error);
      toast.error(`Failed to delete record: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  };

  const handleSaveRecord = async (updatedRecord) => {
    try {
      await recordsService.updateRecord(updatedRecord.id, updatedRecord);
      toast.success(`Successfully updated record: ${updatedRecord.name}`);
      onRecordsChanged();
      setShowEditModal(false);
    } catch (error) {
      console.error('Error updating record:', error);
      toast.error(`Failed to update record: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleRecordCreated = (newRecord) => {
    // Call the parent component's refresh function
    onRecordsChanged();
  };

  return (
    <>
      <RecordCreateForm 
        providerName={providerName} 
        onRecordCreated={handleRecordCreated} 
      />
      
      <Card>
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <span>Tracked DNS Records</span>
            <div className="d-flex gap-2 flex-wrap">
              <Form.Select 
                size="sm" 
                className="me-2" 
                style={{ width: 'auto' }}
                value={recordFilter}
                onChange={handleRecordFilterChange}
              >
                {recordTypes.map(type => (
                  <option key={type} value={type}>
                    {type === 'all' ? 'All Record Types' : type}
                  </option>
                ))}
              </Form.Select>
              
              {/* Provider Filter Dropdown */}
              {uniqueProviders.length > 1 && (
                <Form.Select 
                  size="sm" 
                  className="me-2" 
                  style={{ width: 'auto' }}
                  value={providerFilter}
                  onChange={handleProviderFilterChange}
                >
                  {uniqueProviders.map(provider => (
                    <option key={provider} value={provider}>
                      {provider === 'all' ? 'All Providers' : provider}
                    </option>
                  ))}
                </Form.Select>
              )}
              
              <InputGroup size="sm" style={{ width: 'auto' }}>
                <InputGroup.Text>
                  <FontAwesomeIcon icon={faSearch} />
                </InputGroup.Text>
                <Form.Control
                  placeholder="Search records..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                />
              </InputGroup>
            </div>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Content</th>
                  <th>TTL</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-4">
                      {searchTerm || recordFilter !== 'all' || providerFilter !== 'all' ? (
                        <div>
                          <FontAwesomeIcon icon={faExclamationTriangle} className="text-warning mb-2" size="lg" />
                          <p className="mb-0">No matching records found. Try adjusting your search or filters.</p>
                        </div>
                      ) : (
                        <div>
                          <p className="mb-0">No DNS records are currently being tracked.</p>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record) => (
                    <tr key={`${record.id}-${record.type}`}>
                      <td>
                        <div className="fw-medium">{record.name}</div>
                        <small className="text-muted">{record.id}</small>
                      </td>
                      <td>
                        <RecordTypeBadge type={record.type} />
                      </td>
                      <td className="text-truncate" style={{ maxWidth: '200px' }}>
                        {record.content || <small className="text-muted">Not specified</small>}
                      </td>
                      <td>{record.ttl || 'Auto'}</td>
                      <td>
                        <Badge bg="secondary">
                          <FontAwesomeIcon icon={faServer} className="me-1" />
                          {record.provider || providerName}
                        </Badge>
                      </td>
                      <td>
                        {record.proxied ? (
                          <Badge bg="success">
                            <FontAwesomeIcon icon={faShieldAlt} className="me-1" />
                            Proxied
                          </Badge>
                        ) : (
                          <Badge bg="secondary">
                            <FontAwesomeIcon icon={faCheck} className="me-1" />
                            Direct
                          </Badge>
                        )}
                      </td>
                      <td>
                        <Button 
                          size="sm" 
                          variant="outline-primary"
                          className="me-1"
                          onClick={() => handleEditClick(record)}
                        >
                          <FontAwesomeIcon icon={faEdit} />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline-danger"
                          onClick={() => handleDeleteClick(record)}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
        </Card.Body>
        <Card.Footer>
          <small className="text-muted">
            Showing {filteredRecords.length} of {records.length} records
            {searchTerm && ` • Filtered by "${searchTerm}"`}
            {recordFilter !== 'all' && ` • Type: ${recordFilter}`}
            {providerFilter !== 'all' && ` • Provider: ${providerFilter}`}
          </small>
        </Card.Footer>
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal show={!!confirmDelete} onHide={() => setConfirmDelete(null)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete the record <strong>{confirmDelete?.name}</strong> with type <Badge bg="primary">{confirmDelete?.type}</Badge>?
          <div className="alert alert-warning mt-3">
            <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
            This action cannot be undone. The DNS record will be permanently removed from your DNS provider.
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button 
            variant="danger" 
            onClick={executeDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Spinner size="sm" animation="border" className="me-1" />
                Deleting...
              </>
            ) : (
              <>Delete Record</>
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Edit Record Modal */}
      {showEditModal && currentRecord && (
        <RecordEditModal
          show={showEditModal}
          record={currentRecord}
          onHide={() => setShowEditModal(false)}
          onSave={handleSaveRecord}
          providerName={providerName}
          editMode={true}
        />
      )}
    </>
  );
};

export default TrackedRecordsTab;