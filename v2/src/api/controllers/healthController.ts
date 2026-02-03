/**
 * Health Check Controller
 */
import type { Request, Response } from 'express';
import { getDatabase } from '../../database/connection.js';
import { container, ServiceTokens } from '../../core/ServiceContainer.js';
import type { DNSManager } from '../../services/DNSManager.js';
import type { TunnelManager } from '../../services/TunnelManager.js';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: { status: string; message?: string };
    providers: { status: string; count: number };
    tunnels: { status: string; available: boolean };
  };
}

/**
 * Health check endpoint
 */
export async function healthCheck(req: Request, res: Response): Promise<void> {
  const health: HealthStatus = {
    status: 'healthy',
    version: '2.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: 'unknown' },
      providers: { status: 'unknown', count: 0 },
      tunnels: { status: 'unknown', available: false },
    },
  };

  try {
    // Check database
    const db = getDatabase();
    const result = db.run('SELECT 1');
    health.checks.database = { status: 'ok' };
  } catch (error) {
    health.checks.database = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Database check failed',
    };
    health.status = 'unhealthy';
  }

  // Check DNS providers
  try {
    if (container.isInstantiated(ServiceTokens.DNS_MANAGER)) {
      const dnsManager = container.resolveSync<DNSManager>(ServiceTokens.DNS_MANAGER);
      const defaultProvider = dnsManager.getDefaultProvider();
      health.checks.providers = {
        status: defaultProvider ? 'ok' : 'no_default',
        count: defaultProvider ? 1 : 0,
      };
    }
  } catch (error) {
    health.checks.providers = { status: 'error', count: 0 };
    if (health.status === 'healthy') {
      health.status = 'degraded';
    }
  }

  // Check tunnel support
  try {
    if (container.isInstantiated(ServiceTokens.TUNNEL_MANAGER)) {
      const tunnelManager = container.resolveSync<TunnelManager>(ServiceTokens.TUNNEL_MANAGER);
      health.checks.tunnels = {
        status: 'ok',
        available: tunnelManager.isTunnelSupportAvailable(),
      };
    }
  } catch (error) {
    health.checks.tunnels = { status: 'error', available: false };
  }

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json({
    success: true,
    data: health,
  });
}

/**
 * Readiness check (for k8s)
 */
export function readinessCheck(req: Request, res: Response): void {
  try {
    const db = getDatabase();
    db.run('SELECT 1');
    res.status(200).json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
}

/**
 * Liveness check (for k8s)
 */
export function livenessCheck(req: Request, res: Response): void {
  res.status(200).json({ alive: true });
}
