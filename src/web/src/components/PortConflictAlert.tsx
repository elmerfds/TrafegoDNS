import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, Lightbulb } from 'lucide-react';
import { api } from '../lib/api';
import { usePortStore } from '../store/portStore';

interface PortConflict {
  port: number;
  protocol: string;
  type: 'system_process' | 'reservation';
  description: string;
  severity: 'high' | 'medium' | 'low';
  conflictingContainer?: string;
  reservationExpires?: string;
}

interface ValidationResult {
  valid: boolean;
  conflicts: PortConflict[];
  warnings: Array<{
    type: string;
    message: string;
    ports?: number[];
  }>;
  suggestions?: Array<{
    type: string;
    ports: number[];
    reason: string;
  }>;
  message: string;
}

interface PortConflictAlertProps {
  deploymentConfig: {
    ports: number[];
    containerId?: string;
    containerName?: string;
    protocol?: string;
    serviceType?: string;
  };
  onValidationChange?: (isValid: boolean, result: ValidationResult) => void;
  showSuggestions?: boolean;
  autoValidate?: boolean;
}

export function PortConflictAlert({
  deploymentConfig,
  onValidationChange,
  showSuggestions = true,
  autoValidate = true
}: PortConflictAlertProps) {
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  
  // Access Zustand store for port suggestions
  const { suggestAlternativePorts } = usePortStore();

  useEffect(() => {
    if (autoValidate && deploymentConfig.ports.length > 0) {
      validateDeployment();
    }
  }, [deploymentConfig, autoValidate]);

  const validateDeployment = async () => {
    setLoading(true);
    
    try {
      const response = await api.post('/ports/validate-deployment', deploymentConfig);
      const result = response.data.data;
      
      setValidationResult(result);
      
      if (onValidationChange) {
        onValidationChange(result.valid, result);
      }

      // Get suggestions if there are conflicts
      if (!result.valid && showSuggestions) {
        await getSuggestions();
      }
    } catch (error: any) {
      const errorResult: ValidationResult = {
        valid: false,
        conflicts: [],
        warnings: [],
        message: error.response?.data?.message || 'Validation failed'
      };
      
      setValidationResult(errorResult);
      
      if (onValidationChange) {
        onValidationChange(false, errorResult);
      }
    } finally {
      setLoading(false);
    }
  };

  const getSuggestions = async () => {
    try {
      // Use Zustand store for port suggestions
      await suggestAlternativePorts({
        ports: deploymentConfig.ports,
        protocol: deploymentConfig.protocol || 'tcp',
        serviceType: deploymentConfig.serviceType,
        maxSuggestions: 5
      });
      
      // Note: The actual suggestions would be retrieved from the store state
      // This is just a placeholder for the integration
    } catch (error) {
      console.error('Failed to get port suggestions:', error);
    }
  };

  const getConflictSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'medium':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-blue-500" />;
    }
  };

  const getConflictSeverityVariant = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      default:
        return 'secondary';
    }
  };

  if (loading) {
    return (
      <Alert>
        <RefreshCw className="h-4 w-4 animate-spin" />
        <AlertDescription>Validating port configuration...</AlertDescription>
      </Alert>
    );
  }

  if (!validationResult) {
    return null;
  }

  if (validationResult.valid) {
    return (
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          {validationResult.message}
          {validationResult.warnings && validationResult.warnings.length > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 ml-2 text-green-700"
              onClick={() => setShowDetails(true)}
            >
              View warnings
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {validationResult.message}
          {validationResult.conflicts.length > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 ml-2 text-red-700"
              onClick={() => setShowDetails(true)}
            >
              View details
            </Button>
          )}
        </AlertDescription>
      </Alert>

      {/* Quick conflict summary */}
      {validationResult.conflicts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {validationResult.conflicts.map((conflict, index) => (
            <Badge
              key={index}
              variant={getConflictSeverityVariant(conflict.severity)}
              className="flex items-center gap-1"
            >
              {getConflictSeverityIcon(conflict.severity)}
              Port {conflict.port}
            </Badge>
          ))}
        </div>
      )}

      {/* Suggestions preview */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Suggested Alternatives
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {suggestions.slice(0, 3).map((suggestion, index) => (
                <div key={index} className="text-sm">
                  {suggestion.type === 'sequential' ? (
                    <Badge variant="outline" className="font-mono">
                      {suggestion.suggestedPorts.join(', ')}
                    </Badge>
                  ) : (
                    suggestion.alternatives.slice(0, 3).map((alt: number) => (
                      <Badge key={alt} variant="outline" className="font-mono mr-1">
                        {alt}
                      </Badge>
                    ))
                  )}
                </div>
              ))}
              {suggestions.length > 3 && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => setShowDetails(true)}
                >
                  +{suggestions.length - 3} more
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Port Validation Details</DialogTitle>
            <DialogDescription>
              Detailed information about port conflicts and suggestions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Conflicts */}
            {validationResult.conflicts.length > 0 && (
              <div>
                <h3 className="font-medium mb-3">Port Conflicts</h3>
                <div className="space-y-3">
                  {validationResult.conflicts.map((conflict, index) => (
                    <div key={index} className="p-3 border rounded space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getConflictSeverityIcon(conflict.severity)}
                          <span className="font-mono text-sm">
                            {conflict.port}/{conflict.protocol}
                          </span>
                          <Badge variant={getConflictSeverityVariant(conflict.severity)}>
                            {conflict.type.replace('_', ' ')}
                          </Badge>
                        </div>
                        <Badge variant="outline">{conflict.severity}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {conflict.description}
                      </p>
                      {conflict.conflictingContainer && (
                        <p className="text-xs text-muted-foreground">
                          Conflicting container: {conflict.conflictingContainer}
                        </p>
                      )}
                      {conflict.reservationExpires && (
                        <p className="text-xs text-muted-foreground">
                          Reservation expires: {new Date(conflict.reservationExpires).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {validationResult.warnings && validationResult.warnings.length > 0 && (
              <div>
                <h3 className="font-medium mb-3">Warnings</h3>
                <div className="space-y-2">
                  {validationResult.warnings.map((warning, index) => (
                    <Alert key={index}>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        {warning.message}
                        {warning.ports && (
                          <span className="ml-2 font-mono text-xs">
                            ({warning.ports.join(', ')})
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}

            {/* Detailed suggestions */}
            {suggestions.length > 0 && (
              <div>
                <h3 className="font-medium mb-3">Alternative Port Suggestions</h3>
                <div className="space-y-3">
                  {suggestions.map((suggestion, index) => (
                    <div key={index} className="p-3 border rounded">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">{suggestion.type || 'alternative'}</Badge>
                        {suggestion.reason && (
                          <span className="text-xs text-muted-foreground">
                            {suggestion.reason}
                          </span>
                        )}
                      </div>
                      
                      {suggestion.type === 'sequential' ? (
                        <div>
                          <p className="text-sm mb-1">Sequential ports:</p>
                          <div className="flex flex-wrap gap-1">
                            {suggestion.suggestedPorts.map((port: number) => (
                              <Badge key={port} variant="secondary" className="font-mono">
                                {port}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm mb-1">
                            Alternatives for port {suggestion.originalPort}:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {suggestion.alternatives.map((alt: number) => (
                              <Badge key={alt} variant="secondary" className="font-mono">
                                {alt}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setShowDetails(false)}>
              Close
            </Button>
            <Button onClick={validateDeployment} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-validate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PortConflictAlert;