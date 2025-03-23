// src/components/Dashboard/StatsOverview.js
import React from 'react';
import { Row, Col, Card } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCloudUploadAlt, 
  faCloudDownloadAlt, 
  faTrashAlt, 
  faExclamationTriangle
} from '@fortawesome/free-solid-svg-icons';

const StatsOverview = ({ status, stats }) => {
  // Make sure we have the required data
  if (!status || !stats) return null;

  // Calculate uptime
  const calculateUptime = () => {
    if (!status.system || !status.system.uptime) return 'N/A';
    
    const uptime = status.system.uptime;
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Calculate memory usage
  const calculateMemoryUsage = () => {
    if (!status.system || !status.system.memory) return { used: 0, total: 0, percentage: 0 };
    
    const total = status.system.memory.total;
    const free = status.system.memory.free;
    const used = total - free;
    const percentage = Math.round((used / total) * 100);
    
    return {
      used: Math.round(used / 1024 / 1024),
      total: Math.round(total / 1024 / 1024),
      percentage
    };
  };

  const memoryInfo = calculateMemoryUsage();

  return (
    <Row className="g-2 mb-3">
      <Col xs={6} md={3}>
        <Card className="text-white bg-primary h-100">
          <Card.Body className="p-2">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="small fw-bold">Created</div>
                <h3 className="mt-1 mb-0">{stats.created}</h3>
              </div>
              <FontAwesomeIcon icon={faCloudUploadAlt} size="lg" opacity="0.6" />
            </div>
            <div className="mt-1 small">DNS records created</div>
          </Card.Body>
        </Card>
      </Col>

      <Col xs={6} md={3}>
        <Card className="text-white bg-success h-100">
          <Card.Body className="p-2">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="small fw-bold">Updated</div>
                <h3 className="mt-1 mb-0">{stats.updated}</h3>
              </div>
              <FontAwesomeIcon icon={faCloudDownloadAlt} size="lg" opacity="0.6" />
            </div>
            <div className="mt-1 small">DNS records updated</div>
          </Card.Body>
        </Card>
      </Col>

      <Col xs={6} md={3}>
        <Card className="text-white bg-danger h-100">
          <Card.Body className="p-2">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="small fw-bold">Deleted</div>
                <h3 className="mt-1 mb-0">{stats.deleted}</h3>
              </div>
              <FontAwesomeIcon icon={faTrashAlt} size="lg" opacity="0.6" />
            </div>
            <div className="mt-1 small">DNS records deleted</div>
          </Card.Body>
        </Card>
      </Col>

      <Col xs={6} md={3}>
        <Card className="text-white bg-warning h-100">
          <Card.Body className="p-2">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="small fw-bold">Errors</div>
                <h3 className="mt-1 mb-0">{stats.errors}</h3>
              </div>
              <FontAwesomeIcon icon={faExclamationTriangle} size="lg" opacity="0.6" />
            </div>
            <div className="mt-1 small">Processing errors</div>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
};

export default StatsOverview;