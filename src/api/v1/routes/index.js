/**
 * API Routes Index
 * Imports and configures all API routes
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');

// Import routes
const authRoutes = require('./authRoutes');
const dnsRoutes = require('./dnsRoutes');
const statusRoutes = require('./statusRoutes');
const containerRoutes = require('./containerRoutes');
const hostnameRoutes = require('./hostnameRoutes');
const configRoutes = require('./configRoutes');

// Mount public routes that don't require authentication
router.use('/auth', authRoutes);
router.use('/status/health', express.Router().get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API is operational' });
}));

// Apply authentication middleware to all protected routes
// The localAuthBypass middleware will be injected before this in app.js
// and will set req.user for local requests, allowing them to bypass authentication
router.use(authenticate);

// Mount protected routes that require authentication (or local bypass)
router.use('/dns', dnsRoutes);
router.use('/status', statusRoutes);
router.use('/containers', containerRoutes);
router.use('/hostnames', hostnameRoutes);
router.use('/config', configRoutes);

// Export the router
module.exports = router;