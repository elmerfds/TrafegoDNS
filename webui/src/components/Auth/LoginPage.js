// src/components/Auth/LoginPage.js
import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

// Auth debugging function (defined in index.js)
const logAuthEvent = (event, data) => {
  try {
    let logs = JSON.parse(localStorage.getItem('auth_debug_logs') || '[]');
    logs.push({
      time: new Date().toISOString(),
      event,
      data,
      path: window.location.pathname
    });
    // Keep only the last 20 entries
    if (logs.length > 20) logs = logs.slice(-20);
    localStorage.setItem('auth_debug_logs', JSON.stringify(logs));
  } catch (e) {
    console.error('Error logging auth event:', e);
  }
};

const LoginPage = () => {
  const { currentUser, isLoading, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // On first load
  useEffect(() => {
    logAuthEvent('login_page_mounted', {
      hasToken: !!localStorage.getItem('token'),
      currentUser: currentUser ? currentUser.username : null,
      isLoading
    });
  }, []);

  // If already logged in, redirect to dashboard - but use navigate instead of automatic redirect
  useEffect(() => {
    if (!isLoading && currentUser) {
      logAuthEvent('already_logged_in_redirect', {
        user: currentUser.username,
        role: currentUser.role
      });
      navigate('/dashboard');
    }
  }, [currentUser, isLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setError('');
    
    logAuthEvent('login_form_submit', { username });

    try {
      // Use the login function from auth context
      const success = await login(username, password);
      
      if (success) {
        logAuthEvent('login_redirect_triggered', {});
        
        // Slight delay to ensure state has been updated
        setTimeout(() => {
          // Force a full page reload to clean React state
          window.location.href = '/dashboard';
        }, 500);
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      logAuthEvent('login_handle_error', { 
        message: err.message 
      });
      
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <Spinner animation="border" variant="primary" />
      </Container>
    );
  }

  return (
    <Container fluid className="bg-body d-flex align-items-center justify-content-center" style={{ minHeight: '100vh', padding: '1rem' }}>
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
                    disabled={loginLoading}
                  >
                    {loginLoading ? (
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