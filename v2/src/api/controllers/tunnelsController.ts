/**
 * Tunnels Controller
 */
import type { Request, Response } from 'express';
import { container, ServiceTokens } from '../../core/ServiceContainer.js';
import { ApiError, asyncHandler, setAuditContext } from '../middleware/index.js';
import {
  createTunnelSchema,
  tunnelIngressRuleSchema,
  updateTunnelConfigSchema,
} from '../validation.js';
import type { TunnelManager } from '../../services/TunnelManager.js';

/**
 * Get TunnelManager or throw error
 */
function getTunnelManager(): TunnelManager {
  if (!container.isInstantiated(ServiceTokens.TUNNEL_MANAGER)) {
    throw ApiError.badRequest('Tunnel management not available');
  }

  const tunnelManager = container.resolveSync<TunnelManager>(ServiceTokens.TUNNEL_MANAGER);

  if (!tunnelManager.isTunnelSupportAvailable()) {
    throw ApiError.badRequest('Tunnel support not configured. Ensure Cloudflare provider has accountId.');
  }

  return tunnelManager;
}

/**
 * List all tunnels
 */
export const listTunnels = asyncHandler(async (req: Request, res: Response) => {
  const tunnelManager = getTunnelManager();
  const tunnels = await tunnelManager.listTunnels();

  res.json({
    success: true,
    data: tunnels,
  });
});

/**
 * Get a single tunnel
 */
export const getTunnel = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const tunnelManager = getTunnelManager();

  const tunnel = await tunnelManager.getTunnel(id);

  if (!tunnel) {
    throw ApiError.notFound('Tunnel');
  }

  // Get ingress rules
  const ingressRules = await tunnelManager.getIngressRules(id);

  res.json({
    success: true,
    data: {
      ...tunnel,
      ingressRules,
    },
  });
});

/**
 * Create a new tunnel
 */
export const createTunnel = asyncHandler(async (req: Request, res: Response) => {
  const input = createTunnelSchema.parse(req.body);
  const tunnelManager = getTunnelManager();

  const tunnel = await tunnelManager.createTunnel({
    name: input.name,
    secret: input.secret,
  });

  setAuditContext(req, {
    action: 'create',
    resourceType: 'tunnel',
    resourceId: tunnel.id,
    details: { name: input.name },
  });

  res.status(201).json({
    success: true,
    data: tunnel,
  });
});

/**
 * Delete a tunnel
 */
export const deleteTunnel = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const tunnelManager = getTunnelManager();

  const tunnel = await tunnelManager.getTunnel(id);
  if (!tunnel) {
    throw ApiError.notFound('Tunnel');
  }

  await tunnelManager.deleteTunnel(id);

  setAuditContext(req, {
    action: 'delete',
    resourceType: 'tunnel',
    resourceId: id,
    details: { name: tunnel.name },
  });

  res.json({
    success: true,
    message: 'Tunnel deleted',
  });
});

/**
 * List ingress rules for a tunnel
 */
export const listIngressRules = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const tunnelManager = getTunnelManager();

  const tunnel = await tunnelManager.getTunnel(id);
  if (!tunnel) {
    throw ApiError.notFound('Tunnel');
  }

  const rules = await tunnelManager.getIngressRules(id);

  res.json({
    success: true,
    data: rules,
  });
});

/**
 * Add an ingress rule
 */
export const addIngressRule = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const input = tunnelIngressRuleSchema.parse(req.body);
  const tunnelManager = getTunnelManager();

  const tunnel = await tunnelManager.getTunnel(id);
  if (!tunnel) {
    throw ApiError.notFound('Tunnel');
  }

  const rule = await tunnelManager.addIngressRule(id, {
    hostname: input.hostname,
    service: input.service,
    path: input.path,
    originRequest: input.originRequest,
  });

  setAuditContext(req, {
    action: 'create',
    resourceType: 'tunnelIngressRule',
    resourceId: rule.id,
    details: { tunnelId: id, hostname: input.hostname },
  });

  res.status(201).json({
    success: true,
    data: rule,
  });
});

/**
 * Remove an ingress rule
 */
export const removeIngressRule = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const hostname = req.params.hostname as string;
  const tunnelManager = getTunnelManager();

  const tunnel = await tunnelManager.getTunnel(id);
  if (!tunnel) {
    throw ApiError.notFound('Tunnel');
  }

  await tunnelManager.removeIngressRule(id, hostname);

  setAuditContext(req, {
    action: 'delete',
    resourceType: 'tunnelIngressRule',
    details: { tunnelId: id, hostname },
  });

  res.json({
    success: true,
    message: 'Ingress rule removed',
  });
});

/**
 * Update tunnel configuration (all ingress rules)
 */
export const updateTunnelConfig = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const input = updateTunnelConfigSchema.parse(req.body);
  const tunnelManager = getTunnelManager();

  const tunnel = await tunnelManager.getTunnel(id);
  if (!tunnel) {
    throw ApiError.notFound('Tunnel');
  }

  await tunnelManager.updateTunnelConfiguration(id, {
    ingress: input.ingress.map((rule) => ({
      hostname: rule.hostname,
      service: rule.service,
      path: rule.path,
      originRequest: rule.originRequest,
    })),
  });

  setAuditContext(req, {
    action: 'deploy',
    resourceType: 'tunnel',
    resourceId: id,
    details: { ingressCount: input.ingress.length },
  });

  // Get updated ingress rules
  const rules = await tunnelManager.getIngressRules(id);

  res.json({
    success: true,
    data: {
      tunnel,
      ingressRules: rules,
    },
    message: 'Tunnel configuration updated',
  });
});

/**
 * Deploy tunnel (alias for update config)
 */
export const deployTunnel = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const tunnelManager = getTunnelManager();

  const tunnel = await tunnelManager.getTunnel(id);
  if (!tunnel) {
    throw ApiError.notFound('Tunnel');
  }

  // Get current ingress rules and redeploy
  const rules = await tunnelManager.getIngressRules(id);

  if (rules.length === 0) {
    throw ApiError.badRequest('Tunnel has no ingress rules to deploy');
  }

  await tunnelManager.updateTunnelConfiguration(id, {
    ingress: rules.map((rule) => ({
      hostname: rule.hostname,
      service: rule.service,
      path: rule.path,
    })),
  });

  setAuditContext(req, {
    action: 'deploy',
    resourceType: 'tunnel',
    resourceId: id,
  });

  res.json({
    success: true,
    message: 'Tunnel deployed',
  });
});
