import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Progress } from '../components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { 
  Search, 
  Shield, 
  Activity, 
  AlertTriangle, 
  Clock, 
  Server, 
  Eye,
  Download,
  Play,
  RefreshCw,
  X
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../hooks/use-toast';
import type { 
  Port, 
  PortAlert, 
  PortScan, 
  PortStatistics, 
  PortFilters, 
  AlertFilters,
  ScanFilters,
  PortScanRequest 
} from '../types/port';

export default function PortMonitoring() {
  const [activeTab, setActiveTab] = useState('overview');
  const [ports, setPorts] = useState<Port[]>([]);
  const [alerts, setAlerts] = useState<PortAlert[]>([]);
  const [scans, setScans] = useState<PortScan[]>([]);
  const [statistics, setStatistics] = useState<PortStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [portFilters, setPortFilters] = useState<PortFilters>({ page: 1, limit: 50 });
  const [alertFilters, setAlertFilters] = useState<AlertFilters>({ page: 1, limit: 20 });
  const [scanFilters, setScanFilters] = useState<ScanFilters>({ page: 1, limit: 20 });
  
  // Scan dialog
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanRequest, setScanRequest] = useState<PortScanRequest>({ host: '', port_range: '1-1000' });
  const [scanning, setScanning] = useState(false);
  
  // Search states
  const [searchTerm, setSearchTerm] = useState('');
  
  const { toast } = useToast();

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === 'ports') {
      loadPorts();
    } else if (activeTab === 'alerts') {
      loadAlerts();
    } else if (activeTab === 'scans') {
      loadScans();
    }
  }, [activeTab, portFilters, alertFilters, scanFilters]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const stats = await api.get('/api/v1/ports/statistics');
      setStatistics(stats.data);
      
      // Load recent alerts
      const recentAlerts = await api.get('/api/v1/ports/alerts', {
        params: { limit: 5, acknowledged: false }
      });
      setAlerts(recentAlerts.data.data || []);
      
    } catch (err) {
      console.error('Error loading initial data:', err);
      setError('Failed to load port monitoring data');
    } finally {
      setLoading(false);
    }
  };

  const loadPorts = async () => {
    try {
      const response = await api.get('/api/v1/ports', { params: portFilters });
      setPorts(response.data.data || []);
    } catch (err) {
      console.error('Error loading ports:', err);
      toast({
        title: "Error",
        description: "Failed to load ports",
        variant: "destructive"
      });
    }
  };

  const loadAlerts = async () => {
    try {
      const response = await api.get('/api/v1/ports/alerts', { params: alertFilters });
      setAlerts(response.data.data || []);
    } catch (err) {
      console.error('Error loading alerts:', err);
      toast({
        title: "Error",
        description: "Failed to load alerts",
        variant: "destructive"
      });
    }
  };

  const loadScans = async () => {
    try {
      const response = await api.get('/api/v1/ports/scans', { params: scanFilters });
      setScans(response.data.data || []);
    } catch (err) {
      console.error('Error loading scans:', err);
      toast({
        title: "Error",
        description: "Failed to load scans",
        variant: "destructive"
      });
    }
  };

  const handleScan = async () => {
    if (!scanRequest.host) {
      toast({
        title: "Error",
        description: "Host is required",
        variant: "destructive"
      });
      return;
    }

    try {
      setScanning(true);
      await api.post('/api/v1/ports/scan', scanRequest);
      
      toast({
        title: "Success",
        description: `Port scan initiated for ${scanRequest.host}`,
      });
      
      setShowScanDialog(false);
      setScanRequest({ host: '', port_range: '1-1000' });
      
      // Refresh scans if on scans tab
      if (activeTab === 'scans') {
        setTimeout(loadScans, 1000);
      }
      
    } catch (err) {
      console.error('Error starting scan:', err);
      toast({
        title: "Error",
        description: "Failed to start port scan",
        variant: "destructive"
      });
    } finally {
      setScanning(false);
    }
  };

  const acknowledgeAlert = async (alertId: number) => {
    try {
      await api.put(`/api/v1/ports/alerts/${alertId}/acknowledge`);
      
      toast({
        title: "Success",
        description: "Alert acknowledged",
      });
      
      // Refresh alerts
      loadAlerts();
      loadInitialData(); // Refresh statistics
      
    } catch (err) {
      console.error('Error acknowledging alert:', err);
      toast({
        title: "Error",
        description: "Failed to acknowledge alert",
        variant: "destructive"
      });
    }
  };

  const exportPorts = async (format: 'json' | 'csv' = 'json') => {
    try {
      const response = await api.get('/api/v1/ports/export', {
        params: { format, ...portFilters },
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ports.${format}`;
      link.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: `Port data exported as ${format.toUpperCase()}`,
      });
      
    } catch (err) {
      console.error('Error exporting ports:', err);
      toast({
        title: "Error",
        description: "Failed to export port data",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      open: 'bg-green-100 text-green-800',
      closed: 'bg-red-100 text-red-800',
      filtered: 'bg-yellow-100 text-yellow-800',
      unknown: 'bg-gray-100 text-gray-800'
    };
    return <Badge className={colors[status as keyof typeof colors] || colors.unknown}>{status}</Badge>;
  };

  const getSeverityBadge = (severity: string) => {
    const colors = {
      low: 'bg-blue-100 text-blue-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800'
    };
    return <Badge className={colors[severity as keyof typeof colors] || colors.low}>{severity}</Badge>;
  };

  const getScanStatusBadge = (status: string) => {
    const colors = {
      running: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800'
    };
    return <Badge className={colors[status as keyof typeof colors] || colors.running}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading port monitoring...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Port Monitoring</h1>
          <p className="text-muted-foreground">Monitor and manage network ports across your infrastructure</p>
        </div>
        <Button onClick={() => setShowScanDialog(true)}>
          <Play className="h-4 w-4 mr-2" />
          New Scan
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ports">Ports</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="scans">Scans</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Statistics Cards */}
          {statistics && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Ports</CardTitle>
                  <Server className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {Object.values(statistics.ports.byStatus).reduce((a, b) => a + b, 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {statistics.ports.byStatus.open || 0} open, {statistics.ports.byStatus.closed || 0} closed
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{statistics.alerts.unacknowledged}</div>
                  <p className="text-xs text-muted-foreground">
                    {statistics.alerts.bySeverity.critical || 0} critical, {statistics.alerts.bySeverity.high || 0} high
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recent Scans</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{statistics.scans.recentScans}</div>
                  <p className="text-xs text-muted-foreground">
                    Avg: {Math.round(statistics.scans.averageDuration / 1000)}s duration
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{statistics.ports.recentActivity}</div>
                  <p className="text-xs text-muted-foreground">Port changes (24h)</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Recent Alerts */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Security Alerts</CardTitle>
              <CardDescription>Latest security alerts requiring attention</CardDescription>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No recent alerts</p>
              ) : (
                <div className="space-y-2">
                  {alerts.slice(0, 5).map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center space-x-3">
                        <Shield className="h-4 w-4 text-orange-500" />
                        <div>
                          <p className="font-medium">{alert.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {alert.host}:{alert.port} - {alert.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getSeverityBadge(alert.severity)}
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => acknowledgeAlert(alert.id)}
                        >
                          Acknowledge
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Services and Hosts */}
          {statistics && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Services</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {statistics.ports.topServices.slice(0, 5).map((service, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="font-medium">{service.service_name || 'Unknown'}</span>
                        <Badge variant="secondary">{service.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Hosts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {statistics.ports.topHosts.slice(0, 5).map((host, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="font-medium">{host.host}</span>
                        <Badge variant="secondary">{host.port_count} ports</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="ports" className="space-y-4">
          {/* Filters and Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search ports..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
              <Select
                value={portFilters.status || 'all'}
                onValueChange={(value) => setPortFilters({ ...portFilters, status: value === 'all' ? undefined : value })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="filtered">Filtered</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={portFilters.protocol || 'all'}
                onValueChange={(value) => setPortFilters({ ...portFilters, protocol: value === 'all' ? undefined : value })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Protocol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Protocols</SelectItem>
                  <SelectItem value="tcp">TCP</SelectItem>
                  <SelectItem value="udp">UDP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={() => exportPorts('csv')}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportPorts('json')}>
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
            </div>
          </div>

          {/* Ports Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Host</TableHead>
                    <TableHead>Port</TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Alerts</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ports.map((port) => (
                    <TableRow key={port.id}>
                      <TableCell className="font-medium">{port.host}</TableCell>
                      <TableCell>{port.port}</TableCell>
                      <TableCell>{port.protocol.toUpperCase()}</TableCell>
                      <TableCell>{getStatusBadge(port.status)}</TableCell>
                      <TableCell>
                        {port.service_name ? (
                          <div>
                            <div className="font-medium">{port.service_name}</div>
                            {port.service_version && (
                              <div className="text-sm text-muted-foreground">{port.service_version}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {port.unread_alerts ? (
                          <Badge variant="destructive">{port.unread_alerts}</Badge>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(port.last_seen).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          {/* Alert Filters */}
          <div className="flex items-center space-x-2">
            <Select
              value={alertFilters.severity || 'all'}
              onValueChange={(value) => setAlertFilters({ ...alertFilters, severity: value === 'all' ? undefined : value })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={alertFilters.acknowledged?.toString() || 'all'}
              onValueChange={(value) => setAlertFilters({ 
                ...alertFilters, 
                acknowledged: value === 'all' ? undefined : value === 'true' 
              })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Alerts</SelectItem>
                <SelectItem value="false">Unacknowledged</SelectItem>
                <SelectItem value="true">Acknowledged</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Alerts Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Alert</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Host:Port</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{alert.title}</div>
                          <div className="text-sm text-muted-foreground">{alert.description}</div>
                        </div>
                      </TableCell>
                      <TableCell>{getSeverityBadge(alert.severity)}</TableCell>
                      <TableCell className="font-mono">
                        {alert.host}:{alert.port}
                      </TableCell>
                      <TableCell>{alert.alert_type.replace('_', ' ')}</TableCell>
                      <TableCell>
                        {new Date(alert.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {alert.acknowledged ? (
                          <Badge variant="secondary">Acknowledged</Badge>
                        ) : (
                          <Badge variant="destructive">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!alert.acknowledged && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            Acknowledge
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scans" className="space-y-4">
          {/* Scan Filters */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Select
                value={scanFilters.status || 'all'}
                onValueChange={(value) => setScanFilters({ ...scanFilters, status: value === 'all' ? undefined : value })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={scanFilters.scan_type || 'all'}
                onValueChange={(value) => setScanFilters({ ...scanFilters, scan_type: value === 'all' ? undefined : value })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="container">Container</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setShowScanDialog(true)}>
              <Play className="h-4 w-4 mr-2" />
              New Scan
            </Button>
          </div>

          {/* Scans Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Host</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ports Found</TableHead>
                    <TableHead>Changes</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scans.map((scan) => (
                    <TableRow key={scan.id}>
                      <TableCell className="font-medium">{scan.host}</TableCell>
                      <TableCell>{scan.scan_type}</TableCell>
                      <TableCell>{getScanStatusBadge(scan.status)}</TableCell>
                      <TableCell>{scan.ports_discovered}</TableCell>
                      <TableCell>
                        {scan.ports_changed > 0 ? (
                          <Badge variant="outline">{scan.ports_changed}</Badge>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {scan.scan_duration ? `${Math.round(scan.scan_duration / 1000)}s` : '-'}
                      </TableCell>
                      <TableCell>
                        {new Date(scan.started_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{scan.created_by}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Scan Dialog */}
      <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Port Scan</DialogTitle>
            <DialogDescription>
              Configure and start a new port scan for a target host
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Target Host</label>
              <Input
                placeholder="e.g., 192.168.1.1 or example.com"
                value={scanRequest.host}
                onChange={(e) => setScanRequest({ ...scanRequest, host: e.target.value })}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Port Range</label>
              <Input
                placeholder="e.g., 1-1000 or 80,443,22"
                value={scanRequest.port_range}
                onChange={(e) => setScanRequest({ ...scanRequest, port_range: e.target.value })}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Protocols</label>
              <Select
                value={scanRequest.protocols?.join(',') || 'tcp'}
                onValueChange={(value) => setScanRequest({ 
                  ...scanRequest, 
                  protocols: value.split(',') as ('tcp' | 'udp')[]
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcp">TCP only</SelectItem>
                  <SelectItem value="udp">UDP only</SelectItem>
                  <SelectItem value="tcp,udp">TCP and UDP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScanDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleScan} disabled={scanning}>
              {scanning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Scan
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}