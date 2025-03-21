// src/webui/components/activity/ActivityLog.jsx
import React, { useState, useEffect } from 'react';
import { Container, Card, Table, Button, Form, Alert, Spinner, Badge, Row, Col } from 'react-bootstrap';
import { 
  FaSync, 
  FaExclamationTriangle, 
  FaFilter, 
  FaTrash, 
  FaCheck, 
  FaPlus, 
  FaPencilAlt,
  FaHistory
} from 'react-icons/fa';
import { fetchActivityLog } from '../../services/apiService';
import ActivityFilter from './ActivityFilter';

const ActivityLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(null);
  
  // This is a mock function since the actual API may not have this endpoint yet
  const mockActivityLogs = () => {
    return {
      logs: [
        {
          id: 1,
          timestamp: new Date().toISOString(),
          type: 'create',
          message: 'Created A record for api.example.com',
          details: { name: 'api.example.com', type: 'A', content: '192.168.1.1' }
        },
        {
          id: 2,
          timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
          type: 'update',
          message: 'Updated CNAME record for www.example.com',
          details: { name: 'www.example.com', type: 'CNAME', content: 'example.com' }
        },
        {
          id: 3,
          timestamp: new Date(Date.now() - 10 * 60000).toISOString(),
          type: 'delete',
          message: 'Deleted MX record for example.com',
          details: { name: 'example.com', type: 'MX', content: 'mail.example.com' }
        },
        {
          id: 4,
          timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
          type: 'error',
          message: 'Failed to update TXT record for _acme-challenge.example.com',
          details: { name: '_acme-challenge.example.com', type: 'TXT', error: 'API timeout' }
        },
        {
          id: 5,
          timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
          type: 'create',
          message: 'Created CNAME record for blog.example.com',
          details: { name: 'blog.example.com', type: 'CNAME', content: 'example.com' }
        },
        {
          id: 6,
          timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
          type: 'update',
          message: 'Updated A record for example.com',
          details: { name: 'example.com', type: 'A', content: '203.0.113.1' }
        },
        {
          id: 7,
          timestamp: new Date(Date.now() - 5 * 3600000).toISOString(),
          type: 'info',
          message: 'Refreshed DNS cache',
          details: { recordCount: 25 }
        },
        {
          id: 8,
          timestamp: new Date(Date.now() - 24 * 3600000).toISOString(),
          type: 'cleanup',
          message: 'Cleaned up 3 orphaned DNS records',
          details: { removed: ['old.example.com', 'test.example.com', 'dev.example.com'] }
        }
      ]
    };
  };

  useEffect(() => {
    loadActivityLogs();
  }, []);
  
  useEffect(() => {
    filterLogs();
  }, [logs, search, filterType]);

  const loadActivityLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // For now, use mock data
      // In a real implementation, you'd call the API:
      // const data = await fetchActivityLog();
      const data = mockActivityLogs();
      
      setLogs(data.logs || []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error loading activity logs:', err);
      setError('Failed to load activity logs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);
      
      // For now, use mock data
      // In a real implementation, you'd call the API again:
      // await fetchActivityLog();
      const data = mockActivityLogs();
      
      setLogs(data.logs || []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error refreshing activity logs:', err);
      setError('Failed to refresh activity logs. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const filterLogs = () => {
    let filtered = [...logs];
    
    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(log => log.type === filterType);
    }
    
    // Filter by search term
    if (search.trim()) {
      const searchTerm = search.toLowerCase();
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(searchTerm) || 
        (log.details && JSON.stringify(log.details).toLowerCase().includes(searchTerm))
      );
    }
    
    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    setFilteredLogs(filtered);
  };

  const getActivityTypeColor = (type) => {
    const typeColors = {
      create: 'success',
      update: 'primary',
      delete: 'danger',
      error: 'danger',
      info: 'info',
      cleanup: 'warning'
    };
    
    return typeColors[type] || 'secondary';
  };

  const getActivityTypeIcon = (type) => {
    switch (type) {
      case 'create':
        return <FaPlus />;
      case 'update':
        return <FaPencilAlt />;
      case 'delete':
        return <FaTrash />;
      case 'error':
        return <FaExclamationTriangle />;
      case 'info':
        return <FaCheck />;
      case 'cleanup':
        return <FaTrash />;
      default:
        return <FaHistory />;
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <Container className="text-center py-5">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p className="mt-3">Loading activity logs...</p>
      </Container>
    );
  }

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 mb-0">Activity Log</h1>
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
          <Row>
            <Col md={6} className="mb-3 mb-md-0">
              <Form.Group>
                <Form.Control 
                  type="text" 
                  placeholder="Search logs..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Form.Group>
            </Col>
            <Col md={6} className="d-flex justify-content-md-end">
              <ActivityFilter 
                selectedType={filterType} 
                onTypeChange={setFilterType} 
              />
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card bg="dark">
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table variant="dark" className="align-middle mb-0">
              <thead>
                <tr>
                  <th style={{ width: '180px' }}>Timestamp</th>
                  <th style={{ width: '120px' }}>Type</th>
                  <th>Message</th>
                  <th style={{ width: '150px' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="text-muted">{formatTimestamp(log.timestamp)}</td>
                      <td>
                        <Badge 
                          bg={getActivityTypeColor(log.type)} 
                          className="d-flex align-items-center w-75"
                        >
                          <span className="me-1">{getActivityTypeIcon(log.type)}</span>
                          <span className="text-capitalize">{log.type}</span>
                        </Badge>
                      </td>
                      <td>{log.message}</td>
                      <td>
                        {log.details && (
                          <Button 
                            variant="outline-secondary" 
                            size="sm"
                            onClick={() => alert(JSON.stringify(log.details, null, 2))}
                          >
                            View Details
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="text-center py-4">
                      {search || filterType !== 'all' ? (
                        <>
                          <FaFilter className="mb-2" size={20} />
                          <p className="mb-0">No activity logs match the current filters</p>
                        </>
                      ) : (
                        <>
                          <p className="mb-0">No activity logs found</p>
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
              {filteredLogs.length} log {filteredLogs.length !== 1 ? 'entries' : 'entry'} 
              {filteredLogs.length !== logs.length && ` (filtered from ${logs.length})`}
            </span>
          </div>
        </Card.Footer>
      </Card>
    </Container>
  );
};

export default ActivityLog;
