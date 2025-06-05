import React, { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { 
  Server, 
  Plus, 
  X, 
  CheckCircle, 
  AlertCircle,
  Clock
} from 'lucide-react';
import { Form } from '../shared/Form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { api } from '../../lib/api';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { useToast } from '../../hooks/use-toast';

export interface ServerInfo {
  id: string;
  name: string;
  host: string;
  port?: number;
  status: 'online' | 'offline' | 'checking' | 'unknown';
  lastChecked?: Date;
  responseTime?: number;
  metadata?: {
    os?: string;
    version?: string;
    tags?: string[];
  };
}

export interface ServerSelectorProps {
  selectedServer: string;
  onServerChange: (serverId: string) => void;
  servers?: ServerInfo[];
  onServersChange?: (servers: ServerInfo[]) => void;
  allowCustom?: boolean;
  className?: string;
}

const DEFAULT_SERVERS: ServerInfo[] = [
  {
    id: 'localhost',
    name: 'Local Server',
    host: 'localhost',
    status: 'unknown'
  },
  {
    id: '127.0.0.1',
    name: 'Local IP',
    host: '127.0.0.1',
    status: 'unknown'
  }
];

export function ServerSelector({
  selectedServer,
  onServerChange,
  servers = DEFAULT_SERVERS,
  onServersChange,
  allowCustom = true,
  className = ''
}: ServerSelectorProps) {
  // Ensure servers is always an array to prevent "a.find is not a function" errors
  const safeServers = Array.isArray(servers) ? servers : DEFAULT_SERVERS;
  
  const [isAddingServer, setIsAddingServer] = useState(false);
  const [checkingServers, setCheckingServers] = useState<Set<string>>(new Set());
  
  const { handleApiError } = useErrorHandler();
  const { toast } = useToast();

  // Check server status
  const checkServerStatus = async (server: ServerInfo): Promise<ServerInfo> => {
    const startTime = Date.now();
    
    try {
      // Simple health check - in a real app this might be a specific health endpoint
      const response = await api.get('/status', {
        baseURL: server.port ? `http://${server.host}:${server.port}` : undefined,
        timeout: 5000
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        ...server,
        status: response.status === 200 ? 'online' : 'offline',
        lastChecked: new Date(),
        responseTime
      };
    } catch (error) {
      return {
        ...server,
        status: 'offline',
        lastChecked: new Date(),
        responseTime: Date.now() - startTime
      };
    }
  };

  // Check all servers status
  const checkAllServers = async () => {
    if (!onServersChange) return;
    
    setCheckingServers(new Set(safeServers.map(s => s.id)));
    
    try {
      const updatedServers = await Promise.all(
        safeServers.map(async (server) => {
          try {
            return await checkServerStatus(server);
          } catch (error) {
            return {
              ...server,
              status: 'offline' as const,
              lastChecked: new Date()
            };
          }
        })
      );
      
      onServersChange(updatedServers);
    } catch (error) {
      handleApiError(error, 'Check server status');
    } finally {
      setCheckingServers(new Set());
    }
  };

  // Check single server
  const checkSingleServer = async (serverId: string) => {
    if (!onServersChange) return;
    
    const server = safeServers.find(s => s.id === serverId);
    if (!server) return;
    
    setCheckingServers(prev => new Set([...prev, serverId]));
    
    try {
      const updatedServer = await checkServerStatus(server);
      const updatedServers = safeServers.map(s => 
        s.id === serverId ? updatedServer : s
      );
      
      onServersChange(updatedServers);
      
      toast({
        title: 'Server status updated',
        description: `${server.name} is ${updatedServer.status}`
      });
    } catch (error) {
      handleApiError(error, 'Check server status');
    } finally {
      setCheckingServers(prev => {
        const newSet = new Set(prev);
        newSet.delete(serverId);
        return newSet;
      });
    }
  };

  // Add new server
  const addServer = async (formData: FormData) => {
    if (!onServersChange) return;
    
    const name = formData.get('name') as string;
    const host = formData.get('host') as string;
    const port = formData.get('port') as string;
    
    const newServer: ServerInfo = {
      id: `${host}${port ? `:${port}` : ''}`,
      name: name || host,
      host,
      port: port ? parseInt(port) : undefined,
      status: 'checking'
    };
    
    // Check if server already exists
    if (safeServers.some(s => s.id === newServer.id)) {
      toast({
        title: 'Server already exists',
        description: 'A server with this host and port already exists.',
        variant: 'destructive'
      });
      return;
    }
    
    // Add server and check its status
    const updatedServers = [...safeServers, newServer];
    onServersChange(updatedServers);
    
    // Check the new server's status
    try {
      const checkedServer = await checkServerStatus(newServer);
      const finalServers = updatedServers.map(s => 
        s.id === newServer.id ? checkedServer : s
      );
      onServersChange(finalServers);
      
      toast({
        title: 'Server added',
        description: `${newServer.name} added and status checked.`
      });
    } catch (error) {
      handleApiError(error, 'Check new server status');
    }
    
    setIsAddingServer(false);
  };

  // Remove server
  const removeServer = (serverId: string) => {
    if (!onServersChange) return;
    
    const server = safeServers.find(s => s.id === serverId);
    if (!server) return;
    
    const updatedServers = safeServers.filter(s => s.id !== serverId);
    onServersChange(updatedServers);
    
    // If the removed server was selected, select the first available server
    if (selectedServer === serverId && updatedServers.length > 0) {
      onServerChange(updatedServers[0].id);
    }
    
    toast({
      title: 'Server removed',
      description: `${server.name} has been removed.`
    });
  };

  // Get status icon
  const getStatusIcon = (status: ServerInfo['status'], isChecking: boolean = false) => {
    if (isChecking) {
      return <Clock className="h-3 w-3 animate-spin text-blue-500" />;
    }
    
    switch (status) {
      case 'online':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'offline':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      case 'checking':
        return <Clock className="h-3 w-3 animate-spin text-blue-500" />;
      default:
        return <Server className="h-3 w-3 text-gray-400" />;
    }
  };

  // Get status badge variant
  const getStatusVariant = (status: ServerInfo['status']): 'default' | 'secondary' | 'destructive' => {
    switch (status) {
      case 'online':
        return 'default';
      case 'offline':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  // Auto-check servers on mount
  useEffect(() => {
    if (safeServers.length > 0 && onServersChange) {
      checkAllServers();
    }
  }, []); // Only run on mount

  const selectedServerInfo = safeServers.find(s => s.id === selectedServer);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Server Selector */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Select value={selectedServer} onValueChange={onServerChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select a server">
                {selectedServerInfo && (
                  <div className="flex items-center gap-2">
                    {getStatusIcon(
                      selectedServerInfo.status, 
                      checkingServers.has(selectedServerInfo.id)
                    )}
                    <span>{selectedServerInfo.name}</span>
                    {selectedServerInfo.responseTime && (
                      <Badge variant="outline" className="text-xs">
                        {selectedServerInfo.responseTime}ms
                      </Badge>
                    )}
                  </div>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {safeServers.map((server) => (
                <SelectItem key={server.id} value={server.id}>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(server.status, checkingServers.has(server.id))}
                      <span>{server.name}</span>
                      <span className="text-gray-500 text-sm">({server.host})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={getStatusVariant(server.status)} className="text-xs">
                        {server.status}
                      </Badge>
                      {server.responseTime && (
                        <Badge variant="outline" className="text-xs">
                          {server.responseTime}ms
                        </Badge>
                      )}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Server Actions */}
        <div className="flex gap-1">
          {selectedServerInfo && (
            <Button
              onClick={() => checkSingleServer(selectedServer)}
              variant="outline"
              size="sm"
              disabled={checkingServers.has(selectedServer)}
            >
              {checkingServers.has(selectedServer) ? (
                <Clock className="h-4 w-4 animate-spin" />
              ) : (
                'Check'
              )}
            </Button>
          )}
          
          {allowCustom && (
            <Dialog open={isAddingServer} onOpenChange={setIsAddingServer}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Server</DialogTitle>
                  <DialogDescription>
                    Add a new server to monitor ports on.
                  </DialogDescription>
                </DialogHeader>

                <Form
                  onSubmit={addServer}
                  validation={{
                    name: { required: true, maxLength: 50 },
                    host: { 
                      required: true, 
                      pattern: /^[\w.-]+$|^(\d{1,3}\.){3}\d{1,3}$/
                    },
                    port: { min: 1, max: 65535 }
                  }}
                >
                  <Form.Field name="name" label="Server Name" required>
                    <Form.Input placeholder="My Server" />
                  </Form.Field>
                  
                  <Form.Field name="host" label="Host" required>
                    <Form.Input placeholder="example.com or 192.168.1.100" />
                  </Form.Field>
                  
                  <Form.Field name="port" label="Port (optional)">
                    <Form.Input type="number" placeholder="8080" />
                  </Form.Field>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddingServer(false)}
                    >
                      Cancel
                    </Button>
                    <Form.Submit>Add Server</Form.Submit>
                  </DialogFooter>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Server Info */}
      {selectedServerInfo && (
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(selectedServerInfo.status, checkingServers.has(selectedServerInfo.id))}
              <div>
                <div className="font-medium">{selectedServerInfo.name}</div>
                <div className="text-sm text-gray-600">
                  {selectedServerInfo.host}
                  {selectedServerInfo.port && `:${selectedServerInfo.port}`}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {selectedServerInfo.responseTime && (
                <Badge variant="outline" className="text-xs">
                  {selectedServerInfo.responseTime}ms
                </Badge>
              )}
              
              <Badge variant={getStatusVariant(selectedServerInfo.status)}>
                {selectedServerInfo.status}
              </Badge>
              
              {selectedServerInfo.lastChecked && (
                <span className="text-xs text-gray-500">
                  Last checked: {selectedServerInfo.lastChecked.toLocaleTimeString()}
                </span>
              )}
              
              {allowCustom && selectedServerInfo.id !== 'localhost' && selectedServerInfo.id !== '127.0.0.1' && (
                <Button
                  onClick={() => removeServer(selectedServerInfo.id)}
                  variant="ghost"
                  size="sm"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}