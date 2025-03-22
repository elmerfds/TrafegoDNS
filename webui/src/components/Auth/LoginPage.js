// src/components/Auth/LoginPage.js
import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import axios from 'axios';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Check if we're already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // We have a token, redirect to dashboard
      window.location.href = '/dashboard';
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!username || !password) {
      setError('Username and password are required');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Direct API call without using the service
      const response = await axios.post('/api/auth/login', {
        username,
        password
      });

      if (response.data && response.data.token) {
        // Store token in localStorage
        localStorage.setItem('token', response.data.token);
        
        // Show success toast
        toast.success('Login successful');
        
        // Redirect to dashboard with full page reload
        window.location.href = '/dashboard';
      } else {
        setError('Invalid response from server');
      }
    } catch (err) {
      console.error('Login error:', err);
      
      let errorMessage = 'Login failed. Please check your credentials.';
      if (err.response) {
        if (err.response.status === 401) {
          errorMessage = 'Invalid username or password';
        } else if (err.response.data && err.response.data.message) {
          errorMessage = err.response.data.message;
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container fluid className="bg-dark d-flex align-items-center justify-content-center" style={{ minHeight: '100vh', padding: '1rem' }}>
      <Row className="justify-content-center w-100">
        <Col xs={12} sm={10} md={8} lg={6} xl={4}>
          <Card className="shadow-lg border-0">
            <Card.Body className="p-4">
              <div className="text-center mb-4">
                <img
                  src="/api/placeholder/120/120"
                  alt="TráfegoDNS Logo"
                  width="80"
                  height="80"
                  className="mb-3"
                />
                <h2 className="fw-bold">TráfegoDNS</h2>
                <p className="text-muted">Sign in to access your dashboard</p>
              </div>
              
              {error && <Alert variant="danger">{error}</Alert>}
              
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Username</Form.Label>
                  <Form.Control
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    placeholder="Enter your username"
                    autoComplete="username"
                  />
                </Form.Group>
                
                <Form.Group className="mb-4">
                  <Form.Label>Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                </Form.Group>
                
                <div className="d-grid mb-3">
                  <Button 
                    type="submit" 
                    variant="primary" 
                    size="lg" 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                          className="me-2"
                        />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
          
          <div className="text-center mt-4 text-light">
            <small>
              &copy; {new Date().getFullYear()} TráfegoDNS
            </small>
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default LoginPage;