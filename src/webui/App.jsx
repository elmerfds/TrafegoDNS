// src/webui/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';

// Layouts
import MainLayout from './layouts/main-layout/MainLayout';

// Components
import LoadingScreen from './components/common/LoadingScreen';
import ErrorScreen from './components/common/ErrorScreen';

// API service
import { fetchStatus } from './services/apiService';

function App() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const getInitialStatus = async () => {
      try {
        setLoading(true);
        const data = await fetchStatus();
        setStatus(data);
        setError(null);
      } catch (err) {
        console.error('Failed to connect to API:', err);
        setError('Failed to connect to TráfegoDNS API. Please ensure the service is running.');
      } finally {
        setLoading(false);
      }
    };

    getInitialStatus();
  }, []);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    fetchStatus()
      .then(data => {
        setStatus(data);
      })
      .catch(err => {
        console.error('Retry failed:', err);
        setError('Connection failed. Please check if TráfegoDNS is running.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  if (loading) {
    return <LoadingScreen message="Connecting to TráfegoDNS..." />;
  }

  if (error) {
    return <ErrorScreen message={error} onRetry={handleRetry} />;
  }

  return (
    <Router>
      <MainLayout appStatus={status} />
    </Router>
  );
}

export default App;
