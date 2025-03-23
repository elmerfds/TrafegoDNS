// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/custom.scss';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Auth debugging - temporary
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

// Add a simple way to check logs from console
window.showAuthLogs = () => {
  try {
    const logs = JSON.parse(localStorage.getItem('auth_debug_logs') || '[]');
    console.table(logs);
    return logs;
  } catch (e) {
    console.error('Error showing auth logs:', e);
    return [];
  }
};

// Clear logs helper
window.clearAuthLogs = () => {
  localStorage.removeItem('auth_debug_logs');
  console.log('Auth debug logs cleared');
};

// Log initial page load
logAuthEvent('page_load', { 
  token_exists: !!localStorage.getItem('token'),
  path: window.location.pathname 
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <ToastContainer 
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </BrowserRouter>
  </React.StrictMode>
);