// src/webui/components/common/ErrorScreen.jsx
import React from 'react';
import { Container, Row, Col, Button, Card } from 'react-bootstrap';
import { FaExclamationTriangle } from 'react-icons/fa';

const ErrorScreen = ({ message, onRetry }) => {
  return (
    <Container fluid className="vh-100 d-flex align-items-center justify-content-center bg-dark">
      <Card className="text-center shadow-lg border-danger" style={{ maxWidth: '500px' }}>
        <Card.Header className="bg-danger text-white">
          <h4 className="mb-0">Connection Error</h4>
        </Card.Header>
        <Card.Body className="py-5">
          <Row className="text-center">
            <Col xs={12} className="mb-4">
              <FaExclamationTriangle size={50} className="text-danger" />
            </Col>
            <Col xs={12} className="mb-4">
              <p className="text-light">{message}</p>
            </Col>
            <Col xs={12}>
              <Button variant="primary" onClick={onRetry}>
                Retry Connection
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default ErrorScreen;
