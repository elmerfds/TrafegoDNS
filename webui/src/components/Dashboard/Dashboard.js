import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, Badge, Button, Spinner } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCheck, 
  faExclamationTriangle, 
  faNetworkWired,
  faGlobe,
  faServer,
  faTrash,
  faSyncAlt,
  faExclamationCircle,
  faList
} from '@fortawesome/free-solid-svg-icons';
import { useSettings } from '../../contexts/SettingsContext';
import recordsService from '../../services/recordsService';
import statusService from '../../services/statusService';
import { toast } from 'react-toastify';
import StatsOverview from './StatsOverview';

const Dashboard = () => {
  const { settings, providers, operationMode } = useSettings();
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      // First refresh IP addresses to ensure they're displayed properly
      await statusService.getPublicIPs();
      
      // Small delay to ensure state updates are complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Then fetch all data
      const [statusResponse, statsResponse, recordsResponse] = await Promise.all([
        statusService.getStatus(),
        statusService.getStats(),
        recordsService.getAllRecords()
      ]);
  
      setStatus(statusResponse.data);
      setStats(statsResponse.data);
      setRecords(recordsResponse.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetStats = async () => {
    try {
      await statusService.resetStats();
      toast.success('Statistics reset successfully');
      fetchDashboardData();
    } catch (error) {
      console.error('Error resetting stats:', error);
      toast.error('Failed to reset statistics');
    }
  };

  const handleCleanupRecords = async () => {
    try {
      await recordsService.cleanupOrphanedRecords();
      toast.success('Orphaned records cleanup completed');
      fetchDashboardData();
    } catch (error) {
      console.error('Error cleaning up records:', error);
      toast.error('Failed to cleanup orphaned records');
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3">Loading dashboard data...</p>
      </div>
    );
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="mb-0">Dashboard</h1>
        <Button 
          variant="outline-primary" 
          size="sm"
          onClick={fetchDashboardData}
        >
          <FontAwesomeIcon icon={faSyncAlt} className="me-2" />
          Refresh
        </Button>
      </div>
      
      {status && <StatsOverview status={status} stats={stats} />}
      
      <Row className="mb-4">
        <Col lg={6}>
          <Card className="h-100">
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">
                  <FontAwesomeIcon icon={faNetworkWired} className="me-2" />
                  DNS Records
                </h5>
                {settings?.cleanupOrphaned && (
                  <Button 
                    variant="outline-danger" 
                    size="sm"
                    onClick={handleCleanupRecords}
                  >
                    <FontAwesomeIcon icon={faTrash} className="me-2" />
                    Cleanup Orphaned
                  </Button>
                )}
              </div>
            </Card.Header>
            <Card.Body>
              {records ? (
                <div className="d-flex flex-column h-100">
                  <Table responsive hover className="align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Tracked Records</td>
                        <td>
                          <Badge bg="primary" pill>
                            {records.tracked.length}
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td>Preserved Hostnames</td>
                        <td>
                          <Badge bg="success" pill>
                            {records.preserved.length}
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td>Managed Hostnames</td>
                        <td>
                          <Badge bg="info" pill>
                            {records.managed.length}
                          </Badge>
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                  
                  <div className="mt-auto text-end">
                    <Button 
                      variant="link" 
                      href="/records" 
                      className="text-decoration-none"
                    >
                      <FontAwesomeIcon icon={faList} className="me-1" /> 
                      View All Records
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <FontAwesomeIcon icon={faExclamationCircle} size="lg" className="text-muted mb-3" />
                  <p className="mb-0">No records data available</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
        
        <Col lg={6}>
          <Card className="h-100">
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">
                  <FontAwesomeIcon icon={faServer} className="me-2" />
                  System Status
                </h5>
                <Button 
                  variant="outline-secondary" 
                  size="sm"
                  onClick={handleResetStats}
                >
                  <FontAwesomeIcon icon={faSyncAlt} className="me-2" />
                  Reset Stats
                </Button>
              </div>
            </Card.Header>
            <Card.Body>
              {status ? (
                <div className="d-flex flex-column h-100">
                  <Table responsive hover className="align-middle mb-0">
                    <tbody>
                      <tr>
                        <td>Operation Mode</td>
                        <td>
                          <Badge bg="info">
                            {operationMode?.current || 'Unknown'}
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td>DNS Provider</td>
                        <td>
                          <Badge bg="primary">
                            {providers?.current || 'Unknown'}
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td>Service Status</td>
                        <td>
                          {status.status.isRunning ? (
                            <Badge bg="success">
                              <FontAwesomeIcon icon={faCheck} className="me-1" />
                              Running
                            </Badge>
                          ) : (
                            <Badge bg="danger">
                              <FontAwesomeIcon icon={faExclamationTriangle} className="me-1" />
                              Stopped
                            </Badge>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td>Public IPv4</td>
                        <td>
                          {status.status.ipv4 ? (
                            status.status.ipv4
                          ) : (
                            <span className="text-muted">Not detected</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td>Public IPv6</td>
                        <td>
                          {status.status.ipv6 ? (
                            <span className="small font-monospace">{status.status.ipv6}</span>
                          ) : (
                            <span className="text-muted">Not detected</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                  
                  <div className="mt-auto text-end">
                    <Button 
                      variant="link" 
                      href="/status" 
                      className="text-decoration-none"
                    >
                      <FontAwesomeIcon icon={faList} className="me-1" /> 
                      View Detailed Status
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <FontAwesomeIcon icon={faExclamationCircle} size="lg" className="text-muted mb-3" />
                  <p className="mb-0">No status data available</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
      
      <Row>
        <Col lg={12}>
          <Card>
            <Card.Header>
              <h5 className="mb-0">
                <FontAwesomeIcon icon={faGlobe} className="me-2" />
                DNS Activity
              </h5>
            </Card.Header>
            <Card.Body>
              {stats ? (
                <div className="d-flex flex-column h-100">
                  <Table responsive hover className="align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Value</th>
                        <th>Last Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Created Records</td>
                        <td>
                          <Badge bg="success" pill>
                            {stats.created}
                          </Badge>
                        </td>
                        <td rowSpan="4" className="text-center">
                          {stats.lastPoll ? (
                            <span className="small">
                              {new Date(stats.lastPoll).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-muted">Never</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td>Updated Records</td>
                        <td>
                          <Badge bg="primary" pill>
                            {stats.updated}
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td>Deleted Records</td>
                        <td>
                          <Badge bg="danger" pill>
                            {stats.deleted}
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td>Errors</td>
                        <td>
                          <Badge bg="warning" pill>
                            {stats.errors}
                          </Badge>
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-4">
                  <FontAwesomeIcon icon={faExclamationCircle} size="lg" className="text-muted mb-3" />
                  <p className="mb-0">No statistics data available</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default Dashboard;