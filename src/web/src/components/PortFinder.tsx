import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Search, Copy, Check } from 'lucide-react';
import { api } from '../lib/api';

interface PortFinderProps {
  onPortSelected?: (ports: number[]) => void;
  serviceType?: string;
  numPorts?: number;
  protocol?: string;
}

interface PortRecommendation {
  type: string;
  ports: number[];
  reason: string;
}

export function PortFinder({
  onPortSelected,
  serviceType: initialServiceType = 'web',
  numPorts = 1,
  protocol: initialProtocol = 'tcp'
}: PortFinderProps) {
  const [serviceType, setServiceType] = useState(initialServiceType);
  const [protocol, setProtocol] = useState(initialProtocol);
  const [portCount, setPortCount] = useState(numPorts);
  const [startPort, setStartPort] = useState('3000');
  const [endPort, setEndPort] = useState('9999');
  const [recommendations, setRecommendations] = useState<PortRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedPorts, setCopiedPorts] = useState<string | null>(null);

  const findPorts = async () => {
    setLoading(true);
    
    try {
      const response = await api.post('/ports/recommendations', {
        serviceType,
        protocol,
        portCount,
        preferredRange: {
          start: parseInt(startPort),
          end: parseInt(endPort)
        }
      });

      const data = response.data.data;
      const recs: PortRecommendation[] = [];

      if (data.serviceTypeSuggestions.length > 0) {
        recs.push({
          type: 'service_based',
          ports: data.serviceTypeSuggestions.slice(0, portCount),
          reason: `Recommended ports for ${serviceType} services`
        });
      }

      if (data.rangeSuggestions.length > 0) {
        recs.push({
          type: 'range_based',
          ports: data.rangeSuggestions.slice(0, portCount),
          reason: `Available ports in range ${startPort}-${endPort}`
        });
      }

      if (data.bestRecommendation) {
        recs.unshift({
          type: 'best',
          ports: data.bestRecommendation.ports.slice(0, portCount),
          reason: data.bestRecommendation.reason
        });
      }

      setRecommendations(recs);
    } catch (error) {
      console.error('Failed to get port recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyPorts = async (ports: number[]) => {
    const portsText = ports.join(', ');
    await navigator.clipboard.writeText(portsText);
    setCopiedPorts(portsText);
    setTimeout(() => setCopiedPorts(null), 2000);
  };

  const selectPorts = (ports: number[]) => {
    if (onPortSelected) {
      onPortSelected(ports);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Search className="h-4 w-4 mr-2" />
          Find Ports
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Port Finder</DialogTitle>
          <DialogDescription>
            Find available ports for your service based on type and preferences
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Configuration */}
          <div className="grid grid-cols-2 gap-4">
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

            <div>
              <Label htmlFor="protocol">Protocol</Label>
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

            <div>
              <Label htmlFor="portCount">Number of Ports</Label>
              <Input
                id="portCount"
                type="number"
                min="1"
                max="10"
                value={portCount}
                onChange={(e) => setPortCount(parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="flex space-x-2">
              <div className="flex-1">
                <Label htmlFor="startPort">Start Range</Label>
                <Input
                  id="startPort"
                  type="number"
                  value={startPort}
                  onChange={(e) => setStartPort(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="endPort">End Range</Label>
                <Input
                  id="endPort"
                  type="number"
                  value={endPort}
                  onChange={(e) => setEndPort(e.target.value)}
                />
              </div>
            </div>
          </div>

          <Button onClick={findPorts} disabled={loading} className="w-full">
            <Search className="h-4 w-4 mr-2" />
            Find Available Ports
          </Button>

          {/* Results */}
          {recommendations.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-medium">Available Port Recommendations</h3>
              {recommendations.map((rec, index) => (
                <Card key={index}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">
                        {rec.type === 'best' && '⭐ '}
                        {rec.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </CardTitle>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyPorts(rec.ports)}
                        >
                          {copiedPorts === rec.ports.join(', ') ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                        {onPortSelected && (
                          <Button
                            size="sm"
                            onClick={() => selectPorts(rec.ports)}
                          >
                            Use These
                          </Button>
                        )}
                      </div>
                    </div>
                    <CardDescription className="text-xs">
                      {rec.reason}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-2">
                      {rec.ports.map((port) => (
                        <Badge key={port} variant="secondary" className="font-mono">
                          {port}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {recommendations.length === 0 && !loading && (
            <div className="text-center py-8 text-muted-foreground">
              Click "Find Available Ports" to get recommendations
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PortFinder;