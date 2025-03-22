import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, Badge, Button, Spinner } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSyncAlt,
  faServer,
  faMicrochip,
  faMemory,
  faClock,
  faNetworkWired,
  faCheckCircle,
  faTimesCircle,
  faExclamationTriangle
} from '@fortawesome/free-solid-svg-icons';
import statusService from '../../services/statusService';
import { toast } from 'react-toastify';

const StatusPage = () => {
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      const response = await statusService.getStatus();
      setStatus(response.data);
    } catch (error) {
      console.error('Error fetching status:', error);
      toast.error('Failed to load system status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshIP = async () => {
    try {
      setIsRefreshing(true);
      const response = await statusService.getPublicIPs();
      toast.success('IP addresses refreshed');
      
      // Update the status with new IP data
      if (status) {
        setStatus({
          ...status,
          status: {
            ...status.status,
            ipv4: response.data.ipv4,
            ipv6: response.data.ipv6
          }
        });
      }
    } catch (error) {
      console.error('Error refreshing IP addresses:', error);
      toast.error('Failed to refresh IP addresses');
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (!bytes) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const formatUptime = (seconds) => {
    if (!seconds) return 'Unknown';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days} days, ${hours} hours, ${minutes} minutes`;
    }
    
    if (hours > 0) {
      return `${hours} hours, ${minutes} minutes`;
    }
    
    return `${minutes} minutes`;
  };

  if (isLoading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3">Loading system status...</p>
      </div>
    );
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="mb-0">System Status</h1>
        <div>
          <Button 
            variant="outline-primary" 
            size="sm"
            className="me-2"
            onClick={handleRefreshIP}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <>
                <Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  role="status"
                  aria-hidden="true"
                  className="me-2"
                />
                Refreshing IP...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faNetworkWired} className="me-2" />
                Refresh IP
              </>
            )}
          </Button>
          <Button 
            variant="outline-primary" 
            size="sm"
            onClick={fetchStatus}
            disabled={isLoading}
          >
            <FontAwesomeIcon icon={faSyncAlt} className="me-2" />
            Refresh Status
          </Button>
        </div>
      </div>
      
      {status && (
        <Row>
          <Col md={6} className="mb-4">
            <Card>
              <Card.Header>
                <h5 className="mb-0">
                  <FontAwesomeIcon icon={faServer} className="me-2" />
                  Application Status
                </h5>
              </Card.Header>
              <Card.Body>
                <Table responsive borderless className="mb-0">
                  <tbody>
                    <tr>
                      <td className="fw-bold">Status</td>
                      <td>
                        {status.status.isRunning ? (
                          <Badge bg="success">
                            <FontAwesomeIcon icon={faCheckCircle} className="me-1" />
                            Running
                          </Badge>
                        ) : (
                          <Badge bg="danger">
                            <FontAwesomeIcon icon={faTimesCircle} className="me-1" />
                            Stopped
                          </Badge>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="fw-bold">Version</td>
                      <td>{status.version}</td>
                    </tr>
                    <tr>
                      <td className="fw-bold">Started At</td>
                      <td>
                        {status.status.startedAt ? 
                          new Date(status.status.startedAt).toLocaleString() : 
                          'Unknown'
                        }
                      </td>
                    </tr>
                    <tr>
                      <td className="fw-bold">Public IPv4</td>
                      <td>
                        {status.status.ipv4 || 
                          <span className="text-muted">Not detected</span>
                        }
                      </td>
                    </tr>
                    <tr>
                      <td className="fw-bold">Public IPv6</td>
                      <td>
                        {status.status.ipv6 ? 
                          <code>{status.status.ipv6}</code> : 
                          <span className="text-muted">Not detected</span>
                        }
                      </td>
                    </tr>
                    <tr>
                      <td className="fw-bold">Last Error</td>
                      <td>
                        {status.status.lastError ? (
                          <div>
                            <Badge bg="warning" className="mb-1">
                              <FontAwesomeIcon icon={faExclamationTriangle} className="me-1" />
                              {status.status.lastError.source}
                            </Badge>
                            <div className="small text-muted">
                              {status.status.lastError.message}
                              <div>
                                {new Date(status.status.lastError.timestamp).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-success">No recent errors</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Col>
          
          <Col md={6} className="mb-4">
            <Card>
              <Card.Header>
                <h5 className="mb-0">
                  <FontAwesomeIcon icon={faMicrochip} className="me-2" />
                  System Information
                </h5>
              </Card.Header>
              <Card.Body>
                <Table responsive borderless className="mb-0">
                  <tbody>
                    <tr>
                      <td className="fw-bold">Hostname</td>
                      <td>{status.system.hostname}</td>
                    </tr>
                    <tr>
                      <td className="fw-bold">Platform</td>
                      <td>
                        {status.system.platform} ({status.system.arch})
                      </td>
                    </tr>
                    <tr>
                      <td className="fw-bold">CPUs</td>
                      <td>{status.system.cpus} cores</td>
                    </tr>
                    <tr>
                      <td className="fw-bold">
                        <FontAwesomeIcon icon={faMemory} className="me-1" />
                        Memory
                      </td>
                      <td>
                        {formatBytes(status.system.memory.free)} free of {formatBytes(status.system.memory.total)}
                        <div className="progress mt-1" style={{ height: '5px' }}>
                          <div 
                            className="progress-bar bg-primary" 
                            role="progressbar" 
                            style={{ 
                              width: `${100 - (status.system.memory.free / status.system.memory.total * 100)}%` 
                            }}
                            aria-valuenow={100 - (status.system.memory.free / status.system.memory.total * 100)}
                            aria-valuemin="0" 
                            aria-valuemax="100"
                          ></div>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="fw-bold">
                        <FontAwesomeIcon icon={faClock} className="me-1" />
                        Uptime
                      </td>
                      <td>{formatUptime(status.system.uptime)}</td>
                    </tr>
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Col>
          
          <Col md={12}>
            <Card>
              <Card.Header>
                <h5 className="mb-0">
                  <FontAwesomeIcon icon={faNetworkWired} className="me-2" />
                  Activity Statistics
                </h5>
              </Card.Header>
              <Card.Body>
                <Row className="g-4">
                  <Col sm={6} md={3}>
                    <div className="border rounded p-3 text-center h-100">
                      <div className="text-primary mb-2">
                        <FontAwesomeIcon icon={faCheckCircle} size="2x" />
                      </div>
                      <h6>Created Records</h6>
                      <h3>{status.stats.created}</h3>
                    </div>
                  </Col>
                  <Col sm={6} md={3}>
                    <div className="border rounded p-3 text-center h-100">
                      <div className="text-success mb-2">
                        <FontAwesomeIcon icon={faSyncAlt} size="2x" />
                      </div>
                      <h6>Updated Records</h6>
                      <h3>{status.stats.updated}</h3>
                    </div>
                  </Col>
                  <Col sm={6} md={3}>
                    <div className="border rounded p-3 text-center h-100">
                      <div className="text-danger mb-2">
                        <FontAwesomeIcon icon={faTimesCircle} size="2x" />
                      </div>
                      <h6>Deleted Records</h6>
                      <h3>{status.stats.deleted}</h3>
                    </div>
                  </Col>
                  <Col sm={6} md={3}>
                    <div className="border rounded p-3 text-center h-100">
                      <div className="text-warning mb-2">
                        <FontAwesomeIcon icon={faExclamationTriangle} size="2x" />
                      </div>
                      <h6>Errors</h6>
                      <h3>{status.stats.errors}</h3>
                    </div>
                  </Col>
                </Row>
                <div className="text-center mt-3 text-muted">
                  <small>
                    Last updated: {status.stats.lastPoll ? 
                      new Date(status.stats.lastPoll).toLocaleString() : 
                      'Never'
                    }
                  </small>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
    </>
  );
};

export default StatusPage;