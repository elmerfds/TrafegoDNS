// webui/src/components/Auth/LoginPage.js
import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSignInAlt, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import authService from '../../services/authService';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [validated, setValidated] = useState(false);
  const [authStatus, setAuthStatus] = useState({
    localEnabled: true,
    oidcEnabled: false
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { currentUser, login, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check for query parameters (token from OIDC)
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const firstLogin = params.get('firstLogin');
    
    if (token) {
      // Store token and redirect
      localStorage.setItem('token', token);
      
      // If this was first login, show welcome message
      if (firstLogin === 'true') {
        // Navigate with replace to remove token from URL
        navigate('/dashboard', { replace: true });
        // You can add a welcome toast message here if desired
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
    
    // Check authentication status
    const checkAuthStatus = async () => {
      try {
        const response = await authService.getAuthStatus();
        setAuthStatus({
          localEnabled: response.data.local,
          oidcEnabled: response.data.oidc,
          oidcOnly: response.data.oidcOnly
        });
      } catch (error) {
        console.error('Failed to check auth status:', error);
        setAuthStatus({
          localEnabled: true,
          oidcEnabled: false,
          oidcOnly: false
        });
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, [navigate, location]);
  
  // Redirect to dashboard if already logged in
  if (currentUser) {
    return navigate('/dashboard', { replace: true });
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    
    if (form.checkValidity() === false) {
      event.stopPropagation();
      setValidated(true);
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const success = await login(username, password);
      if (!success) {
        setError('Login failed. Please check your credentials.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOidcLogin = () => {
    window.location.href = '/api/auth/oidc/login';
  };

  if (isLoading || authLoading) {
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
              
              {error && (
                <Alert variant="danger" className="d-flex align-items-center">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
                  {error}
                </Alert>
              )}
              
              {authStatus.oidcOnly && (
                <Alert variant="info">
                  Local login is disabled. Please use OIDC authentication.
                </Alert>
              )}
              
              {(!authStatus.localEnabled && !authStatus.oidcEnabled) && (
                <Alert variant="warning">
                  Authentication is disabled. Contact your administrator.
                </Alert>
              )}
              
              {authStatus.localEnabled && !authStatus.oidcOnly && (
                <Form noValidate validated={validated} onSubmit={handleSubmit}>
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
                    <Form.Control.Feedback type="invalid">
                      Please enter your username.
                    </Form.Control.Feedback>
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
                    <Form.Control.Feedback type="invalid">
                      Please enter your password.
                    </Form.Control.Feedback>
                  </Form.Group>
                  
                  <div className="d-grid mb-3">
                    <Button 
                      type="submit" 
                      variant="primary" 
                      size="lg" 
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
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
                        <>
                          <FontAwesomeIcon icon={faSignInAlt} className="me-2" />
                          Sign In
                        </>
                      )}
                    </Button>
                  </div>
                </Form>
              )}
              
              {authStatus.oidcEnabled && (
                <div className="d-grid">
                  <Button 
                    variant={authStatus.localEnabled ? "outline-secondary" : "primary"} 
                    size="lg" 
                    onClick={handleOidcLogin}
                    disabled={isSubmitting}
                  >
                    Sign in with OIDC
                  </Button>
                </div>
              )}
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