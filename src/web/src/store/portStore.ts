/**
 * Port Management Store
 * Centralized state management for port monitoring using Zustand
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  Port,
  PortAlert,
  PortScan,
  PortReservation,
  PortStatistics,
  Server,
  PortFilters,
  AlertFilters,
  ScanFilters,
  ReservationFilters,
  PaginatedResponse,
  ApiResponse
} from '../types/port';
import { api } from '../lib/api';

// Store state interface
interface PortState {
  // Data state
  ports: Port[];
  alerts: PortAlert[];
  scans: PortScan[];
  reservations: PortReservation[];
  servers: Server[];
  statistics: PortStatistics | null;

  // UI state
  selectedPort: Port | null;
  selectedServer: string | null;
  filters: {
    ports: PortFilters;
    alerts: AlertFilters;
    scans: ScanFilters;
    reservations: ReservationFilters;
  };
  
  // Loading states
  loading: {
    ports: boolean;
    alerts: boolean;
    scans: boolean;
    reservations: boolean;
    servers: boolean;
    statistics: boolean;
  };

  // Error states
  errors: {
    ports: string | null;
    alerts: string | null;
    scans: string | null;
    reservations: string | null;
    servers: string | null;
    statistics: string | null;
  };

  // Pagination state
  pagination: {
    ports: { page: number; limit: number; total: number; pages: number };
    alerts: { page: number; limit: number; total: number; pages: number };
    scans: { page: number; limit: number; total: number; pages: number };
    reservations: { page: number; limit: number; total: number; pages: number };
  };

  // Cache timestamps for invalidation
  lastUpdated: {
    ports: number;
    alerts: number;
    scans: number;
    reservations: number;
    servers: number;
    statistics: number;
  };
}

// Store actions interface
interface PortActions {
  // Port actions
  fetchPorts: (filters?: PortFilters) => Promise<void>;
  fetchPortById: (id: string) => Promise<Port | null>;
  updatePortFilters: (filters: Partial<PortFilters>) => void;
  clearPortFilters: () => void;
  setSelectedPort: (port: Port | null) => void;

  // Alert actions
  fetchAlerts: (filters?: AlertFilters) => Promise<void>;
  acknowledgeAlert: (alertId: string) => Promise<void>;
  resolveAlert: (alertId: string) => Promise<void>;
  updateAlertFilters: (filters: Partial<AlertFilters>) => void;

  // Scan actions
  fetchScans: (filters?: ScanFilters) => Promise<void>;
  startPortScan: (scanRequest: { 
    server_id?: string; 
    startPort: number; 
    endPort: number; 
    protocol: 'tcp' | 'udp' | 'both';
  }) => Promise<PortScan>;
  cancelScan: (scanId: string) => Promise<void>;
  updateScanFilters: (filters: Partial<ScanFilters>) => void;

  // Reservation actions
  fetchReservations: (filters?: ReservationFilters) => Promise<void>;
  createReservation: (reservation: {
    ports: number[];
    container_id: string;
    protocol: 'tcp' | 'udp' | 'both';
    duration?: number;
    server?: string;
    metadata?: Record<string, any>;
  }) => Promise<PortReservation>;
  releaseReservation: (reservationId: string) => Promise<void>;
  updateReservationFilters: (filters: Partial<ReservationFilters>) => void;

  // Server actions
  fetchServers: () => Promise<void>;
  setSelectedServer: (serverId: string | null) => void;

  // Statistics actions
  fetchStatistics: () => Promise<void>;

  // Port suggestions
  suggestAlternativePorts: (options: {
    ports: number[];
    protocol?: string;
    serviceType?: string;
    maxSuggestions?: number;
  }) => Promise<void>;

  // Utility actions
  refreshAll: () => Promise<void>;
  clearErrors: () => void;
  resetInitializationErrors: () => void;
  resetState: () => void;

  // Real-time updates
  handlePortUpdate: (port: Port) => void;
  handleAlertUpdate: (alert: PortAlert) => void;
  handleScanUpdate: (scan: PortScan) => void;
  handleReservationUpdate: (reservation: PortReservation) => void;
}

// Combined store interface
type PortStore = PortState & PortActions;

// Default state
const defaultState: PortState = {
  // Data state
  ports: [],
  alerts: [],
  scans: [],
  reservations: [],
  servers: [],
  statistics: null,

  // UI state
  selectedPort: null,
  selectedServer: null,
  filters: {
    ports: { page: 1, limit: 20 },
    alerts: { page: 1, limit: 20 },
    scans: { page: 1, limit: 20 },
    reservations: { page: 1, limit: 20 }
  },

  // Loading states
  loading: {
    ports: false,
    alerts: false,
    scans: false,
    reservations: false,
    servers: false,
    statistics: false
  },

  // Error states
  errors: {
    ports: null,
    alerts: null,
    scans: null,
    reservations: null,
    servers: null,
    statistics: null
  },

  // Pagination state
  pagination: {
    ports: { page: 1, limit: 20, total: 0, pages: 0 },
    alerts: { page: 1, limit: 20, total: 0, pages: 0 },
    scans: { page: 1, limit: 20, total: 0, pages: 0 },
    reservations: { page: 1, limit: 20, total: 0, pages: 0 }
  },

  // Cache timestamps
  lastUpdated: {
    ports: 0,
    alerts: 0,
    scans: 0,
    reservations: 0,
    servers: 0,
    statistics: 0
  }
};

// Create the store
export const usePortStore = create<PortStore>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...defaultState,

        // Port actions
        fetchPorts: async (filters?: PortFilters) => {
          const currentState = get();
          
          // Skip if port monitor is not initialized to avoid spam
          if (currentState.errors.ports === 'Port monitor not initialized') {
            return;
          }

          set(state => {
            state.loading.ports = true;
            state.errors.ports = null;
          });

          try {
            const queryParams = { ...get().filters.ports, ...filters };
            const response = await api.get<ApiResponse<PaginatedResponse<Port>>>('/ports/in-use', {
              params: queryParams
            });

            set(state => {
              state.ports = response.data?.data?.items || [];
              state.pagination.ports = response.data?.data?.pagination || { page: 1, limit: 20, total: 0, pages: 0 };
              state.lastUpdated.ports = Date.now();
              state.loading.ports = false;
            });
          } catch (error: any) {
            const errorMessage = error.response?.data?.message || 'Failed to fetch ports';
            set(state => {
              state.errors.ports = errorMessage;
              state.loading.ports = false;
            });
            
            // Don't retry if port monitor is not initialized
            if (errorMessage.includes('Port monitor not initialized')) {
              console.warn('Port monitor not initialized - stopping ports polling');
            }
          }
        },

        fetchPortById: async (id: string) => {
          try {
            const response = await api.get<ApiResponse<Port>>(`/ports/${id}`);
            return response.data.data;
          } catch (error: any) {
            console.error('Failed to fetch port:', error);
            return null;
          }
        },

        updatePortFilters: (filters: Partial<PortFilters>) => {
          set(state => {
            state.filters.ports = { ...state.filters.ports, ...filters };
          });
        },

        clearPortFilters: () => {
          set(state => {
            state.filters.ports = { page: 1, limit: 20 };
          });
        },

        setSelectedPort: (port: Port | null) => {
          set(state => {
            state.selectedPort = port;
          });
        },

        // Alert actions
        fetchAlerts: async (filters?: AlertFilters) => {
          set(state => {
            state.loading.alerts = true;
            state.errors.alerts = null;
          });

          try {
            const queryParams = { ...get().filters.alerts, ...filters };
            const response = await api.get<ApiResponse<PaginatedResponse<PortAlert>>>('/ports/alerts', {
              params: queryParams
            });

            set(state => {
              state.alerts = response.data?.data?.items || [];
              state.pagination.alerts = response.data?.data?.pagination || { page: 1, limit: 20, total: 0, pages: 0 };
              state.lastUpdated.alerts = Date.now();
              state.loading.alerts = false;
            });
          } catch (error: any) {
            set(state => {
              state.errors.alerts = error.response?.data?.message || 'Failed to fetch alerts';
              state.loading.alerts = false;
            });
          }
        },

        acknowledgeAlert: async (alertId: string) => {
          try {
            await api.post(`/ports/alerts/${alertId}/acknowledge`);
            
            // Update the alert in the state
            set(state => {
              const alert = (state.alerts || []).find((a: PortAlert) => a.id === alertId);
              if (alert) {
                alert.acknowledged = true;
                alert.acknowledged_at = new Date().toISOString();
              }
            });
          } catch (error: any) {
            set(state => {
              state.errors.alerts = error.response?.data?.message || 'Failed to acknowledge alert';
            });
          }
        },

        resolveAlert: async (alertId: string) => {
          try {
            await api.post(`/ports/alerts/${alertId}/resolve`);
            
            // Update the alert in the state
            set(state => {
              const alert = (state.alerts || []).find((a: PortAlert) => a.id === alertId);
              if (alert) {
                alert.resolved = true;
                alert.resolved_at = new Date().toISOString();
              }
            });
          } catch (error: any) {
            set(state => {
              state.errors.alerts = error.response?.data?.message || 'Failed to resolve alert';
            });
          }
        },

        updateAlertFilters: (filters: Partial<AlertFilters>) => {
          set(state => {
            state.filters.alerts = { ...state.filters.alerts, ...filters };
          });
        },

        // Scan actions
        fetchScans: async (filters?: ScanFilters) => {
          set(state => {
            state.loading.scans = true;
            state.errors.scans = null;
          });

          try {
            const queryParams = { ...get().filters.scans, ...filters };
            const response = await api.get<ApiResponse<PaginatedResponse<PortScan>>>('/ports/scans', {
              params: queryParams
            });

            set(state => {
              state.scans = response.data?.data?.items || [];
              state.pagination.scans = response.data?.data?.pagination || { page: 1, limit: 20, total: 0, pages: 0 };
              state.lastUpdated.scans = Date.now();
              state.loading.scans = false;
            });
          } catch (error: any) {
            set(state => {
              state.errors.scans = error.response?.data?.message || 'Failed to fetch scans';
              state.loading.scans = false;
            });
          }
        },

        startPortScan: async (scanRequest) => {
          try {
            const response = await api.post<ApiResponse<PortScan>>('/ports/scan-range', scanRequest);
            
            // Add the new scan to the state
            set(state => {
              state.scans.unshift(response.data.data);
            });

            return response.data.data;
          } catch (error: any) {
            set(state => {
              state.errors.scans = error.response?.data?.message || 'Failed to start port scan';
            });
            throw error;
          }
        },

        cancelScan: async (scanId: string) => {
          try {
            await api.post(`/ports/scans/${scanId}/cancel`);
            
            // Update the scan status in the state
            set(state => {
              const scan = (state.scans || []).find((s: PortScan) => s.id === scanId);
              if (scan) {
                scan.status = 'cancelled';
              }
            });
          } catch (error: any) {
            set(state => {
              state.errors.scans = error.response?.data?.message || 'Failed to cancel scan';
            });
          }
        },

        updateScanFilters: (filters: Partial<ScanFilters>) => {
          set(state => {
            state.filters.scans = { ...state.filters.scans, ...filters };
          });
        },

        // Reservation actions
        fetchReservations: async (filters?: ReservationFilters) => {
          const currentState = get();
          
          // Skip if port monitor is not initialized to avoid spam
          if (currentState.errors.reservations === 'Port monitor not initialized') {
            return;
          }

          set(state => {
            state.loading.reservations = true;
            state.errors.reservations = null;
          });

          try {
            const queryParams = { ...get().filters.reservations, ...filters };
            const response = await api.get<ApiResponse<PaginatedResponse<PortReservation>>>('/ports/reservations', {
              params: queryParams
            });

            set(state => {
              state.reservations = response.data?.data?.items || [];
              state.pagination.reservations = response.data?.data?.pagination || { page: 1, limit: 20, total: 0, pages: 0 };
              state.lastUpdated.reservations = Date.now();
              state.loading.reservations = false;
            });
          } catch (error: any) {
            const errorMessage = error.response?.data?.message || 'Failed to fetch reservations';
            set(state => {
              state.errors.reservations = errorMessage;
              state.loading.reservations = false;
            });
            
            // Don't retry if port monitor is not initialized
            if (errorMessage.includes('Port monitor not initialized')) {
              console.warn('Port monitor not initialized - stopping reservations polling');
            }
          }
        },

        createReservation: async (reservationData) => {
          try {
            const response = await api.post<ApiResponse<PortReservation>>('/ports/reserve', reservationData);
            
            // Add the new reservation to the state
            set(state => {
              state.reservations.unshift(response.data.data);
            });

            return response.data.data;
          } catch (error: any) {
            set(state => {
              state.errors.reservations = error.response?.data?.message || 'Failed to create reservation';
            });
            throw error;
          }
        },

        releaseReservation: async (reservationId: string) => {
          try {
            await api.delete(`/ports/reservations/${reservationId}`);
            
            // Update the reservation status in the state
            set(state => {
              const reservation = (state.reservations || []).find((r: PortReservation) => r.id === reservationId);
              if (reservation) {
                reservation.status = 'released';
                reservation.released_at = new Date().toISOString();
              }
            });
          } catch (error: any) {
            set(state => {
              state.errors.reservations = error.response?.data?.message || 'Failed to release reservation';
            });
          }
        },

        updateReservationFilters: (filters: Partial<ReservationFilters>) => {
          set(state => {
            state.filters.reservations = { ...state.filters.reservations, ...filters };
          });
        },

        // Server actions
        fetchServers: async () => {
          set(state => {
            state.loading.servers = true;
            state.errors.servers = null;
          });

          try {
            const response = await api.get<ApiResponse<Server[]>>('/servers');

            set(state => {
              state.servers = response.data?.data || [];
              state.lastUpdated.servers = Date.now();
              state.loading.servers = false;
            });
          } catch (error: any) {
            set(state => {
              state.errors.servers = error.response?.data?.message || 'Failed to fetch servers';
              state.loading.servers = false;
            });
          }
        },

        setSelectedServer: (serverId: string | null) => {
          set(state => {
            state.selectedServer = serverId;
          });
        },

        // Statistics actions
        fetchStatistics: async () => {
          const currentState = get();
          
          // Skip if port monitor is not initialized to avoid spam
          if (currentState.errors.statistics === 'Port monitor not initialized') {
            return;
          }

          set(state => {
            state.loading.statistics = true;
            state.errors.statistics = null;
          });

          try {
            const response = await api.get<ApiResponse<PortStatistics>>('/ports/statistics');

            set(state => {
              state.statistics = response.data?.data || null;
              state.lastUpdated.statistics = Date.now();
              state.loading.statistics = false;
            });
          } catch (error: any) {
            const errorMessage = error.response?.data?.message || 'Failed to fetch statistics';
            set(state => {
              state.errors.statistics = errorMessage;
              state.loading.statistics = false;
            });
            
            // Don't retry if port monitor is not initialized
            if (errorMessage.includes('Port monitor not initialized')) {
              console.warn('Port monitor not initialized - stopping statistics polling');
            }
          }
        },

        // Utility actions
        refreshAll: async () => {
          const state = get();
          await Promise.all([
            state.fetchPorts(),
            state.fetchAlerts(),
            state.fetchScans(),
            state.fetchReservations(),
            state.fetchServers(),
            state.fetchStatistics()
          ]);
        },

        // Port suggestions
        suggestAlternativePorts: async (options) => {
          try {
            const response = await api.post<ApiResponse<any>>('/ports/suggest-alternatives', options);
            // For now, just log the suggestions. In a full implementation,
            // you might want to store these in the state
            console.log('Port suggestions:', response.data.data);
          } catch (error: any) {
            console.error('Failed to get port suggestions:', error);
          }
        },

        clearErrors: () => {
          set(state => {
            state.errors = {
              ports: null,
              alerts: null,
              scans: null,
              reservations: null,
              servers: null,
              statistics: null
            };
          });
        },

        // Reset initialization errors to allow retrying
        resetInitializationErrors: () => {
          set(state => {
            Object.keys(state.errors).forEach(key => {
              if (state.errors[key as keyof typeof state.errors] === 'Port monitor not initialized') {
                state.errors[key as keyof typeof state.errors] = null;
              }
            });
          });
        },

        resetState: () => {
          set(defaultState);
        },

        // Real-time update handlers
        handlePortUpdate: (port: Port) => {
          set(state => {
            if (!state.ports) state.ports = [];
            const index = state.ports.findIndex((p: Port) => p.id === port.id);
            if (index >= 0) {
              state.ports[index] = port;
            } else {
              state.ports.unshift(port);
            }
          });
        },

        handleAlertUpdate: (alert: PortAlert) => {
          set(state => {
            if (!state.alerts) state.alerts = [];
            const index = state.alerts.findIndex((a: PortAlert) => a.id === alert.id);
            if (index >= 0) {
              state.alerts[index] = alert;
            } else {
              state.alerts.unshift(alert);
            }
          });
        },

        handleScanUpdate: (scan: PortScan) => {
          set(state => {
            if (!state.scans) state.scans = [];
            const index = state.scans.findIndex((s: PortScan) => s.id === scan.id);
            if (index >= 0) {
              state.scans[index] = scan;
            } else {
              state.scans.unshift(scan);
            }
          });
        },

        handleReservationUpdate: (reservation: PortReservation) => {
          set(state => {
            if (!state.reservations) state.reservations = [];
            const index = state.reservations.findIndex((r: PortReservation) => r.id === reservation.id);
            if (index >= 0) {
              state.reservations[index] = reservation;
            } else {
              state.reservations.unshift(reservation);
            }
          });
        }
      })),
      {
        name: 'port-store',
        partialize: (state) => ({
          // Only persist UI preferences and filters
          selectedServer: state.selectedServer,
          filters: state.filters
        })
      }
    ),
    {
      name: 'port-store'
    }
  )
);

// Selector hooks for commonly used state slices
export const usePortsData = () => usePortStore(state => ({
  ports: state.ports,
  loading: state.loading.ports,
  error: state.errors.ports,
  pagination: state.pagination.ports,
  filters: state.filters.ports
}));

export const useAlertsData = () => usePortStore(state => ({
  alerts: state.alerts,
  loading: state.loading.alerts,
  error: state.errors.alerts,
  pagination: state.pagination.alerts,
  filters: state.filters.alerts
}));

export const useScansData = () => usePortStore(state => ({
  scans: state.scans,
  loading: state.loading.scans,
  error: state.errors.scans,
  pagination: state.pagination.scans,
  filters: state.filters.scans
}));

export const useReservationsData = () => usePortStore(state => ({
  reservations: state.reservations,
  loading: state.loading.reservations,
  error: state.errors.reservations,
  pagination: state.pagination.reservations,
  filters: state.filters.reservations
}));

export const useServersData = () => usePortStore(state => ({
  servers: state.servers,
  selectedServer: state.selectedServer,
  loading: state.loading.servers,
  error: state.errors.servers
}));

export const usePortStatistics = () => usePortStore(state => ({
  statistics: state.statistics,
  loading: state.loading.statistics,
  error: state.errors.statistics
}));