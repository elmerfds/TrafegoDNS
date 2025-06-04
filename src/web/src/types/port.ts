export interface Port {
  id: string; // Updated to string to match UUID format
  server_id: string; // New field from schema redesign
  port: number;
  protocol: 'tcp' | 'udp' | 'both';
  status: 'open' | 'closed' | 'filtered' | 'unknown' | 'listening';
  service_name?: string;
  service_version?: string;
  alternative_service_name?: string; // From updated schema
  source?: string; // Source of port information ('system', 'docker', 'manual')
  labels?: Record<string, string>; // Made optional to match schema
  container_id?: string;
  container_name?: string;
  description?: string; // Add description field
  first_detected: string; // Updated field name
  last_seen: string;
  scan_count?: number; // New field from schema
  metadata?: Record<string, any>; // New field from schema
  created_at: string;
  updated_at: string;
  unread_alerts?: number;
  alerts?: PortAlert[];
  
  // Server information (joined from servers table)
  server_name?: string;
  server_ip?: string;
}

export interface PortAlert {
  id: string; // Updated to string to match UUID format
  port_id?: string; // Made optional and updated to string
  server_id: string; // New field from schema redesign
  port: number;
  protocol: 'tcp' | 'udp' | 'both';
  alert_type: 'suspicious_port' | 'risky_service' | 'unexpected_open' | 'vulnerable_version' | 'compromise_indicator';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description?: string;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  resolved: boolean; // New field from schema
  resolved_at?: string; // New field from schema
  metadata?: Record<string, any>; // New field from schema
  created_at: string;
  updated_at: string;
}

export interface PortScan {
  id: string; // Updated to string to match UUID format
  server_id: string; // New field from schema redesign
  scan_type: 'manual' | 'scheduled' | 'automatic' | 'on-demand';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  host: string;
  port_range?: string;
  protocol: 'tcp' | 'udp' | 'both';
  ports_discovered: number;
  ports_changed: number;
  scan_duration?: number; // Duration in milliseconds
  started_at: string;
  completed_at?: string;
  created_by?: string;
  results?: Record<string, any>; // Scan results data
  error_message?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PortStatistics {
  ports: {
    byStatus: Record<string, number>;
    byProtocol: Record<string, number>;
    topServices: Array<{
      service_name: string;
      count: number;
    }>;
    topHosts: Array<{
      host: string;
      port_count: number;
    }>;
    recentActivity: number;
  };
  scans: {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    recentScans: number;
    averageDuration: number;
  };
  alerts: {
    total: number;
    unacknowledged: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    recent: number;
  };
}

export interface PortScanRequest {
  host?: string;
  server?: string;
  startPort: number;
  endPort: number;
  protocol: 'tcp' | 'udp' | 'both';
  timeout?: number;
  concurrency?: number;
  port_range?: string;
  protocols?: ('tcp' | 'udp')[];
  scan_type?: string;
}

export interface PortScanResult {
  results: Record<string, boolean>;
  summary: {
    totalPorts: number;
    availablePorts: number;
    unavailablePorts: number;
    availabilityPercentage: number;
  };
  metadata?: {
    startPort: number;
    endPort: number;
    protocol: string;
    server: string;
    timestamp: string;
  };
}

// New interfaces for updated schema
export interface Server {
  id: string;
  name: string;
  ip: string;
  description?: string;
  isHost: boolean;
  created_at: string;
  updated_at: string;
}

export interface PortReservation {
  id: string;
  port_id?: string;
  server_id: string;
  port: number;
  protocol: 'tcp' | 'udp' | 'both';
  container_id: string;
  container_name?: string;
  reserved_by?: string;
  reserved_at: string;
  expires_at?: string;
  released_at?: string;
  duration_seconds: number;
  status: 'active' | 'expired' | 'released' | 'cancelled';
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PortFilters {
  server?: string;
  status?: string;
  protocol?: string;
  container_id?: string;
  service_name?: string;
  service?: string;
  port_range?: string;
  search?: string; // Add search field
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface AlertFilters {
  port_id?: string;
  server_id?: string;
  alert_type?: string;
  severity?: string;
  acknowledged?: boolean;
  resolved?: boolean;
  page?: number;
  limit?: number;
}

export interface ScanFilters {
  server_id?: string;
  scan_type?: string;
  status?: string;
  created_by?: string;
  page?: number;
  limit?: number;
}

export interface ReservationFilters {
  container_id?: string;
  server_id?: string;
  status?: string;
  protocol?: string;
  page?: number;
  limit?: number;
}

// API Response interfaces
export interface ApiResponse<T> {
  success: boolean;
  status: string;
  message: string;
  data: T;
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
    [key: string]: any;
  };
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}