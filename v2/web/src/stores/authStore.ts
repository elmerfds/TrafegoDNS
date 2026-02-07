/**
 * Auth Store
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, apiClient, type User, type AuthMode } from '../api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  authMode: AuthMode;
  authModeLoaded: boolean;

  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  checkAuthMode: () => Promise<void>;
  updateUser: (user: User) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      authMode: 'local',
      authModeLoaded: false,

      checkAuthMode: async () => {
        try {
          const config = await authApi.getAuthConfig();
          if (config.mode === 'none') {
            // Auth disabled — auto-authenticate as anonymous admin
            apiClient.setAuthDisabled(true);
            set({
              authMode: config.mode,
              authModeLoaded: true,
              isAuthenticated: true,
              user: {
                id: 'anonymous',
                username: 'anonymous',
                email: 'anonymous@trafegodns.local',
                role: 'admin',
              },
            });
          } else {
            set({ authMode: config.mode, authModeLoaded: true });
          }
        } catch {
          // If fetch fails, assume local auth (safe default)
          set({ authMode: 'local', authModeLoaded: true });
        }
      },

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const result = await authApi.login(username, password);
          set({
            user: result.user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          set({
            user: null,
            isAuthenticated: false,
          });
        }
      },

      checkAuth: async () => {
        const { isAuthenticated } = get();
        if (!isAuthenticated) return;

        set({ isLoading: true });
        try {
          const user = await authApi.getMe();
          set({ user, isAuthenticated: true, isLoading: false });
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      updateUser: (user: User) => set({ user }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
