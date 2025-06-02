import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Progress } from './ui/progress';
import { AlertTriangle, CheckCircle, XCircle, Search, Settings, Activity, Wifi, WifiOff } from 'lucide-react';
import { useSocket } from '../hooks/useSocket';
import { api } from '../lib/api';

interface PortStatus {
  port: number;
  available: boolean;
  reserved: boolean;
  reservedBy?: string;
  reservedUntil?: string;
  protocol: string;
}

interface PortReservation {
  id: number;
  port: number;
  container_id: string;
  protocol: string;
  expires_at: string;
  metadata: Record<string, any>;
  created_at: string;
}

interface PortConflict {
  port: number;
  protocol: string;
  type: 'system_process' | 'reservation';
  description: string;
  severity: 'high' | 'medium' | 'low';
}

interface PortSuggestion {
  originalPort: number;
  alternatives: number[];
}

interface PortStatistics {
  totalMonitoredPorts: number;
  activeReservations: number;
  availablePortsInRange: number;
  conflictsDetected: number;
  lastScanTime: string;
  monitoringEnabled: boolean;
  portRanges: Array<{ start: number; end: number }>;
  excludedPorts: number[];
}

export default function PortMonitoring() {
  const [statistics, setStatistics] = useState<PortStatistics | null>(null);
  const [reservations, setReservations] = useState<PortReservation[]>([]);
  const [portCheckResults, setPortCheckResults] = useState<PortStatus[]>([]);
  const [portSuggestions, setPortSuggestions] = useState<PortSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [portsToCheck, setPortsToCheck] = useState('');
  const [protocol, setProtocol] = useState('tcp');
  const [scanStartPort, setScanStartPort] = useState('3000');
  const [scanEndPort, setScanEndPort] = useState('3100');
  const [serviceType, setServiceType] = useState('web');
  
  // Real-time updates
  const { socket, isConnected } = useSocket();
  
  useEffect(() => {
    loadStatistics();
    loadReservations();
  }, []);

  useEffect(() => {
    if (socket && isConnected) {
      // Subscribe to port monitoring events
      socket.emit('subscribe', 'port:changed');
      socket.emit('subscribe', 'port:reserved');
      socket.emit('subscribe', 'port:released');
      socket.emit('subscribe', 'port:conflict:detected');
      socket.emit('subscribe', 'port:scan:completed');

      socket.on('event', (event: any) => {
        handlePortEvent(event);
      });

      return () => {
        socket.off('event');
      };
    }
  }, [socket, isConnected]);

  const handlePortEvent = (event: any) => {
    const { type, data } = event;
    
    switch (type) {
      case 'port:changed':
      case 'port:reserved':
      case 'port:released':
        loadReservations();
        loadStatistics();
        break;
      case 'port:conflict:detected':
        setError(`Port conflict detected: ${data.description}`);
        break;
      case 'port:scan:completed':
        loadStatistics();
        break;
    }
  };

  const loadStatistics = async () => {
    try {
      const response = await api.get('/ports/statistics');
      setStatistics(response.data.data);
    } catch (error) {
      console.error('Failed to load port statistics:', error);
    }
  };

  const loadReservations = async () => {
    try {
      const response = await api.get('/ports/reservations');
      setReservations(response.data.data.reservations);
    } catch (error) {
      console.error('Failed to load port reservations:', error);
    }
  };

  const checkPortAvailability = async () => {
    if (!portsToCheck.trim()) {
      setError('Please enter ports to check');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ports = portsToCheck.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
      
      if (ports.length === 0) {
        setError('Please enter valid port numbers');
        return;
      }

      const response = await api.post('/ports/check-availability', {
        ports,
        protocol
      });

      setPortCheckResults(response.data.data.ports);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to check port availability');
    } finally {
      setLoading(false);
    }
  };

  const suggestAlternativePorts = async () => {
    if (!portsToCheck.trim()) {
      setError('Please enter ports to get suggestions for');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ports = portsToCheck.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
      
      const response = await api.post('/ports/suggest-alternatives', {
        ports,
        protocol,
        serviceType,
        maxSuggestions: 5
      });

      setPortSuggestions(response.data.data.suggestions);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to get port suggestions');
    } finally {
      setLoading(false);
    }
  };

  const scanPortRange = async () => {
    const start = parseInt(scanStartPort);
    const end = parseInt(scanEndPort);

    if (isNaN(start) || isNaN(end) || start >= end) {
      setError('Please enter a valid port range');
      return;
    }

    if (end - start > 1000) {
      setError('Port range too large (maximum 1000 ports)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/ports/scan-range', {
        startPort: start,
        endPort: end,
        protocol
      });

      const results = response.data.data.results;
      const availablePorts = Object.entries(results)
        .filter(([_, available]) => available)
        .map(([port, _]) => ({
          port: parseInt(port),
          available: true,
          reserved: false,
          protocol
        }));

      setPortCheckResults(availablePorts as PortStatus[]);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to scan port range');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (port: PortStatus) => {
    if (port.reserved) {
      return <Badge variant="secondary">Reserved</Badge>;
    }
    if (port.available) {
      return <Badge variant="default" className="bg-green-500">Available</Badge>;
    }
    return <Badge variant="destructive">In Use</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Statistics Overview */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monitored Ports</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalMonitoredPorts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Reservations</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.activeReservations}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Available Ports</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.availablePortsInRange}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monitoring Status</CardTitle>
              {statistics.monitoringEnabled ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                {statistics.monitoringEnabled ? 'Active' : 'Inactive'}
              </div>
              {statistics.lastScanTime && (
                <div className="text-xs text-muted-foreground">
                  Last scan: {formatDate(statistics.lastScanTime)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="check" className="space-y-4">
        <TabsList>
          <TabsTrigger value="check">Port Checker</TabsTrigger>
          <TabsTrigger value="scan">Range Scanner</TabsTrigger>
          <TabsTrigger value="reservations">Reservations</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
        </TabsList>

        <TabsContent value="check" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Check Port Availability</CardTitle>
              <CardDescription>
                Enter comma-separated port numbers to check their availability
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex space-x-2">
                <Input
                  placeholder="e.g., 3000, 8080, 9000"
                  value={portsToCheck}
                  onChange={(e) => setPortsToCheck(e.target.value)}
                  className="flex-1"
                />
                <Select value={protocol} onValueChange={setProtocol}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="udp">UDP</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={checkPortAvailability} disabled={loading}>
                  <Search className="h-4 w-4 mr-2" />
                  Check
                </Button>
              </div>

              {portCheckResults.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium">Results:</h4>
                  <div className="space-y-2">
                    {portCheckResults.map((port) => (
                      <div key={`${port.port}-${port.protocol}`} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center space-x-3">
                          <span className="font-mono text-sm">{port.port}/{port.protocol}</span>
                          {port.available ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          {getStatusBadge(port)}
                        </div>
                        {port.reserved && port.reservedBy && (
                          <div className="text-sm text-muted-foreground">
                            Reserved by: {port.reservedBy}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scan" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Port Range Scanner</CardTitle>
              <CardDescription>
                Scan a range of ports to find available ones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label htmlFor="startPort">Start Port</Label>
                  <Input
                    id="startPort"
                    type="number"
                    value={scanStartPort}
                    onChange={(e) => setScanStartPort(e.target.value)}
                    min="1"
                    max="65535"
                  />
                </div>
                <div>
                  <Label htmlFor="endPort">End Port</Label>
                  <Input
                    id="endPort"
                    type="number"
                    value={scanEndPort}
                    onChange={(e) => setScanEndPort(e.target.value)}
                    min="1"
                    max="65535"
                  />
                </div>
                <div>
                  <Label htmlFor="scanProtocol">Protocol</Label>
                  <Select value={protocol} onValueChange={setProtocol}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="udp">UDP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={scanPortRange} disabled={loading} className="w-full">
                <Search className="h-4 w-4 mr-2" />
                Scan Range
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reservations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Port Reservations</CardTitle>
              <CardDescription>
                Currently active port reservations in the system
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reservations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No active port reservations
                </div>
              ) : (
                <div className="space-y-2">
                  {reservations.map((reservation) => (
                    <div key={reservation.id} className="p-3 border rounded space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="font-mono text-sm">
                            {reservation.port}/{reservation.protocol}
                          </span>
                          <Badge variant="secondary">Reserved</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Expires: {formatDate(reservation.expires_at)}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Container: {reservation.container_id}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Port Suggestions</CardTitle>
              <CardDescription>
                Get alternative port suggestions for your service
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="suggestPorts">Requested Ports</Label>
                  <Input
                    id="suggestPorts"
                    placeholder="e.g., 3000, 8080"
                    value={portsToCheck}
                    onChange={(e) => setPortsToCheck(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="serviceType">Service Type</Label>
                  <Select value={serviceType} onValueChange={setServiceType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="web">Web Application</SelectItem>
                      <SelectItem value="api">API Service</SelectItem>
                      <SelectItem value="database">Database</SelectItem>
                      <SelectItem value="cache">Cache Service</SelectItem>
                      <SelectItem value="monitoring">Monitoring</SelectItem>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={suggestAlternativePorts} disabled={loading} className="w-full">
                Get Suggestions
              </Button>

              {portSuggestions.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium">Suggested Alternatives:</h4>
                  {portSuggestions.map((suggestion, index) => (
                    <div key={index} className="p-3 border rounded">
                      <div className="text-sm font-medium mb-2">
                        Original: {suggestion.originalPort}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {suggestion.alternatives.map((alt) => (
                          <Badge key={alt} variant="outline" className="font-mono">
                            {alt}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}