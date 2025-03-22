import React from 'react';
import { Container, Spinner } from 'react-bootstrap';

const LoadingScreen = () => {
  return (
    <Container 
      fluid 
      className="d-flex flex-column justify-content-center align-items-center" 
      style={{ 
        minHeight: '100vh',
        backgroundColor: '#111827'
      }}
    >
      <img
        src="/api/placeholder/240/240"
        alt="TráfegoDNS Logo"
        className="mb-4"
        width="120"
        height="120"
      />
      <h2 className="text-light mb-4">TráfegoDNS</h2>
      <Spinner animation="border" variant="primary" />
      <p className="text-light mt-3">Loading...</p>
    </Container>
  );
};

export default LoadingScreen;