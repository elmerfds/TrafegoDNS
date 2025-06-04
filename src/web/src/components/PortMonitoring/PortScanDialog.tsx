import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { 
  Play, 
  X, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Activity
} from 'lucide-react';
import { Form } from '../shared/Form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { api } from '../../lib/api';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { useToast } from '../../hooks/use-toast';
import type { PortScanRequest, PortScanResult } from '../../types/port';

export interface PortScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: Partial<PortScanRequest>;
  onScanComplete?: (results: PortScanResult) => void;
}

interface ScanProgress {
  current: number;
  total: number;
  percentage: number;
  currentPort?: number;
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
  startTime?: Date;
  endTime?: Date;
}

export function PortScanDialog({
  open,
  onOpenChange,
  initialValues = {},
  onScanComplete
}: PortScanDialogProps) {
  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    current: 0,
    total: 0,
    percentage: 0,
    status: 'idle'
  });
  const [scanResults, setScanResults] = useState<PortScanResult | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const { handleApiError } = useErrorHandler();
  const { toast } = useToast();

  const defaultValues = {
    startPort: '3000',
    endPort: '9999',
    protocol: 'tcp',
    server: 'localhost',
    timeout: '1000',
    concurrency: '50',
    ...initialValues
  };

  const validation = {
    startPort: {
      required: true,
      min: 1,
      max: 65535,
      custom: (value: string) => {
        const num = parseInt(value);
        if (isNaN(num)) return 'Start port must be a valid number';
        return null;
      }
    },
    endPort: {
      required: true,
      min: 1,
      max: 65535,
      custom: (value: string, formData?: FormData) => {
        const num = parseInt(value);
        if (isNaN(num)) return 'End port must be a valid number';
        
        if (formData) {
          const startPort = parseInt(formData.get('startPort') as string);
          if (!isNaN(startPort)) {
            if (num <= startPort) return 'End port must be greater than start port';
            if (num - startPort > 10000) return 'Port range too large (max 10,000 ports)';
          }
        }
        
        return null;
      }
    },
    protocol: {
      required: true
    },
    server: {
      required: true,
      pattern: /^[\w.-]+$|^(\d{1,3}\.){3}\d{1,3}$/
    },
    timeout: {
      required: true,
      min: 100,
      max: 30000
    },
    concurrency: {
      required: true,
      min: 1,
      max: 100
    }
  };

  const startScan = async (formData: FormData) => {
    const scanRequest: PortScanRequest = {
      startPort: parseInt(formData.get('startPort') as string),
      endPort: parseInt(formData.get('endPort') as string),
      protocol: formData.get('protocol') as 'tcp' | 'udp' | 'both',
      server: formData.get('server') as string,
      timeout: parseInt(formData.get('timeout') as string) || 1000,
      concurrency: parseInt(formData.get('concurrency') as string) || 50
    };

    const totalPorts = scanRequest.endPort - scanRequest.startPort + 1;
    
    setScanProgress({
      current: 0,
      total: totalPorts,
      percentage: 0,
      status: 'running',
      startTime: new Date()
    });
    
    setScanResults(null);

    // Create abort controller for cancelling scan
    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Start the scan
      const response = await api.post('/ports/scan-range', scanRequest, {
        signal: controller.signal,
        onDownloadProgress: (progressEvent) => {
          // Simulate progress based on time (real implementation would need WebSocket or SSE)
          const elapsed = Date.now() - scanProgress.startTime!.getTime();
          const estimatedTotal = ((scanRequest.timeout || 1000) * totalPorts) / (scanRequest.concurrency || 50);
          const percentage = Math.min((elapsed / estimatedTotal) * 100, 95);
          const current = Math.floor((percentage / 100) * totalPorts);
          
          setScanProgress(prev => ({
            ...prev,
            current,
            percentage,
            currentPort: scanRequest.startPort + current
          }));
        }
      });

      const results: PortScanResult = response.data.data;
      
      setScanProgress(prev => ({
        ...prev,
        current: totalPorts,
        percentage: 100,
        status: 'completed',
        endTime: new Date()
      }));
      
      setScanResults(results);
      
      toast({
        title: 'Port scan completed',
        description: `Scanned ${totalPorts} ports. Found ${results.summary.availablePorts} available ports.`
      });

      onScanComplete?.(results);

    } catch (error) {
      if (controller.signal.aborted) {
        setScanProgress(prev => ({
          ...prev,
          status: 'cancelled'
        }));
        
        toast({
          title: 'Port scan cancelled',
          description: 'The port scan was cancelled by user request.'
        });
      } else {
        setScanProgress(prev => ({
          ...prev,
          status: 'error'
        }));
        
        handleApiError(error, 'Port scan');
      }
    } finally {
      setAbortController(null);
    }
  };

  const cancelScan = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  const resetScan = () => {
    setScanProgress({
      current: 0,
      total: 0,
      percentage: 0,
      status: 'idle'
    });
    setScanResults(null);
    setAbortController(null);
  };

  const handleClose = () => {
    if (scanProgress.status === 'running') {
      cancelScan();
    }
    resetScan();
    onOpenChange(false);
  };

  const getStatusIcon = () => {
    switch (scanProgress.status) {
      case 'running':
        return <Activity className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'cancelled':
        return <X className="h-4 w-4 text-gray-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (scanProgress.status) {
      case 'running':
        return `Scanning port ${scanProgress.currentPort}... (${scanProgress.current}/${scanProgress.total})`;
      case 'completed':
        return `Scan completed in ${scanProgress.endTime && scanProgress.startTime ? 
          ((scanProgress.endTime.getTime() - scanProgress.startTime.getTime()) / 1000).toFixed(1) + 's' : 'unknown time'}`;
      case 'cancelled':
        return 'Scan was cancelled';
      case 'error':
        return 'Scan failed with error';
      default:
        return 'Ready to scan';
    }
  };

  const isScanning = scanProgress.status === 'running';
  const canStartScan = scanProgress.status === 'idle' || scanProgress.status === 'completed' || scanProgress.status === 'error';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Port Range Scanner</DialogTitle>
          <DialogDescription>
            Scan a range of ports to check their availability and identify running services.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Scan Form */}
          <Form 
            onSubmit={startScan} 
            validation={validation}
            defaultValues={defaultValues}
          >
            <div className="grid grid-cols-2 gap-4">
              <Form.Field name="startPort" label="Start Port" required>
                <Form.Input 
                  type="number" 
                  min="1" 
                  max="65535"
                  disabled={isScanning}
                />
              </Form.Field>
              
              <Form.Field name="endPort" label="End Port" required>
                <Form.Input 
                  type="number" 
                  min="1" 
                  max="65535"
                  disabled={isScanning}
                />
              </Form.Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Form.Field name="protocol" label="Protocol" required>
                <Select disabled={isScanning} name="protocol" defaultValue={defaultValues.protocol}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select protocol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="udp">UDP</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </Form.Field>
              
              <Form.Field name="server" label="Server" required>
                <Form.Input 
                  placeholder="localhost or IP address"
                  disabled={isScanning}
                />
              </Form.Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Form.Field name="timeout" label="Timeout (ms)" required>
                <Form.Input 
                  type="number" 
                  min="100" 
                  max="30000"
                  disabled={isScanning}
                />
              </Form.Field>
              
              <Form.Field name="concurrency" label="Concurrent Scans" required>
                <Form.Input 
                  type="number" 
                  min="1" 
                  max="100"
                  disabled={isScanning}
                />
              </Form.Field>
            </div>

            {/* Scan Controls */}
            <div className="flex gap-2">
              {canStartScan && (
                <Form.Submit loading={isScanning}>
                  <Play className="mr-2 h-4 w-4" />
                  Start Scan
                </Form.Submit>
              )}
              
              {isScanning && (
                <Button onClick={cancelScan} variant="outline">
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}
              
              {scanProgress.status !== 'idle' && !isScanning && (
                <Button onClick={resetScan} variant="outline">
                  Reset
                </Button>
              )}
            </div>
          </Form>

          {/* Progress Section */}
          {scanProgress.status !== 'idle' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {getStatusIcon()}
                <span className="text-sm font-medium">{getStatusText()}</span>
              </div>
              
              {scanProgress.total > 0 && (
                <Progress 
                  value={scanProgress.percentage} 
                  className="w-full" 
                />
              )}
            </div>
          )}

          {/* Results Section */}
          {scanResults && (
            <div className="space-y-4">
              <h4 className="font-medium">Scan Results</h4>
              
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {scanResults.summary.totalPorts}
                  </div>
                  <div className="text-sm text-gray-600">Total Scanned</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {scanResults.summary.availablePorts}
                  </div>
                  <div className="text-sm text-gray-600">Available</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {scanResults.summary.unavailablePorts}
                  </div>
                  <div className="text-sm text-gray-600">In Use</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {scanResults.summary.availabilityPercentage}%
                  </div>
                  <div className="text-sm text-gray-600">Available</div>
                </div>
              </div>

              {scanResults.summary.availabilityPercentage < 50 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Low port availability detected. Consider using a different port range or server.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleClose} variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}