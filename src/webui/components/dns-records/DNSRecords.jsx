// src/webui/components/dns-records/DNSRecords.jsx
import React, { useState, useEffect } from 'react';
import { Container, Card, Table, Button, Badge, Form, InputGroup, Alert, Spinner } from 'react-bootstrap';
import { FaSearch, FaSync, FaFilter, FaExclamationTriangle } from 'react-icons/fa';
import { fetchRecords, triggerRefresh } from '../../services/apiService';
import RecordActions from './RecordActions';
import RecordTypeFilter from './RecordTypeFilter';

const DNSRecords = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [filteredRecords, setFilteredRecords] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(null);

  useEffect(() => {
    loadRecords();
  }, []);

  useEffect(() => {
    filterRecords();
  }, [records, search, selectedType]);

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchRecords();
      setRecords(data?.records || []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error loading DNS records:', err);
      setError('Failed to load DNS records. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);
      
      await triggerRefresh();
      await loadRecords();
      
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error refreshing records:', err);
      setError('Failed to refresh records. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const filterRecords = () => {
    let filtered = [...records];
    
    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter(record => record.type === selectedType);
    }
    
    // Filter by search term
    if (search.trim()) {
      const searchTerm = search.toLowerCase();
      filtered = filtered.filter(record => 
        record.name.toLowerCase().includes(searchTerm) || 
        (record.content && record.content.toLowerCase().includes(searchTerm))
      );
    }
    
    setFilteredRecords(filtered);
  };

  const getRecordTypeCount = (type) => {
    return records.filter(record => record.type === type).length;
  };

  const getProxiedBadge = (record) => {
    if (record.proxied === undefined) return null;
    
    return record.proxied ? (
      <Badge bg="success" className="ms-1">Proxied</Badge>
    ) : (
      <Badge bg="warning" text="dark" className="ms-1">Unproxied</Badge>
    );
  };

  const getManagedBadge = (record) => {
    if (!record.managedBy) return null;
    
    return (
      <Badge bg="info" className="ms-1">Managed</Badge>
    );
  };

  if (loading) {
    return (
      <Container className="text-center py-5">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p className="mt-3">Loading DNS records...</p>
      </Container>
    );
  }

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 mb-0">DNS Records</h1>
        <div>
          <Button 
            variant="outline-light" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
            className="d-flex align-items-center"
          >
            <FaSync className={`me-2 ${refreshing ? 'fa-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          {lastRefresh && (
            <div className="text-muted small mt-1 text-end">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="danger" className="mb-4">
          <FaExclamationTriangle className="me-2" />
          {error}
        </Alert>
      )}

      <Card bg="dark" className="mb-4">
        <Card.Body>
          <div className="d-flex flex-column flex-md-row justify-content-between gap-3">
            <div className="flex-grow-1">
              <InputGroup>
                <InputGroup.Text id="search-addon">
                  <FaSearch />
                </InputGroup.Text>
                <Form.Control
                  placeholder="Search records..."
                  aria-label="Search records"
                  aria-describedby="search-addon"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
            </div>
            <div>
              <RecordTypeFilter
                selectedType={selectedType}
                onTypeChange={setSelectedType}
                recordTypeCounts={{
                  A: getRecordTypeCount('A'),
                  AAAA: getRecordTypeCount('AAAA'),
                  CNAME: getRecordTypeCount('CNAME'),
                  MX: getRecordTypeCount('MX'),
                  TXT: getRecordTypeCount('TXT'),
                  all: records.length
                }}
              />
            </div>
          </div>
        </Card.Body>
      </Card>

      <Card bg="dark">
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table variant="dark" className="align-middle mb-0">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Content</th>
                  <th>TTL</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length > 0 ? (
                  filteredRecords.map((record, index) => (
                    <tr key={`${record.id || record.name}-${index}`}>
                      <td>
                        <Badge bg="primary">{record.type}</Badge>
                        {getProxiedBadge(record)}
                        {getManagedBadge(record)}
                      </td>
                      <td>{record.name}</td>
                      <td>{record.content}</td>
                      <td>{record.ttl === 1 ? 'Auto' : record.ttl}</td>
                      <td className="text-end">
                        <RecordActions record={record} onRefresh={loadRecords} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="text-center py-4">
                      {search || selectedType !== 'all' ? (
                        <>
                          <FaFilter className="mb-2" size={20} />
                          <p className="mb-0">No records match the current filters</p>
                        </>
                      ) : (
                        <>
                          <p className="mb-0">No DNS records found</p>
                        </>
                      )}
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
              {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''} 
              {filteredRecords.length !== records.length && ` (filtered from ${records.length})`}
            </span>
          </div>
        </Card.Footer>
      </Card>
    </Container>
  );
};

export default DNSRecords;
