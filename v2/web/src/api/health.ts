/**
 * Health & System API
 */
import { apiClient } from './client';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: {
    database: boolean;
    providers: {
      name: string;
      connected: boolean;
    }[];
  };
}

export interface AuditLog {
  id: string;
  userId?: string;
  apiKeyId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress: string;
  userAgent?: string;
  createdAt: string;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const healthApi = {
  async getHealth(): Promise<HealthStatus> {
    return apiClient.get<HealthStatus>('/health');
  },

  async getAuditLogs(params?: {
    page?: number;
    limit?: number;
    action?: string;
    resourceType?: string;
    userId?: string;
  }): Promise<AuditLogsResponse> {
    return apiClient.get<AuditLogsResponse>('/audit', params);
  },
};
