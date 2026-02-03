/**
 * Webhooks API
 */
import { apiClient } from './client';

export type WebhookEventType =
  | 'dns.record.created'
  | 'dns.record.updated'
  | 'dns.record.deleted'
  | 'dns.record.orphaned'
  | 'tunnel.created'
  | 'tunnel.deployed'
  | 'system.sync.completed'
  | 'system.error';

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode?: number;
  response?: string;
  attempts: number;
  deliveredAt?: string;
  nextRetryAt?: string;
  createdAt: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: WebhookEventType[];
  secret?: string;
  enabled?: boolean;
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  events?: WebhookEventType[];
  secret?: string;
  enabled?: boolean;
}

export interface WebhookDeliveriesResponse {
  deliveries: WebhookDelivery[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TestWebhookResult {
  delivered: boolean;
  message: string;
}

export const webhooksApi = {
  async listWebhooks(): Promise<Webhook[]> {
    return apiClient.get<Webhook[]>('/webhooks');
  },

  async getWebhook(id: string): Promise<Webhook> {
    return apiClient.get<Webhook>(`/webhooks/${id}`);
  },

  async createWebhook(data: CreateWebhookInput): Promise<Webhook> {
    return apiClient.post<Webhook>('/webhooks', data);
  },

  async updateWebhook(id: string, data: UpdateWebhookInput): Promise<Webhook> {
    return apiClient.put<Webhook>(`/webhooks/${id}`, data);
  },

  async deleteWebhook(id: string): Promise<void> {
    await apiClient.delete(`/webhooks/${id}`);
  },

  async testWebhook(id: string): Promise<TestWebhookResult> {
    return apiClient.post<TestWebhookResult>(`/webhooks/${id}/test`);
  },

  async getDeliveries(
    webhookId: string,
    params?: { page?: number; limit?: number }
  ): Promise<WebhookDeliveriesResponse> {
    return apiClient.get<WebhookDeliveriesResponse>(
      `/webhooks/${webhookId}/deliveries`,
      params
    );
  },
};
