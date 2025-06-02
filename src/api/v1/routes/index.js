/**
 * API Routes Index
 * Imports and configures all API routes
 */
const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');

// Import routes
const authRoutes = require('./authRoutes');
const dnsRoutes = require('./dnsRoutes');
const statusRoutes = require('./statusRoutes');
const containerRoutes = require('./containerRoutes');
const hostnameRoutes = require('./hostnameRoutes');
const configRoutes = require('./configRoutes');
const logsRoutes = require('./logsRoutes');
const activityRoutes = require('./activityRoutes');
const pauseRoutes = require('./pauseRoutes');
const userPreferencesRoutes = require('./userPreferencesRoutes');
const dashboardLayoutsRoutes = require('./dashboardLayoutsRoutes');
const createPortRoutes = require('./portRoutes');

/**
 * Create router with dependencies
 */
function createRoutes(dependencies = {}) {
  const router = express.Router();
  const { database, portMonitor } = dependencies;

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
  router.use('/logs', logsRoutes);
  router.use('/activity', activityRoutes);
  router.use('/system', pauseRoutes);
  router.use('/user', userPreferencesRoutes);
  router.use('/user/dashboard-layouts', dashboardLayoutsRoutes);

  // Mount port routes if dependencies are available
  if (database && portMonitor) {
    router.use('/ports', createPortRoutes(database, portMonitor));
  }

  return router;
}

// For backward compatibility, export a default router
const defaultRouter = createRoutes();

module.exports = createRoutes;
module.exports.default = defaultRouter;