/**
 * Auth API
 */
import { apiClient } from './client';

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user' | 'readonly';
  avatar?: string | null;
  authProvider?: 'local' | 'oidc';
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

export interface CreateApiKeyResponse extends ApiKey {
  key: string; // Only returned on creation
}

export type AuthMode = 'local' | 'none' | 'oidc';

export interface OIDCAuthConfig {
  loginUrl: string;
  allowLocalLogin: boolean;
  logoutUrl: string | null;
}

export interface AuthConfig {
  mode: AuthMode;
  oidc?: OIDCAuthConfig;
}

export const authApi = {
  async getAuthConfig(): Promise<AuthConfig> {
    return apiClient.get<AuthConfig>('/auth/config');
  },

  async login(username: string, password: string): Promise<LoginResponse> {
    const result = await apiClient.post<LoginResponse>('/auth/login', {
      username,
      password,
    });
    apiClient.setToken(result.token);
    return result;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
    apiClient.setToken(null);
  },

  async getMe(): Promise<User> {
    return apiClient.get<User>('/auth/me');
  },

  async listApiKeys(): Promise<ApiKey[]> {
    return apiClient.get<ApiKey[]>('/auth/api-keys');
  },

  async createApiKey(data: {
    name: string;
    permissions: string[];
    expiresAt?: string;
  }): Promise<CreateApiKeyResponse> {
    return apiClient.post<CreateApiKeyResponse>('/auth/api-keys', data);
  },

  async deleteApiKey(id: string): Promise<void> {
    await apiClient.delete(`/auth/api-keys/${id}`);
  },

  async updateProfile(data: {
    email?: string;
    password?: string;
    avatar?: string | null;
  }): Promise<User> {
    return apiClient.put<User>('/auth/profile', data);
  },
};
