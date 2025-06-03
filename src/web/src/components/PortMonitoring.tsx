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
import { AlertTriangle, CheckCircle, XCircle, Search, Settings, Activity, Wifi, WifiOff, Plus, Server, Clock, Lock, X } from 'lucide-react';
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

interface PortInUse {
  port: number;
  protocol: string;
  service?: string;
  containerId?: string;
  containerName?: string;
  documentation?: string;
  lastSeen: string;
  isOverridden?: boolean;
  image?: string;
  imageId?: string;
  status?: string;
  labels?: Record<string, any>;
  created?: string;
  started?: string;
}

interface Server {
  id: string;
  name: string;
  ip: string;
  isHost: boolean;
}

export default function PortMonitoring() {
  const [statistics, setStatistics] = useState<PortStatistics | null>(null);
  const [reservations, setReservations] = useState<PortReservation[]>([]);
  const [portCheckResults, setPortCheckResults] = useState<PortStatus[]>([]);
  const [portScanResults, setPortScanResults] = useState<PortStatus[]>([]);
  const [portSuggestions, setPortSuggestions] = useState<PortSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [portsToCheck, setPortsToCheck] = useState('');
  const [protocol, setProtocol] = useState('both'); // Changed default to 'both'
  const [scanStartPort, setScanStartPort] = useState('3000');
  const [scanEndPort, setScanEndPort] = useState('3100');
  const [serviceType, setServiceType] = useState('web');
  const [selectedServer, setSelectedServer] = useState('host');
  const [customServerIp, setCustomServerIp] = useState('');
  const [portsInUse, setPortsInUse] = useState<PortInUse[]>([]);
  const [servers, setServers] = useState<Server[]>([
    { id: 'host', name: 'Host Server', ip: 'localhost', isHost: true }
  ]);
  
  // Debug server state changes
  useEffect(() => {
    console.log('Servers state updated:', servers);
  }, [servers]);
  
  // Reservation form states
  const [reservationPort, setReservationPort] = useState('');
  const [reservationContainerId, setReservationContainerId] = useState('');
  const [reservationDuration, setReservationDuration] = useState('3600');
  const [reservationDurationType, setReservationDurationType] = useState('hours');
  const [reservationDurationValue, setReservationDurationValue] = useState('1');
  const [reservationNotes, setReservationNotes] = useState('');
  const [showReservationDialog, setShowReservationDialog] = useState(false);
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPortsInUse, setFilteredPortsInUse] = useState<PortInUse[]>([]);
  
  // Label override states
  const [editingLabelPort, setEditingLabelPort] = useState<number | null>(null);
  const [newServiceLabel, setNewServiceLabel] = useState('');
  
  // Server management states
  const [newServerName, setNewServerName] = useState('');
  const [newServerIp, setNewServerIp] = useState('');
  const [editingHostIp, setEditingHostIp] = useState(false);
  const [editHostIpValue, setEditHostIpValue] = useState('');
  const [addingServer, setAddingServer] = useState(false);
  
  // Real-time updates
  const { socket, isConnected } = useSocket();
  
  useEffect(() => {
    loadStatistics();
    loadReservations();
    loadHostConfiguration();
  }, []);

  const loadHostConfiguration = async () => {
    try {
      const response = await api.get('/config');
      const config = response.data.data.config;
      
      // Update the host server IP with the configured value
      if (config.hostIp) {
        setServers(prev => prev.map(server => 
          server.isHost 
            ? { ...server, ip: config.hostIp }
            : server
        ));
      }
    } catch (error) {
      console.error('Failed to load host configuration:', error);
    }
  };

  useEffect(() => {
    console.log('useEffect triggered for port loading:', { selectedServer, customServerIp });
    // Only load ports when we have a valid server selection
    if (selectedServer !== 'custom' || (selectedServer === 'custom' && customServerIp && customServerIp.trim())) {
      console.log('Valid server selection, loading ports');
      loadPortsInUse();
    } else {
      console.log('Invalid server selection, skipping port load');
    }
  }, [selectedServer, customServerIp]);

  // Filter ports based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredPortsInUse(portsInUse);
    } else {
      const filtered = portsInUse.filter(port => {
        const searchLower = searchTerm.toLowerCase();
        const searchTrimmed = searchTerm.trim();
        
        // Check for wildcard patterns in port searches
        if (/^[\d*?]+$/.test(searchTrimmed)) {
          // This is a port pattern search (contains only digits, *, and ?)
          const portString = port.port.toString();
          
          if (searchTrimmed.includes('*') || searchTrimmed.includes('?')) {
            // Convert wildcard pattern to regex
            const regexPattern = searchTrimmed
              .replace(/\*/g, '.*')  // * matches any number of characters
              .replace(/\?/g, '.');  // ? matches exactly one character
            
            try {
              const regex = new RegExp(`^${regexPattern}$`);
              return regex.test(portString);
            } catch (error) {
              // If regex is invalid, fall back to partial matching
              return portString.includes(searchTrimmed.replace(/[*?]/g, ''));
            }
          } else {
            // Pure numeric search - exact match only
            const searchPort = parseInt(searchTrimmed);
            return port.port === searchPort;
          }
        }
        
        // For non-numeric/non-pattern searches, use partial matching on all fields
        return (
          port.port.toString().includes(searchLower) ||
          port.protocol.toLowerCase().includes(searchLower) ||
          port.service?.toLowerCase().includes(searchLower) ||
          port.containerName?.toLowerCase().includes(searchLower) ||
          port.documentation?.toLowerCase().includes(searchLower) ||
          port.containerId?.toLowerCase().includes(searchLower)
        );
      });
      setFilteredPortsInUse(filtered);
    }
  }, [portsInUse, searchTerm]);

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

  const loadPortsInUse = async () => {
    console.log('loadPortsInUse called with selectedServer:', selectedServer, 'customServerIp:', customServerIp);
    
    try {
      let serverIp = 'localhost';
      
      if (selectedServer === 'custom') {
        if (!customServerIp || !customServerIp.trim()) {
          const errorMsg = 'Please enter a valid server IP for custom server selection';
          setError(errorMsg);
          console.log('Custom server validation failed:', errorMsg);
          return;
        }
        serverIp = customServerIp.trim();
        console.log('Using custom server IP:', serverIp);
      } else {
        const server = servers.find(s => s.id === selectedServer);
        if (server) {
          serverIp = server.ip;
          console.log('Found server from list:', server);
        } else {
          console.log('Server not found in list, using default localhost');
        }
      }
      
      console.log('Loading ports for server:', serverIp);
      setLoading(true);
      setError(null);
      
      const response = await api.get(`/ports/in-use?server=${encodeURIComponent(serverIp)}`);
      console.log('API response:', response.data);
      
      if (response.data && response.data.data && response.data.data.ports) {
        setPortsInUse(response.data.data.ports);
        console.log(`Loaded ${response.data.data.ports.length} ports for server ${serverIp}`);
      } else {
        console.log('Unexpected API response structure:', response.data);
        setPortsInUse([]);
      }
      
    } catch (error: any) {
      console.error('Failed to load ports in use:', error);
      const errorMsg = error.response?.data?.message || error.message || `Failed to load ports from server ${selectedServer === 'custom' ? customServerIp : selectedServer}`;
      setError(errorMsg);
      console.log('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
    } finally {
      setLoading(false);
    }
  };

  const addServer = async () => {
    console.log('addServer called with:', { newServerName, newServerIp });
    
    if (addingServer) {
      console.log('Already adding server, skipping...');
      return;
    }
    
    if (!newServerName.trim() || !newServerIp.trim()) {
      setError('Please enter both server name and IP address');
      console.log('Validation failed: missing name or IP');
      return;
    }
    
    try {
      setAddingServer(true);
      // Clear any existing errors first
      setError(null);
      
      // Validate IP format - expanded regex to include more formats
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^localhost$|^host\.docker\.internal$|^127\.0\.0\.1$/;
      if (!ipRegex.test(newServerIp.trim())) {
        setError('Please enter a valid IP address format (e.g., 192.168.1.100)');
        console.log('IP validation failed:', newServerIp.trim());
        return;
      }
      
      // Check if server already exists
      const existingServer = servers.find(s => 
        s.ip === newServerIp.trim() || 
        s.name.toLowerCase() === newServerName.trim().toLowerCase()
      );
      
      if (existingServer) {
        setError('A server with this name or IP already exists');
        console.log('Server already exists:', existingServer);
        return;
      }
      
      const newServer: Server = {
        id: `server-${Date.now()}`,
        name: newServerName.trim(),
        ip: newServerIp.trim(),
        isHost: false
      };
      
      console.log('Adding new server:', newServer);
      setServers(prev => {
        const updated = [...prev, newServer];
        console.log('Updated servers list:', updated);
        return updated;
      });
      
      // Clear form
      setNewServerName('');
      setNewServerIp('');
      
      console.log('Server added successfully, form cleared');
      
      // Show success message
      console.log(`Successfully added server: ${newServer.name} (${newServer.ip})`);
      
    } catch (error) {
      console.error('Error adding server:', error);
      setError('Failed to add server');
    } finally {
      setAddingServer(false);
    }
  };

  const removeServer = (serverId: string) => {
    // Don't allow removing the host server
    const serverToRemove = servers.find(s => s.id === serverId);
    if (serverToRemove?.isHost) {
      setError('Cannot remove the host server');
      return;
    }
    
    setServers(prev => prev.filter(s => s.id !== serverId));
    
    // If the removed server was selected, switch back to host
    if (selectedServer === serverId) {
      setSelectedServer('host');
    }
  };

  const startEditingHostIp = () => {
    const hostServer = servers.find(s => s.isHost);
    setEditHostIpValue(hostServer?.ip || 'localhost');
    setEditingHostIp(true);
  };

  const cancelEditingHostIp = () => {
    setEditingHostIp(false);
    setEditHostIpValue('');
    setError(null);
  };

  const saveHostIp = async () => {
    if (!editHostIpValue.trim()) {
      setError('Host IP cannot be empty');
      return;
    }

    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^localhost$|^host\.docker\.internal$/;
    if (!ipRegex.test(editHostIpValue.trim())) {
      setError('Please enter a valid IP address format');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Update the host IP in the application settings
      await api.put('/config', {
        hostIp: editHostIpValue.trim()
      });

      // Update the local servers state
      setServers(prev => prev.map(server => 
        server.isHost 
          ? { ...server, ip: editHostIpValue.trim() }
          : server
      ));

      setEditingHostIp(false);
      setEditHostIpValue('');
      
      // Reload ports if host server is selected
      if (selectedServer === 'host') {
        loadPortsInUse();
      }

      console.log('Host IP updated to:', editHostIpValue.trim());
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to update host IP');
    } finally {
      setLoading(false);
    }
  };

  const createReservation = async () => {
    if (!reservationPort || !reservationContainerId) {
      setError('Port and Container ID are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Calculate duration in seconds based on type
      let durationInSeconds = parseInt(reservationDurationValue);
      switch (reservationDurationType) {
        case 'minutes':
          durationInSeconds *= 60;
          break;
        case 'hours':
          durationInSeconds *= 3600;
          break;
        case 'days':
          durationInSeconds *= 86400;
          break;
        case 'weeks':
          durationInSeconds *= 604800;
          break;
        case 'permanent':
          durationInSeconds = 100 * 365 * 24 * 3600; // 100 years (effectively permanent)
          break;
        default:
          break;
      }

      await api.post('/ports/reserve', {
        ports: [parseInt(reservationPort)],
        containerId: reservationContainerId,
        protocol: protocol === 'both' ? 'tcp' : protocol,
        duration: durationInSeconds,
        metadata: {
          notes: reservationNotes,
          createdBy: 'user',
          durationType: reservationDurationType,
          originalDurationValue: reservationDurationValue
        }
      });

      setShowReservationDialog(false);
      setReservationPort('');
      setReservationContainerId('');
      setReservationDurationValue('1');
      setReservationDurationType('hours');
      setReservationNotes('');
      loadReservations();
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to create reservation');
    } finally {
      setLoading(false);
    }
  };

  const updatePortDocumentation = async (port: number, documentation: string) => {
    try {
      await api.put(`/ports/${port}/documentation`, {
        documentation,
        server: selectedServer === 'custom' ? customServerIp : servers.find(s => s.id === selectedServer)?.ip
      });
      loadPortsInUse();
    } catch (error) {
      console.error('Failed to update port documentation:', error);
    }
  };

  const updatePortServiceLabel = async (port: number, serviceLabel: string, protocol: string = 'tcp') => {
    try {
      await api.put(`/ports/${port}/label`, {
        serviceLabel,
        server: selectedServer === 'custom' ? customServerIp : servers.find(s => s.id === selectedServer)?.ip,
        protocol
      });
      loadPortsInUse();
      setEditingLabelPort(null);
      setNewServiceLabel('');
    } catch (error) {
      console.error('Failed to update port service label:', error);
      setError('Failed to update service label');
    }
  };

  const startEditingLabel = (port: number, currentLabel: string) => {
    setEditingLabelPort(port);
    setNewServiceLabel(currentLabel || '');
  };

  const cancelEditingLabel = () => {
    setEditingLabelPort(null);
    setNewServiceLabel('');
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
    setPortScanResults([]); // Clear previous results

    try {
      const response = await api.post('/ports/scan-range', {
        startPort: start,
        endPort: end,
        protocol
      });

      const results = response.data.data.results;
      const summary = response.data.data.summary;
      
      // Include all ports (available and unavailable) for complete picture
      const allPorts = Object.entries(results).map(([port, available]) => ({
        port: parseInt(port),
        available: available as boolean,
        reserved: false,
        protocol
      }));

      setPortScanResults(allPorts as PortStatus[]);
      
      // Show summary in success message
      if (summary) {
        setError(null); // Clear any previous errors
        console.log(`Scan complete: ${summary.availablePorts}/${summary.totalPorts} ports available (${summary.availabilityPercentage}%)`);
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to scan port range');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (port: PortStatus) => {
    if (port.reserved) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Reserved</Badge>;
    }
    if (port.available) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Available</Badge>;
    }
    return <Badge variant="destructive" className="bg-red-100 text-red-800">In Use</Badge>;
  };

  const getReservationStatusBadge = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const timeUntilExpiry = expiry.getTime() - now.getTime();
    const hoursUntilExpiry = timeUntilExpiry / (1000 * 60 * 60);
    
    if (timeUntilExpiry <= 0) {
      return <Badge variant="destructive" className="bg-red-100 text-red-800">Expired</Badge>;
    } else if (hoursUntilExpiry <= 1) {
      return <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">Expiring Soon</Badge>;
    } else if (hoursUntilExpiry <= 24) {
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">Expires Today</Badge>;
    } else {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Active</Badge>;
    }
  };

  const addPortToReservation = (port: PortStatus) => {
    setReservationPort(port.port.toString());
    setShowReservationDialog(true);
  };

  const getDurationPreview = () => {
    const value = parseInt(reservationDurationValue) || 1;
    
    if (reservationDurationType === 'permanent') {
      return 'Permanent reservation';
    }
    
    const now = new Date();
    let endTime = new Date(now);
    
    switch (reservationDurationType) {
      case 'minutes':
        endTime.setMinutes(now.getMinutes() + value);
        break;
      case 'hours':
        endTime.setHours(now.getHours() + value);
        break;
      case 'days':
        endTime.setDate(now.getDate() + value);
        break;
      case 'weeks':
        endTime.setDate(now.getDate() + (value * 7));
        break;
    }
    
    return `Until ${endTime.toLocaleString()}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const releaseReservation = async (reservation: PortReservation) => {
    try {
      await api.delete('/ports/reserve', {
        data: {
          ports: [reservation.port],
          containerId: reservation.container_id
        }
      });
      loadReservations();
      loadStatistics();
    } catch (error) {
      console.error('Failed to release reservation:', error);
      setError('Failed to release reservation');
    }
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

      <Tabs defaultValue="in-use" className="space-y-4">
        <TabsList>
          <TabsTrigger value="in-use">Ports in Use</TabsTrigger>
          <TabsTrigger value="check">Port Checker</TabsTrigger>
          <TabsTrigger value="scan">Range Scanner</TabsTrigger>
          <TabsTrigger value="reservations">Reservations</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="servers">Servers</TabsTrigger>
        </TabsList>

        <TabsContent value="in-use" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ports Currently in Use</CardTitle>
              <CardDescription>
                All ports in use on {selectedServer === 'custom' ? customServerIp : servers.find(s => s.id === selectedServer)?.name || 'Host'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-4">
                <div>
                  <Label htmlFor="serverSelect">Server</Label>
                  <div className="flex space-x-2">
                    <Select value={selectedServer} onValueChange={setSelectedServer}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {servers.map(server => (
                          <SelectItem key={server.id} value={server.id}>
                            {server.name} ({server.ip})
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Custom IP...</SelectItem>
                      </SelectContent>
                    </Select>
                    {selectedServer === 'custom' && (
                      <Input
                        placeholder="Enter server IP"
                        value={customServerIp}
                        onChange={(e) => setCustomServerIp(e.target.value)}
                        className="w-48"
                      />
                    )}
                    <Button 
                      onClick={() => {
                        console.log('Refresh button clicked');
                        loadPortsInUse();
                      }} 
                      disabled={loading}
                    >
                      <Search className="h-4 w-4 mr-2" />
                      {loading ? 'Loading...' : 'Refresh'}
                    </Button>
                  </div>
                </div>
                
                {/* Search Bar */}
                <div>
                  <Label htmlFor="searchPorts">Search Ports</Label>
                  <Input
                    id="searchPorts"
                    placeholder="Search ports (exact: 80, wildcard: 80*, 80?1, text: nginx)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                  {searchTerm && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {(() => {
                        const trimmed = searchTerm.trim();
                        if (/^[\d*?]+$/.test(trimmed)) {
                          if (trimmed.includes('*') || trimmed.includes('?')) {
                            return `Port wildcard pattern: "${trimmed}" (* = any chars, ? = one char)`;
                          } else {
                            return `Searching for exact port match: ${trimmed}`;
                          }
                        } else {
                          return `Text search in all fields: "${trimmed}"`;
                        }
                      })()}
                    </div>
                  )}
                </div>
              </div>
              
              {portsInUse.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No ports found in use. Click Refresh to scan.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground mb-2">
                    {searchTerm ? `Found ${filteredPortsInUse.length} of ${portsInUse.length} ports` : `Found ${portsInUse.length} ports in use`}
                  </div>
                  <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
                    {filteredPortsInUse.map((portInfo) => (
                      <div key={`${portInfo.port}-${portInfo.protocol}`} className="p-3 border rounded space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className="font-mono text-sm font-bold">
                              {portInfo.port}/{portInfo.protocol}
                            </span>
                            <Badge variant="destructive">In Use</Badge>
                            {portInfo.service && (
                              <div className="flex items-center space-x-2">
                                {editingLabelPort === portInfo.port ? (
                                  <div className="flex items-center space-x-2">
                                    <Input
                                      value={newServiceLabel}
                                      onChange={(e) => setNewServiceLabel(e.target.value)}
                                      placeholder="Service label"
                                      className="w-32 h-6 text-xs"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          updatePortServiceLabel(portInfo.port, newServiceLabel, portInfo.protocol);
                                        } else if (e.key === 'Escape') {
                                          cancelEditingLabel();
                                        }
                                      }}
                                    />
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="h-6 px-2"
                                      onClick={() => updatePortServiceLabel(portInfo.port, newServiceLabel, portInfo.protocol)}
                                    >
                                      ✓
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="h-6 px-2"
                                      onClick={cancelEditingLabel}
                                    >
                                      ✕
                                    </Button>
                                  </div>
                                ) : (
                                  <Badge 
                                    variant={portInfo.isOverridden ? "default" : "outline"}
                                    className={`cursor-pointer ${portInfo.isOverridden ? 'bg-blue-500' : ''}`}
                                    onClick={() => startEditingLabel(portInfo.port, portInfo.service || '')}
                                    title={portInfo.isOverridden ? 'Custom label (click to edit)' : 'Auto-detected label (click to override)'}
                                  >
                                    {portInfo.service}
                                    {portInfo.isOverridden && ' *'}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Last seen: {formatDate(portInfo.lastSeen)}
                          </div>
                        </div>
                        {portInfo.containerName && (
                          <div className="text-sm space-y-1">
                            <div>
                              Container: <span className="font-medium">{portInfo.containerName}</span>
                              {portInfo.containerId && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({portInfo.containerId.substring(0, 12)})
                                </span>
                              )}
                              {portInfo.status && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  {portInfo.status}
                                </Badge>
                              )}
                            </div>
                            {portInfo.image && (
                              <div className="text-xs text-muted-foreground">
                                Image: {portInfo.image}
                              </div>
                            )}
                            {portInfo.started && (
                              <div className="text-xs text-muted-foreground">
                                Started: {formatDate(portInfo.started)}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex items-center space-x-2">
                          <Input
                            placeholder="Add documentation/notes..."
                            value={portInfo.documentation || ''}
                            onChange={(e) => updatePortDocumentation(portInfo.port, e.target.value)}
                            className="text-sm flex-1"
                          />
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 px-3 text-xs whitespace-nowrap"
                            onClick={() => {
                              setReservationPort(portInfo.port.toString());
                              // Prefer container name, fallback to service, then container ID
                              const containerIdentifier = portInfo.containerName || 
                                                        (portInfo.service && portInfo.service !== 'Unknown' ? portInfo.service : '') ||
                                                        portInfo.containerId || '';
                              setReservationContainerId(containerIdentifier);
                              setShowReservationDialog(true);
                            }}
                          >
<Lock className="h-3 w-3 mr-1" />Reserve
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

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
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both</SelectItem>
                    <SelectItem value="tcp">TCP Only</SelectItem>
                    <SelectItem value="udp">UDP Only</SelectItem>
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
                  <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 500px)' }}>
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
                        <div className="flex items-center space-x-2">
                          {port.reserved && port.reservedBy && (
                            <div className="text-sm text-muted-foreground">
                              Reserved by: {port.reservedBy}
                            </div>
                          )}
                          {port.available && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-6 px-2 text-xs"
                              onClick={() => addPortToReservation(port)}
                            >
                              + Reserve
                            </Button>
                          )}
                        </div>
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
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={scanPortRange} disabled={loading} className="w-full">
                <Search className="h-4 w-4 mr-2" />
                {loading ? 'Scanning...' : 'Scan Range'}
              </Button>

              {loading && (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-sm text-muted-foreground">
                    Scanning ports {scanStartPort} to {scanEndPort}...
                  </span>
                </div>
              )}

              {portScanResults.length > 0 && (
                <div className="space-y-4 mt-4">
                  <h4 className="font-medium">Scan Results:</h4>
                  <div className="text-sm text-muted-foreground mb-2">
                    {(() => {
                      const availableCount = portScanResults.filter(p => p.available).length;
                      const totalCount = portScanResults.length;
                      const percentage = Math.round((availableCount / totalCount) * 100);
                      return `${availableCount}/${totalCount} ports available (${percentage}%)`;
                    })()}
                  </div>
                  
                  {/* Combined Results Section */}
                  <div className="space-y-2">
                    <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 500px)' }}>
                      {portScanResults.map((port) => (
                        <div key={`${port.port}-${port.protocol}`} className="p-3 border rounded space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <span className="font-mono text-sm font-bold">
                                {port.port}/{port.protocol}
                              </span>
                              {port.available ? (
                                <>
                                  <Badge variant="default" className="bg-green-100 text-green-800">Available</Badge>
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                </>
                              ) : (
                                <>
                                  <Badge variant="destructive" className="bg-red-100 text-red-800">In Use</Badge>
                                  <XCircle className="h-4 w-4 text-red-500" />
                                </>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <div className="text-sm text-muted-foreground">
                                {port.available ? 'Ready for use' : 'Already taken'}
                              </div>
                              {port.available && (
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-6 px-2 text-xs"
                                  onClick={() => addPortToReservation(port)}
                                >
                                  + Reserve
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {portScanResults.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground">
                      No results to display
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reservations" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Active Port Reservations</CardTitle>
                <CardDescription>
                  Currently active port reservations in the system
                </CardDescription>
              </div>
              <Button onClick={() => setShowReservationDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Reservation
              </Button>
            </CardHeader>
            <CardContent>
              {reservations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No active port reservations
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
                  {reservations.map((reservation) => (
                    <div key={reservation.id} className="p-3 border rounded space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="font-mono text-sm font-bold">
                            {reservation.port}/{reservation.protocol}
                          </span>
                          {getReservationStatusBadge(reservation.expires_at)}
                        </div>
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Clock className="h-3 w-3 mr-1" />
                          {reservation.expires_at === '9999-12-31T23:59:59.999Z' ? (
                            'Permanent reservation'
                          ) : (
                            `Expires: ${formatDate(reservation.expires_at)}`
                          )}
                        </div>
                      </div>
                      <div className="flex items-start justify-between">
                        <div className="text-sm text-muted-foreground flex-1">
                          Container: {reservation.container_id}
                          {reservation.metadata?.notes && (
                            <div className="text-xs mt-1 text-gray-600">
                              Notes: {reservation.metadata.notes}
                            </div>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-6 px-2 text-xs text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 ml-2"
                          onClick={() => releaseReservation(reservation)}
                        >
                          <X className="h-3 w-3 mr-1" />Release
                        </Button>
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
                  <div className="space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 500px)' }}>
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
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="servers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Server Management</CardTitle>
              <CardDescription>
                Configure servers for port monitoring. You can edit the host server IP to specify the actual host machine address for Docker environments. After adding a server, you can select it in the "Ports in Use" tab.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Configured Servers</h4>
                  <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 500px)' }}>
                    {servers.length > 0 ? servers.map(server => (
                      <div key={server.id} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center space-x-3">
                          <Server className="h-4 w-4" />
                          <div className="flex-1">
                            <div className="font-medium">{server.name}</div>
                            {server.isHost && editingHostIp ? (
                              <div className="flex items-center space-x-2 mt-1">
                                <Input
                                  value={editHostIpValue}
                                  onChange={(e) => setEditHostIpValue(e.target.value)}
                                  placeholder="Enter host IP"
                                  className="text-xs h-6 flex-1"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      saveHostIp();
                                    } else if (e.key === 'Escape') {
                                      cancelEditingHostIp();
                                    }
                                  }}
                                />
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-6 px-2"
                                  onClick={saveHostIp}
                                  disabled={loading}
                                >
                                  ✓
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-6 px-2"
                                  onClick={cancelEditingHostIp}
                                >
                                  ✕
                                </Button>
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">{server.ip}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {server.isHost ? (
                            <div className="flex items-center space-x-2">
                              <Badge variant="outline">Host Server</Badge>
                              {!editingHostIp && (
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-6 px-2 text-xs"
                                  onClick={startEditingHostIp}
                                >
                                  Edit IP
                                </Button>
                              )}
                            </div>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-6 px-2 text-xs text-red-600 hover:text-red-700"
                              onClick={() => {
                                console.log('Removing server:', server.id);
                                removeServer(server.id);
                              }}
                            >
                              <X className="h-3 w-3 mr-1" />
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-4 text-muted-foreground">
                        No servers configured
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Add Custom Server</h4>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-4">
                      <Input 
                        placeholder="Server Name" 
                        value={newServerName}
                        onChange={(e) => setNewServerName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addServer()}
                      />
                      <Input 
                        placeholder="Server IP (e.g., 192.168.1.100)" 
                        value={newServerIp}
                        onChange={(e) => setNewServerIp(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addServer()}
                      />
                    </div>
                    <Button 
                      className="w-full"
                      onClick={() => {
                        console.log('Add Server button clicked');
                        addServer();
                      }}
                      disabled={!newServerName.trim() || !newServerIp.trim() || addingServer}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {addingServer ? 'Adding...' : 'Add Server'}
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Supported formats: IP addresses (192.168.1.100), localhost, host.docker.internal
                  </div>
                  
                  {/* Debug info */}
                  <div className="mt-4 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs">
                    <div className="font-medium mb-1">Debug Info:</div>
                    <div>Total servers: {servers.length}</div>
                    <div>Selected server: {selectedServer}</div>
                    <div>Custom IP: {customServerIp || 'none'}</div>
                    <div>Form values: {newServerName} / {newServerIp}</div>
                    <div>Button disabled: {(!newServerName.trim() || !newServerIp.trim() || addingServer).toString()}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showReservationDialog} onOpenChange={setShowReservationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Port Reservation</DialogTitle>
            <DialogDescription>
              Reserve a port for a specific container
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reservationPort">Port Number</Label>
              <Input
                id="reservationPort"
                type="number"
                placeholder="e.g., 8080"
                value={reservationPort}
                onChange={(e) => setReservationPort(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="reservationContainerId">Container ID</Label>
              <Input
                id="reservationContainerId"
                placeholder="Container ID or name"
                value={reservationContainerId}
                onChange={(e) => setReservationContainerId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="reservationProtocol">Protocol</Label>
              <Select value={protocol} onValueChange={setProtocol}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcp">TCP</SelectItem>
                  <SelectItem value="udp">UDP</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reservationDuration">Duration</Label>
              <div className="flex space-x-2">
                <Input
                  id="reservationDuration"
                  type="number"
                  placeholder="1"
                  value={reservationDurationValue}
                  onChange={(e) => setReservationDurationValue(e.target.value)}
                  className="flex-1"
                  min="1"
                />
                <Select value={reservationDurationType} onValueChange={setReservationDurationType}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="weeks">Weeks</SelectItem>
                    <SelectItem value="permanent">Permanent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {reservationDurationType === 'permanent' ? (
                  'Permanent reservations require manual release'
                ) : (
                  `Preview: ${getDurationPreview()}`
                )}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                <span className="text-xs text-muted-foreground mr-2">Quick presets:</span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-5 px-2 text-xs"
                  onClick={() => {
                    setReservationDurationValue('1');
                    setReservationDurationType('hours');
                  }}
                >
                  1 hour
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-5 px-2 text-xs"
                  onClick={() => {
                    setReservationDurationValue('1');
                    setReservationDurationType('days');
                  }}
                >
                  1 day
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-5 px-2 text-xs"
                  onClick={() => {
                    setReservationDurationValue('1');
                    setReservationDurationType('weeks');
                  }}
                >
                  1 week
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-5 px-2 text-xs"
                  onClick={() => {
                    setReservationDurationType('permanent');
                  }}
                >
                  Permanent
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="reservationNotes">Notes</Label>
              <Input
                id="reservationNotes"
                placeholder="Optional notes about this reservation"
                value={reservationNotes}
                onChange={(e) => setReservationNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2 mt-6">
            <Button variant="outline" onClick={() => setShowReservationDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createReservation} disabled={loading}>
              Create Reservation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}