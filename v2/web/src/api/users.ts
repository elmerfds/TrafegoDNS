/**
 * Users API
 */
import { apiClient } from './client';

export type UserRole = 'admin' | 'user' | 'readonly';

export interface UserListItem {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UsersResponse {
  users: UserListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  email?: string;
  password?: string;
  role?: UserRole;
}

export const usersApi = {
  async listUsers(page: number = 1, limit: number = 50): Promise<UsersResponse> {
    const response = await apiClient.get<{ success: boolean; data: UsersResponse }>(
      `/users?page=${page}&limit=${limit}`
    );
    return response.data;
  },

  async getUser(id: string): Promise<UserListItem> {
    const response = await apiClient.get<{ success: boolean; data: UserListItem }>(`/users/${id}`);
    return response.data;
  },

  async createUser(data: CreateUserInput): Promise<UserListItem> {
    const response = await apiClient.post<{ success: boolean; data: UserListItem }>('/users', data);
    return response.data;
  },

  async updateUser(id: string, data: UpdateUserInput): Promise<UserListItem> {
    const response = await apiClient.put<{ success: boolean; data: UserListItem }>(`/users/${id}`, data);
    return response.data;
  },

  async deleteUser(id: string): Promise<void> {
    await apiClient.delete(`/users/${id}`);
  },
};
