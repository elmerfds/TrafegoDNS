/**
 * Tunnels API
 */
import { apiClient } from './client';

export interface Tunnel {
  id: string;
  name: string;
  externalTunnelId: string;
  status: 'active' | 'inactive' | 'degraded' | 'deleted';
  providerId: string;
  createdAt: string;
  updatedAt: string;
  ingressRules?: IngressRule[];
}

export interface IngressRule {
  id: string;
  hostname: string;
  service: string;
  path?: string;
  originRequest?: {
    noTLSVerify?: boolean;
    connectTimeout?: string;
    tlsTimeout?: string;
    httpHostHeader?: string;
  };
}

export interface CreateTunnelInput {
  name: string;
  secret?: string;
}

export interface AddIngressRuleInput {
  hostname: string;
  service: string;
  path?: string;
  originRequest?: IngressRule['originRequest'];
}

export interface UpdateTunnelConfigInput {
  ingress: AddIngressRuleInput[];
}

export const tunnelsApi = {
  async listTunnels(): Promise<Tunnel[]> {
    return apiClient.get<Tunnel[]>('/tunnels');
  },

  async getTunnel(id: string): Promise<Tunnel> {
    return apiClient.get<Tunnel>(`/tunnels/${id}`);
  },

  async createTunnel(data: CreateTunnelInput): Promise<Tunnel> {
    return apiClient.post<Tunnel>('/tunnels', data);
  },

  async deleteTunnel(id: string): Promise<void> {
    await apiClient.delete(`/tunnels/${id}`);
  },

  async listIngressRules(tunnelId: string): Promise<IngressRule[]> {
    return apiClient.get<IngressRule[]>(`/tunnels/${tunnelId}/ingress`);
  },

  async addIngressRule(tunnelId: string, data: AddIngressRuleInput): Promise<IngressRule> {
    return apiClient.post<IngressRule>(`/tunnels/${tunnelId}/ingress`, data);
  },

  async removeIngressRule(tunnelId: string, hostname: string): Promise<void> {
    await apiClient.delete(`/tunnels/${tunnelId}/ingress/${hostname}`);
  },

  async updateTunnelConfig(tunnelId: string, data: UpdateTunnelConfigInput): Promise<Tunnel> {
    return apiClient.put<Tunnel>(`/tunnels/${tunnelId}/config`, data);
  },

  async deployTunnel(tunnelId: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(`/tunnels/${tunnelId}/deploy`);
  },
};
