// src/webui/components/common/LoadingScreen.jsx
import React from 'react';
import { Container, Row, Col, Spinner } from 'react-bootstrap';

const LoadingScreen = ({ message = 'Loading...' }) => {
  return (
    <Container fluid className="vh-100 d-flex align-items-center justify-content-center bg-dark">
      <Row className="text-center">
        <Col xs={12} className="mb-4">
          <Spinner animation="border" role="status" style={{ width: '3rem', height: '3rem' }}>
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </Col>
        <Col xs={12}>
          <h4 className="text-light">{message}</h4>
        </Col>
      </Row>
    </Container>
  );
};

export default LoadingScreen;
