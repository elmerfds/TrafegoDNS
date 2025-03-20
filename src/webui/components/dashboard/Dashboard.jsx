// src/webui/components/dashboard/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Alert, Badge, Button } from 'react-bootstrap';
import { 
  FaGlobe, 
  FaCloud, 
  FaNetworkWired, 
  FaServer, 
  FaSync, 
  FaCheckCircle, 
  FaExclamationTriangle,
  FaCircle 
} from 'react-icons/fa';

import StatCard from './StatCard';
import StatusPanel from './StatusPanel';
import { fetchStatus, fetchRecords, triggerRefresh } from '../../services/apiService';
// Import WebSocket hooks
import useWebSocket from '../../hooks/useWebSocket';
import useAppStatus from '../../hooks/useAppStatus';

const Dashboard = () => {
  // Replace multiple state hooks with the app status hook
  const { 
    status, 
    records,
    loading, 
    refreshing, 
    error, 
    lastRefresh,
    refresh 
  } = useAppStatus();
  
  // Get WebSocket connection status
  const { status: wsStatus } = useWebSocket();

  // Updated refresh handler to use the hook's refresh method
  const handleRefresh = async () => {
    refresh();
  };

  // Render WebSocket connection status indicator
  const renderWebSocketStatus = () => {
    return (
      <div className="text-sm mb-2">
        <span className="me-2">WebSocket:</span>
        {wsStatus?.connected ? (
          <Badge bg="success" pill>Connected</Badge>
        ) : (
          <Badge bg="danger" pill>Disconnected</Badge>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <Container>
        <Alert variant="info">Loading dashboard data...</Alert>
      </Container>
    );
  }

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 mb-0">Dashboard</h1>
        <div>
          {renderWebSocketStatus()}
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

      <Row className="g-4 mb-4">
        <Col md={6} lg={3}>
          <StatCard 
            title="DNS Provider" 
            value={status?.provider || 'Not configured'} 
            icon={<FaGlobe />} 
            color="primary"
          />
        </Col>
        <Col md={6} lg={3}>
          <StatCard 
            title="Record Count" 
            value={records?.length || 0} 
            icon={<FaServer />} 
            color="success"
          />
        </Col>
        <Col md={6} lg={3}>
          <StatCard 
            title="Public IP" 
            value={status?.publicIp || 'Detecting...'} 
            icon={<FaNetworkWired />} 
            color="info"
          />
        </Col>
        <Col md={6} lg={3}>
          <StatCard 
            title="Operation Mode" 
            value={status?.operationMode || 'Unknown'} 
            icon={<FaCloud />} 
            color="warning"
          />
        </Col>
      </Row>

      <Row className="g-4 mb-4">
        <Col lg={6}>
          <StatusPanel status={status} />
        </Col>
        <Col lg={6}>
          <Card className="h-100 bg-dark">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Recent Activity</h5>
              <Badge bg="primary" pill>Last 24h</Badge>
            </Card.Header>
            <Card.Body>
              {status?.recentActivity && status.recentActivity.length > 0 ? (
                <div className="activity-list">
                  {status.recentActivity.map((activity, index) => (
                    <div key={index} className="activity-item d-flex align-items-start mb-3">
                      <div className={`activity-icon me-3 ${activity.type === 'success' ? 'text-success' : 'text-warning'}`}>
                        {activity.type === 'success' ? <FaCheckCircle /> : <FaExclamationTriangle />}
                      </div>
                      <div className="activity-content">
                        <div className="fw-medium">{activity.message}</div>
                        <div className="text-muted small">{activity.timestamp}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted py-5">
                  <FaServer className="mb-3" size={32} />
                  <p>No recent activity to display</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-4">
        <Col>
          <Card bg="dark">
            <Card.Header>
              <h5 className="mb-0">System Health</h5>
            </Card.Header>
            <Card.Body>
              <Row>
                <Col md={4} className="mb-3 mb-md-0">
                  <div className="text-center p-3 border rounded">
                    <h6 className="text-muted mb-2">Cleanup Status</h6>
                    <div className={`fs-4 fw-bold ${status?.cleanupEnabled ? 'text-success' : 'text-warning'}`}>
                      {status?.cleanupEnabled ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                </Col>
                <Col md={4} className="mb-3 mb-md-0">
                  <div className="text-center p-3 border rounded">
                    <h6 className="text-muted mb-2">DNS Cache Age</h6>
                    <div className="fs-4 fw-bold text-info">
                      {status?.cacheFreshness || 'Unknown'}
                    </div>
                  </div>
                </Col>
                <Col md={4}>
                  <div className="text-center p-3 border rounded">
                    <h6 className="text-muted mb-2">Log Level</h6>
                    <div className="fs-4 fw-bold text-primary">
                      {status?.logLevel || 'INFO'}
                    </div>
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Dashboard;
