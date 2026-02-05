/**
 * Main Application
 */
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
  redirect,
  Outlet,
} from '@tanstack/react-router';
import { useAuthStore } from './stores';
import { Layout } from './components/layout';
import {
  LoginPage,
  DashboardPage,
  DNSRecordsPage,
  ProvidersPage,
  TunnelsPage,
  WebhooksPage,
  SettingsPage,
  AuditLogPage,
  UsersPage,
  ProfilePage,
} from './pages';

// Create query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

// Auth check helper
const requireAuth = () => {
  const { isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) {
    throw redirect({ to: '/login' });
  }
};

const requireGuest = () => {
  const { isAuthenticated } = useAuthStore.getState();
  if (isAuthenticated) {
    throw redirect({ to: '/' });
  }
};

const requireAdmin = () => {
  const { isAuthenticated, user } = useAuthStore.getState();
  if (!isAuthenticated) {
    throw redirect({ to: '/login' });
  }
  if (user?.role !== 'admin') {
    throw redirect({ to: '/' });
  }
};

// Define routes
const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: requireGuest,
  component: LoginPage,
});

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'layout',
  beforeLoad: requireAuth,
  component: Layout,
});

const dashboardRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  component: DashboardPage,
});

const dnsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/dns',
  component: DNSRecordsPage,
});

const providersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/providers',
  component: ProvidersPage,
});

const tunnelsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/tunnels',
  component: TunnelsPage,
});

const webhooksRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/webhooks',
  component: WebhooksPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/settings',
  component: SettingsPage,
});

const auditRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/audit',
  component: AuditLogPage,
});

const usersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/users',
  beforeLoad: requireAdmin,
  component: UsersPage,
});

const profileRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/profile',
  component: ProfilePage,
});

// Create route tree
const routeTree = rootRoute.addChildren([
  loginRoute,
  layoutRoute.addChildren([
    dashboardRoute,
    dnsRoute,
    providersRoute,
    tunnelsRoute,
    webhooksRoute,
    settingsRoute,
    auditRoute,
    usersRoute,
    profileRoute,
  ]),
]);

// Create router
const router = createRouter({ routeTree });

// Type safety for router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Auth listener component
function AuthListener() {
  const { checkAuth, isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Check auth on mount
    if (isAuthenticated) {
      checkAuth();
    }

    // Listen for logout events
    const handleLogout = () => {
      router.navigate({ to: '/login' });
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, [checkAuth, isAuthenticated]);

  return null;
}

// Main App component
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthListener />
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default App;
