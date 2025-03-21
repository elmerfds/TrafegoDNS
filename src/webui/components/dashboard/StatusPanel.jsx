// src/webui/components/dashboard/StatusPanel.jsx
import React from 'react';
import { Card, Badge, Row, Col, Table } from 'react-bootstrap';
import { FaCheckCircle, FaCircle, FaExclamationCircle } from 'react-icons/fa';

const StatusPanel = ({ status }) => {
  // Helper function to determine status color
  const getStatusColor = (status) => {
    if (status === 'running' || status === 'connected' || status === true) return 'success';
    if (status === 'warning') return 'warning';
    if (status === 'error' || status === false) return 'danger';
    return 'secondary';
  };

  // Helper function to determine status icon
  const getStatusIcon = (status) => {
    if (status === 'running' || status === 'connected' || status === true) return <FaCheckCircle />;
    if (status === 'warning') return <FaCircle />;
    if (status === 'error' || status === false) return <FaExclamationCircle />;
    return <FaCircle />;
  };

  return (
    <Card className="h-100 bg-dark">
      <Card.Header>
        <h5 className="mb-0">System Status</h5>
      </Card.Header>
      <Card.Body>
        <Row className="mb-4">
          <Col>
            <div className="d-flex align-items-center">
              <Badge 
                bg={getStatusColor(status.status)} 
                className="me-2 p-2 d-flex align-items-center"
              >
                {getStatusIcon(status.status)}
              </Badge>
              <div>
                <div className="text-muted small">Service Status</div>
                <div className="fw-medium">
                  {status.status === 'running' ? 'Running' : status.status}
                </div>
              </div>
            </div>
          </Col>
          <Col>
            <div className="d-flex align-items-center">
              <Badge 
                bg={getStatusColor(status.dockerStatus)} 
                className="me-2 p-2 d-flex align-items-center"
              >
                {getStatusIcon(status.dockerStatus)}
              </Badge>
              <div>
                <div className="text-muted small">Docker Connection</div>
                <div className="fw-medium">
                  {status.dockerStatus === 'connected' ? 'Connected' : status.dockerStatus || 'Unknown'}
                </div>
              </div>
            </div>
          </Col>
        </Row>

        <Table size="sm" variant="dark" className="status-table">
          <tbody>
            <tr>
              <td>DNS Provider</td>
              <td>{status.provider || 'Not configured'}</td>
            </tr>
            <tr>
              <td>Domain Zone</td>
              <td>{status.zone || 'Not configured'}</td>
            </tr>
            <tr>
              <td>Public IPv4</td>
              <td>{status.publicIp || 'Detecting...'}</td>
            </tr>
            {status.publicIpv6 && (
              <tr>
                <td>Public IPv6</td>
                <td>{status.publicIpv6}</td>
              </tr>
            )}
            <tr>
              <td>Operation Mode</td>
              <td>
                <Badge bg="primary">{status.operationMode || 'Unknown'}</Badge>
              </td>
            </tr>
            <tr>
              <td>Traefik API</td>
              <td>
                <Badge 
                  bg={getStatusColor(status.traefikStatus)}
                >
                  {status.traefikStatus || (status.operationMode === 'traefik' ? 'Disconnected' : 'Not Used')}
                </Badge>
              </td>
            </tr>
            <tr>
              <td>Cleanup Orphaned</td>
              <td>
                <Badge 
                  bg={status.cleanupEnabled ? 'success' : 'warning'}
                >
                  {status.cleanupEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </td>
            </tr>
            <tr>
              <td>Poll Interval</td>
              <td>{status.pollInterval || '60s'}</td>
            </tr>
            <tr>
              <td>Log Level</td>
              <td>{status.logLevel || 'INFO'}</td>
            </tr>
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
};

export default StatusPanel;
