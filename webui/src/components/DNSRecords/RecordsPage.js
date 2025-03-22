// src/components/DNSRecords/RecordsPage.js
import React, { useState, useEffect } from 'react';
import { Row, Col, Nav, Tab, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSyncAlt } from '@fortawesome/free-solid-svg-icons';
import { useSettings } from '../../contexts/SettingsContext';
import recordsService from '../../services/recordsService';
import dnsService from '../../services/dnsService';
import TrackedRecordsTab from './TrackedRecordsTab';
import PreservedHostnamesTab from './PreservedHostnamesTab';
import ManagedHostnamesTab from './ManagedHostnamesTab';
import ActiveHostnamesTab from './ActiveHostnamesTab';
import PageHeader from '../Layout/PageHeader';

const RecordsPage = () => {
  const { providers } = useSettings();
  const [activeTab, setActiveTab] = useState('tracked');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [records, setRecords] = useState({
    tracked: [],
    preserved: [],
    managed: []
  });
  const [activeHostnames, setActiveHostnames] = useState([]);

  useEffect(() => {
    fetchRecordsData();
  }, []);

  const fetchRecordsData = async () => {
    setIsLoading(true);
    try {
      const [recordsResponse, hostnamesResponse] = await Promise.all([
        recordsService.getAllRecords(),
        dnsService.getActiveHostnames()
      ]);

      setRecords(recordsResponse.data);
      setActiveHostnames(hostnamesResponse.data.hostnames || []);
    } catch (error) {
      console.error('Error fetching records data:', error);
      toast.error('Failed to load DNS records data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabSelect = (key) => {
    setActiveTab(key);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchRecordsData();
      toast.success('DNS records data refreshed');
    } catch (error) {
      console.error('Error refreshing records data:', error);
      toast.error('Failed to refresh DNS records data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const updateTrackedRecords = (updatedRecords) => {
    setRecords(prev => ({ ...prev, tracked: updatedRecords }));
  };

  const updatePreservedHostnames = (updatedHostnames) => {
    setRecords(prev => ({ ...prev, preserved: updatedHostnames }));
  };

  const updateManagedHostnames = (updatedHostnames) => {
    setRecords(prev => ({ ...prev, managed: updatedHostnames }));
  };

  if (isLoading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3">Loading DNS records data...</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader 
        title="DNS Records" 
        buttonText={isRefreshing ? "Refreshing..." : "Refresh Records"}
        buttonIcon={<FontAwesomeIcon icon={faSyncAlt} className="me-1" />}
        buttonVariant="outline-primary"
        buttonDisabled={isRefreshing}
        onButtonClick={handleRefresh}
      />

      <Row className="mb-4">
        <Col>
          <Tab.Container activeKey={activeTab} onSelect={handleTabSelect}>
            <Nav variant="tabs" className="mb-3">
              <Nav.Item>
                <Nav.Link eventKey="tracked">
                  Tracked Records
                  <span className="badge bg-primary ms-2">{records.tracked.length}</span>
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="preserved">
                  Preserved Hostnames
                  <span className="badge bg-success ms-2">{records.preserved.length}</span>
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="managed">
                  Managed Hostnames
                  <span className="badge bg-info ms-2">{records.managed.length}</span>
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="active">
                  Active Hostnames
                  <span className="badge bg-warning ms-2">{activeHostnames.length}</span>
                </Nav.Link>
              </Nav.Item>
            </Nav>

            <Tab.Content>
              <Tab.Pane eventKey="tracked">
                <TrackedRecordsTab 
                  records={records.tracked} 
                  updateRecords={updateTrackedRecords}
                  providerName={providers.current}
                  onRecordsChanged={fetchRecordsData}
                />
              </Tab.Pane>
              <Tab.Pane eventKey="preserved">
                <PreservedHostnamesTab 
                  hostnames={records.preserved}
                  updateHostnames={updatePreservedHostnames}
                  onHostnamesChanged={fetchRecordsData}
                />
              </Tab.Pane>
              <Tab.Pane eventKey="managed">
                <ManagedHostnamesTab 
                  managedHostnames={records.managed}
                  updateManagedHostnames={updateManagedHostnames}
                  providerName={providers.current}
                  onHostnamesChanged={fetchRecordsData}
                />
              </Tab.Pane>
              <Tab.Pane eventKey="active">
                <ActiveHostnamesTab 
                  hostnames={activeHostnames}
                  trackedRecords={records.tracked}
                  preservedHostnames={records.preserved}
                  providerName={providers.current}
                />
              </Tab.Pane>
            </Tab.Content>
          </Tab.Container>
        </Col>
      </Row>
    </>
  );
};

export default RecordsPage;