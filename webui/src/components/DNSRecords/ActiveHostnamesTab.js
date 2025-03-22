// src/components/DNSRecords/ActiveHostnamesTab.js
import React, { useState } from 'react';
import { Card, Table, Badge, Form, InputGroup, Alert, Button } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, 
  faCheck, 
  faTimes, 
  faQuestionCircle, 
  faInfoCircle, 
  faExclamationTriangle 
} from '@fortawesome/free-solid-svg-icons';
import { toast } from 'react-toastify';
import dnsService from '../../services/dnsService';
import recordsService from '../../services/recordsService';

const ActiveHostnamesTab = ({ hostnames = [], trackedRecords = [], preservedHostnames = [], providerName }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isChecking, setIsChecking] = useState({});
  const [recordStatuses, setRecordStatuses] = useState({});

  const filteredHostnames = hostnames.filter(hostname => 
    hostname.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value.toLowerCase());
  };

  const checkHostname = async (hostname) => {
    setIsChecking(prev => ({ ...prev, [hostname]: true }));
    
    try {
      const result = await dnsService.checkHostname(hostname);
      setRecordStatuses(prev => ({ ...prev, [hostname]: result.data }));
    } catch (error) {
      console.error(`Error checking hostname ${hostname}:`, error);
      toast.error(`Failed to check DNS status for ${hostname}`);
    } finally {
      setIsChecking(prev => ({ ...prev, [hostname]: false }));
    }
  };

  const isHostnameTracked = (hostname) => {
    return trackedRecords.some(record => 
      record.name === hostname || 
      record.name === `${hostname}.` || 
      record.name === `${hostname}.${providerName}`
    );
  };

  const isHostnamePreserved = (hostname) => {
    // Check for exact match
    if (preservedHostnames.includes(hostname)) return true;
    
    // Check for wildcard match
    return preservedHostnames.some(preserved => {
      if (preserved.startsWith('*.')) {
        const domain = preserved.substring(2);
        return hostname.endsWith(domain) && hostname.length > domain.length;
      }
      return false;
    });
  };

  return (
    <Card>
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center">
          <span>Active Hostnames</span>
          <InputGroup size="sm" style={{ maxWidth: '300px' }}>
            <InputGroup.Text>
              <FontAwesomeIcon icon={faSearch} />
            </InputGroup.Text>
            <Form.Control
              placeholder="Search hostnames..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </InputGroup>
        </div>
      </Card.Header>
      <Card.Body>
        <Alert variant="info" className="mb-3">
          <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
          These are hostnames currently active in your Docker containers or Traefik configuration.
          You can check their DNS status to ensure they're properly configured.
        </Alert>

        {filteredHostnames.length === 0 ? (
          <Alert variant="warning">
            <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
            {searchTerm ? 'No matching active hostnames found' : 'No active hostnames detected'}
          </Alert>
        ) : (
          <div className="table-responsive">
            <Table hover>
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHostnames.map((hostname, index) => {
                  const isTracked = isHostnameTracked(hostname);
                  const isPreserved = isHostnamePreserved(hostname);
                  const recordStatus = recordStatuses[hostname];
                  
                  return (
                    <tr key={index}>
                      <td>
                        <div className="fw-medium">{hostname}</div>
                        <div>
                          {isTracked && (
                            <Badge bg="primary" className="me-1">Tracked</Badge>
                          )}
                          {isPreserved && (
                            <Badge bg="success" className="me-1">Preserved</Badge>
                          )}
                        </div>
                      </td>
                      <td>
                        {recordStatus ? (
                          recordStatus.exists ? (
                            <Badge bg="success">
                              <FontAwesomeIcon icon={faCheck} className="me-1" />
                              Configured
                            </Badge>
                          ) : (
                            <Badge bg="danger">
                              <FontAwesomeIcon icon={faTimes} className="me-1" />
                              Missing
                            </Badge>
                          )
                        ) : (
                          <Badge bg="secondary">
                            <FontAwesomeIcon icon={faQuestionCircle} className="me-1" />
                            Unknown
                          </Badge>
                        )}
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => checkHostname(hostname)}
                          disabled={isChecking[hostname]}
                        >
                          {isChecking[hostname] ? 'Checking...' : 'Check DNS Status'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card.Body>
      <Card.Footer className="text-muted">
        Total active hostnames: {hostnames.length}
      </Card.Footer>
    </Card>
  );
};

export default ActiveHostnamesTab;