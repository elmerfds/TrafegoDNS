/**
 * Security Logs API
 */
import { apiClient } from './client';

export interface SecurityLogEntry {
  id: string;
  eventType: string;
  userId: string | null;
  sessionId: string | null;
  ipAddress: string;
  userAgent: string | null;
  authMethod: string | null;
  success: boolean;
  failureReason: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  user?: { id: string; username: string } | null;
}

export interface SecurityLogFilters {
  eventType?: string;
  userId?: string;
  ipAddress?: string;
  success?: string;
  page?: number;
  limit?: number;
}

export interface SecurityStats {
  totalEvents: number;
  failedLogins: number;
  successfulLogins: number;
  topIPs: Array<{ ip: string; count: number }>;
}

export const securityApi = {
  async getSecurityLogs(filters: SecurityLogFilters = {}): Promise<{
    logs: SecurityLogEntry[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const params = new URLSearchParams();
    if (filters.eventType) params.set('eventType', filters.eventType);
    if (filters.userId) params.set('userId', filters.userId);
    if (filters.ipAddress) params.set('ipAddress', filters.ipAddress);
    if (filters.success !== undefined) params.set('success', filters.success);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.limit) params.set('limit', String(filters.limit));

    const qs = params.toString();
    return apiClient.get(`/security${qs ? `?${qs}` : ''}`);
  },

  async getSecurityStats(since?: string): Promise<SecurityStats> {
    const params = since ? `?since=${encodeURIComponent(since)}` : '';
    return apiClient.get<SecurityStats>(`/security/stats${params}`);
  },
};
