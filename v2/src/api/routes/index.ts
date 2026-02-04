/**
 * API Routes
 * Main router that combines all route groups
 */
import { Router } from 'express';
import {
  authenticate,
  optionalAuthenticate,
  requireRole,
  requirePermission,
  standardRateLimit,
  authRateLimit,
  auditMiddleware,
} from '../middleware/index.js';

// Controllers
import {
  healthCheck,
  readinessCheck,
  livenessCheck,
} from '../controllers/healthController.js';

import {
  login,
  logout,
  getCurrentUser,
  createApiKeyHandler,
  listApiKeys,
  revokeApiKey,
} from '../controllers/authController.js';

import {
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  syncRecords,
} from '../controllers/dnsController.js';

import {
  listProviders,
  getProvider,
  createProviderHandler,
  updateProvider,
  deleteProvider,
  testProvider,
} from '../controllers/providersController.js';

import {
  listTunnels,
  getTunnel,
  createTunnel,
  deleteTunnel,
  listIngressRules,
  addIngressRule,
  removeIngressRule,
  updateTunnelConfig,
  deployTunnel,
} from '../controllers/tunnelsController.js';

import {
  listWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  getWebhookDeliveries,
} from '../controllers/webhooksController.js';

import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
} from '../controllers/usersController.js';

import {
  listSettings,
  getSetting,
  updateSetting,
  updateBulkSettings,
  deleteSetting,
  getSettingsSchema,
  getSettingsByCategory,
  resetSetting,
} from '../controllers/settingsController.js';

import {
  listAuditLogs,
  getAuditLog,
  getAuditStats,
} from '../controllers/auditController.js';

import {
  listPreservedHostnames,
  getPreservedHostname,
  createPreservedHostname,
  updatePreservedHostname,
  deletePreservedHostname,
} from '../controllers/preservedHostnamesController.js';

const router = Router();

// Apply standard rate limiting to all routes
router.use(standardRateLimit);

// Health check routes (no auth required)
router.get('/health', healthCheck);
router.get('/health/ready', readinessCheck);
router.get('/health/live', livenessCheck);

// Auth routes
const authRouter = Router();
authRouter.post('/login', authRateLimit, login);
authRouter.post('/logout', authenticate, logout);
authRouter.get('/me', authenticate, getCurrentUser);
authRouter.post('/api-keys', authenticate, createApiKeyHandler);
authRouter.get('/api-keys', authenticate, listApiKeys);
authRouter.delete('/api-keys/:id', authenticate, revokeApiKey);
router.use('/auth', authRouter);

// DNS Records routes
const dnsRouter = Router();
dnsRouter.use(authenticate);
dnsRouter.use(auditMiddleware);
dnsRouter.get('/records', requirePermission('read'), listRecords);
dnsRouter.get('/records/:id', requirePermission('read'), getRecord);
dnsRouter.post('/records', requirePermission('write'), createRecord);
dnsRouter.put('/records/:id', requirePermission('write'), updateRecord);
dnsRouter.delete('/records/:id', requirePermission('write'), deleteRecord);
dnsRouter.post('/records/sync', requirePermission('write'), syncRecords);
router.use('/dns', dnsRouter);

// Providers routes
const providersRouter = Router();
providersRouter.use(authenticate);
providersRouter.use(auditMiddleware);
providersRouter.get('/', requirePermission('read'), listProviders);
providersRouter.get('/:id', requirePermission('read'), getProvider);
providersRouter.post('/', requireRole('admin'), createProviderHandler);
providersRouter.put('/:id', requireRole('admin'), updateProvider);
providersRouter.delete('/:id', requireRole('admin'), deleteProvider);
providersRouter.post('/:id/test', requirePermission('read'), testProvider);
router.use('/providers', providersRouter);

// Tunnels routes
const tunnelsRouter = Router();
tunnelsRouter.use(authenticate);
tunnelsRouter.use(auditMiddleware);
tunnelsRouter.get('/', requirePermission('read'), listTunnels);
tunnelsRouter.get('/:id', requirePermission('read'), getTunnel);
tunnelsRouter.post('/', requirePermission('write'), createTunnel);
tunnelsRouter.delete('/:id', requirePermission('write'), deleteTunnel);
tunnelsRouter.get('/:id/ingress', requirePermission('read'), listIngressRules);
tunnelsRouter.post('/:id/ingress', requirePermission('write'), addIngressRule);
tunnelsRouter.delete('/:id/ingress/:hostname', requirePermission('write'), removeIngressRule);
tunnelsRouter.put('/:id/config', requirePermission('write'), updateTunnelConfig);
tunnelsRouter.post('/:id/deploy', requirePermission('write'), deployTunnel);
router.use('/tunnels', tunnelsRouter);

// Webhooks routes
const webhooksRouter = Router();
webhooksRouter.use(authenticate);
webhooksRouter.use(auditMiddleware);
webhooksRouter.get('/', requirePermission('read'), listWebhooks);
webhooksRouter.get('/:id', requirePermission('read'), getWebhook);
webhooksRouter.post('/', requirePermission('write'), createWebhook);
webhooksRouter.put('/:id', requirePermission('write'), updateWebhook);
webhooksRouter.delete('/:id', requirePermission('write'), deleteWebhook);
webhooksRouter.post('/:id/test', requirePermission('write'), testWebhook);
webhooksRouter.get('/:id/deliveries', requirePermission('read'), getWebhookDeliveries);
router.use('/webhooks', webhooksRouter);

// Users routes (admin only)
const usersRouter = Router();
usersRouter.use(authenticate);
usersRouter.use(requireRole('admin'));
usersRouter.use(auditMiddleware);
usersRouter.get('/', listUsers);
usersRouter.get('/:id', getUser);
usersRouter.post('/', createUser);
usersRouter.put('/:id', updateUser);
usersRouter.delete('/:id', deleteUser);
router.use('/users', usersRouter);

// Settings routes
const settingsRouter = Router();
settingsRouter.use(authenticate);
settingsRouter.use(auditMiddleware);
settingsRouter.get('/schema', requirePermission('read'), getSettingsSchema);
settingsRouter.get('/categories', requirePermission('read'), getSettingsByCategory);
settingsRouter.get('/', requirePermission('read'), listSettings);
settingsRouter.get('/:key', requirePermission('read'), getSetting);
settingsRouter.put('/:key', requireRole('admin'), updateSetting);
settingsRouter.put('/', requireRole('admin'), updateBulkSettings);
settingsRouter.post('/:key/reset', requireRole('admin'), resetSetting);
settingsRouter.delete('/:key', requireRole('admin'), deleteSetting);
router.use('/settings', settingsRouter);

// Audit routes (admin only)
const auditRouter = Router();
auditRouter.use(authenticate);
auditRouter.use(requireRole('admin'));
auditRouter.get('/', listAuditLogs);
auditRouter.get('/stats', getAuditStats);
auditRouter.get('/:id', getAuditLog);
router.use('/audit', auditRouter);

// Preserved Hostnames routes
const preservedRouter = Router();
preservedRouter.use(authenticate);
preservedRouter.use(auditMiddleware);
preservedRouter.get('/', requirePermission('read'), listPreservedHostnames);
preservedRouter.get('/:id', requirePermission('read'), getPreservedHostname);
preservedRouter.post('/', requirePermission('write'), createPreservedHostname);
preservedRouter.put('/:id', requirePermission('write'), updatePreservedHostname);
preservedRouter.delete('/:id', requirePermission('write'), deletePreservedHostname);
router.use('/preserved-hostnames', preservedRouter);

export { router as apiRouter };
