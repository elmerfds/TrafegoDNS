/**
 * Auth Store
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, apiClient, type User, type AuthMode, type OIDCAuthConfig } from '../api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  authMode: AuthMode;
  authModeLoaded: boolean;
  oidcConfig: OIDCAuthConfig | null;

  login: (username: string, password: string) => Promise<void>;
  loginWithOIDC: (returnTo?: string) => void;
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
      oidcConfig: null,

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
              oidcConfig: null,
              user: {
                id: 'anonymous',
                username: 'anonymous',
                email: 'anonymous@trafegodns.local',
                role: 'admin',
              },
            });
          } else if (config.mode === 'oidc') {
            set({
              authMode: config.mode,
              authModeLoaded: true,
              oidcConfig: config.oidc ?? null,
            });
          } else {
            set({ authMode: config.mode, authModeLoaded: true, oidcConfig: null });
          }
        } catch {
          // If fetch fails, assume local auth (safe default)
          set({ authMode: 'local', authModeLoaded: true, oidcConfig: null });
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

      loginWithOIDC: (returnTo?: string) => {
        const { oidcConfig } = get();
        if (!oidcConfig) return;
        const url = returnTo
          ? `${oidcConfig.loginUrl}?returnTo=${encodeURIComponent(returnTo)}`
          : oidcConfig.loginUrl;
        window.location.href = url;
      },

      logout: async () => {
        const { oidcConfig } = get();
        // Clear state immediately so UI redirects to login without flash
        set({ user: null, isAuthenticated: false });
        window.dispatchEvent(new CustomEvent('auth:logout'));
        try {
          await authApi.logout();
        } catch { /* ignore — cookie may already be cleared */ }
        // Redirect to OIDC logout if configured
        if (oidcConfig?.logoutUrl) {
          window.location.href = oidcConfig.logoutUrl;
        }
      },

      checkAuth: async () => {
        // For OIDC: always try to verify — cookie may have been set by callback redirect
        // For local: only verify if we think we're authenticated
        const { isAuthenticated, authMode } = get();
        if (authMode !== 'oidc' && !isAuthenticated) return;

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
