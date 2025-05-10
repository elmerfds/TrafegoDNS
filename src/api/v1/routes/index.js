/**
 * API Routes Index
 * Imports and configures all API routes
 */
const express = require('express');
const router = express.Router();

// Import routes
const authRoutes = require('./authRoutes');
const dnsRoutes = require('./dnsRoutes');
const statusRoutes = require('./statusRoutes');
const containerRoutes = require('./containerRoutes');
const hostnameRoutes = require('./hostnameRoutes');
const configRoutes = require('./configRoutes');

// Register routes
router.use('/auth', authRoutes);
router.use('/dns', dnsRoutes);
router.use('/status', statusRoutes);
router.use('/containers', containerRoutes);
router.use('/hostnames', hostnameRoutes);
router.use('/config', configRoutes);

// Export the router
module.exports = router;