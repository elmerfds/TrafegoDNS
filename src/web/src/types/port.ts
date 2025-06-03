export interface Port {
  id: number;
  host: string;
  port: number;
  protocol: 'tcp' | 'udp';
  status: 'open' | 'closed' | 'filtered' | 'unknown';
  service_name?: string;
  service?: string; // Alternative service name field
  service_version?: string;
  description?: string;
  labels: Record<string, string>;
  container_id?: string;
  container_name?: string;
  first_seen: string;
  last_seen: string;
  created_at: string;
  updated_at: string;
  unread_alerts?: number;
  alerts?: PortAlert[];
  source?: string; // Source of the port information (e.g., 'system', 'docker', 'manual')
}

export interface PortAlert {
  id: number;
  port_id: number;
  alert_type: 'suspicious_port' | 'risky_service' | 'unexpected_open' | 'vulnerable_version' | 'compromise_indicator';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  created_at: string;
  host: string;
  port: number;
  protocol: string;
  service_name?: string;
}

export interface PortScan {
  id: number;
  host: string;
  scan_type: 'local' | 'remote' | 'container' | 'manual' | 'scheduled';
  ports_discovered: number;
  ports_changed: number;
  scan_duration?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  error_message?: string;
  started_at: string;
  completed_at?: string;
  created_by: string;
  metadata: Record<string, any>;
  changes_detected?: number;
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
  host: string;
  port_range?: string;
  protocols?: ('tcp' | 'udp')[];
  scan_type?: string;
}

export interface PortFilters {
  host?: string;
  status?: string;
  protocol?: string;
  container_id?: string;
  service_name?: string;
  port_range?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface AlertFilters {
  port_id?: number;
  alert_type?: string;
  severity?: string;
  acknowledged?: boolean;
  host?: string;
  page?: number;
  limit?: number;
}

export interface ScanFilters {
  host?: string;
  scan_type?: string;
  status?: string;
  created_by?: string;
  page?: number;
  limit?: number;
}