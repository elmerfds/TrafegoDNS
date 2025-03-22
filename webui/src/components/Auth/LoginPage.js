// webui/src/components/Auth/LoginPage.js
import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import authService from '../../services/authService';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [validated, setValidated] = useState(false);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { currentUser, login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Check for token in URL (for OIDC callback)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    
    if (token) {
      // Store token and redirect
      localStorage.setItem('token', token);
      // Force reload to apply the token and reset the app state
      window.location.href = '/dashboard';
    }
  }, [location, navigate]);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await authService.getAuthStatus();
        setOidcEnabled(response.data.oidc);
      } catch (error) {
        console.error('Failed to check auth status:', error);
      }
    };

    checkAuthStatus();
  }, []);
  
  // Redirect if already logged in
  if (currentUser) {
    return <Navigate to="/dashboard" />;
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
      // Use authService directly instead of the login function from context
      const response = await authService.login(username, password);
      
      if (response.data && response.data.token) {
        // Store token in localStorage
        localStorage.setItem('token', response.data.token);
        
        // Force a full page reload to restart the app with the new token
        window.location.href = '/dashboard';
      } else {
        setError('Login failed. Invalid response from server.');
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
      setIsSubmitting(false);
    }
  };

  const handleOidcLogin = () => {
    window.location.href = '/api/auth/oidc/login';
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
                      'Sign In'
                    )}
                  </Button>
                </div>
                
                {oidcEnabled && (
                  <div className="d-grid">
                    <Button 
                      variant="outline-secondary" 
                      size="lg" 
                      onClick={handleOidcLogin}
                      disabled={isSubmitting}
                    >
                      Sign in with OIDC
                    </Button>
                  </div>
                )}
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