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
    // apiClient.get already extracts response.data.data
    return apiClient.get<UsersResponse>(`/users?page=${page}&limit=${limit}`);
  },

  async getUser(id: string): Promise<UserListItem> {
    return apiClient.get<UserListItem>(`/users/${id}`);
  },

  async createUser(data: CreateUserInput): Promise<UserListItem> {
    return apiClient.post<UserListItem>('/users', data);
  },

  async updateUser(id: string, data: UpdateUserInput): Promise<UserListItem> {
    return apiClient.put<UserListItem>(`/users/${id}`, data);
  },

  async deleteUser(id: string): Promise<void> {
    await apiClient.delete(`/users/${id}`);
  },

  // Update current user's own profile
  async updateProfile(data: { email?: string; password?: string }): Promise<UserListItem> {
    return apiClient.put<UserListItem>('/auth/profile', data);
  },
};
