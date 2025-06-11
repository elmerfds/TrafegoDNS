/**
 * Connection Status Component
 * Shows real-time WebSocket connection status and quality
 */

import React from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { useSocket } from '../hooks/useSocket';
import { cn } from '../lib/utils';

interface ConnectionStatusProps {
  className?: string;
  showDetails?: boolean;
  compact?: boolean;
}

export function ConnectionStatus({ 
  className, 
  showDetails = false, 
  compact = false 
}: ConnectionStatusProps) {
  const {
    isConnected,
    isConnecting,
    connectionQuality,
    reconnectAttempts,
    lastConnectedAt,
    latency,
    reconnect
  } = useSocket();

  /**
   * Get connection status icon
   */
  const getStatusIcon = () => {
    if (isConnecting) {
      return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
    }
    
    if (isConnected) {
      switch (connectionQuality) {
        case 'excellent':
          return <Wifi className="h-4 w-4 text-green-500" />;
        case 'good':
          return <Wifi className="h-4 w-4 text-yellow-500" />;
        case 'poor':
          return <AlertTriangle className="h-4 w-4 text-orange-500" />;
        default:
          return <Wifi className="h-4 w-4 text-gray-500" />;
      }
    }
    
    return <WifiOff className="h-4 w-4 text-red-500" />;
  };

  /**
   * Get connection status text
   */
  const getStatusText = () => {
    if (isConnecting) {
      return reconnectAttempts > 0 
        ? `Reconnecting (${reconnectAttempts}/10)...` 
        : 'Connecting...';
    }
    
    if (isConnected) {
      return compact ? 'Connected' : `Connected (${connectionQuality})`;
    }
    
    return 'Disconnected';
  };

  /**
   * Get status badge variant
   */
  const getBadgeVariant = () => {
    if (isConnecting) return 'outline';
    if (isConnected) {
      switch (connectionQuality) {
        case 'excellent':
        case 'good':
          return 'default';
        case 'poor':
          return 'secondary';
        default:
          return 'outline';
      }
    }
    return 'destructive';
  };

  /**
   * Get detailed connection info for tooltip
   */
  const getConnectionDetails = () => {
    const details = [];
    
    if (isConnected) {
      details.push(`Quality: ${connectionQuality}`);
      if (latency !== null) {
        details.push(`Latency: ${latency}ms`);
      }
      if (lastConnectedAt) {
        details.push(`Connected: ${lastConnectedAt.toLocaleTimeString()}`);
      }
    } else {
      details.push('WebSocket disconnected');
      if (reconnectAttempts > 0) {
        details.push(`Reconnect attempts: ${reconnectAttempts}/10`);
      }
    }
    
    return details.join('\n');
  };

  /**
   * Handle manual reconnection
   */
  const handleReconnect = () => {
    if (!isConnected && !isConnecting) {
      reconnect();
    }
  };

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('flex items-center gap-1', className)}>
              {getStatusIcon()}
              {!isConnected && !isConnecting && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handleReconnect}
                  title="Reconnect"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <p>{getStatusText()}</p>
              {showDetails && (
                <p className="text-xs text-muted-foreground whitespace-pre-line mt-1">
                  {getConnectionDetails()}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center gap-1">
        {getStatusIcon()}
        <Badge variant={getBadgeVariant()} className="text-xs">
          {getStatusText()}
        </Badge>
      </div>
      
      {showDetails && isConnected && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {latency !== null && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {latency}ms
            </div>
          )}
          {lastConnectedAt && (
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              {lastConnectedAt.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
      
      {!isConnected && !isConnecting && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleReconnect}
          className="h-6 px-2 text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Reconnect
        </Button>
      )}
      
      {reconnectAttempts > 0 && (
        <div className="text-xs text-muted-foreground">
          Attempt {reconnectAttempts}/10
        </div>
      )}
    </div>
  );
}

export default ConnectionStatus;