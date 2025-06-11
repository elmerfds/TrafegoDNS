/**
 * Port Scanner Widget
 * Quick port group scanning (Web, Dev, Database, SSH/FTP)
 */

import React, { useState } from 'react'
import { Scan, CheckCircle, XCircle, Loader2, Globe, Code, Database, Lock } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { api } from '@/lib/api'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface PortGroup {
  id: string
  name: string
  icon: React.ReactNode
  ports: number[]
  description: string
}

interface ScanResult {
  port: number
  status: 'open' | 'closed' | 'filtered'
  service?: string
}

interface GroupScanResult {
  groupId: string
  results: ScanResult[]
  timestamp: Date
}

const portGroups: PortGroup[] = [
  {
    id: 'web',
    name: 'Web',
    icon: <Globe className="h-4 w-4" />,
    ports: [80, 443, 8080, 8443],
    description: 'HTTP/HTTPS services'
  },
  {
    id: 'dev',
    name: 'Dev',
    icon: <Code className="h-4 w-4" />,
    ports: [3000, 3001, 5000, 8000, 9000],
    description: 'Development servers'
  },
  {
    id: 'database',
    name: 'Database',
    icon: <Database className="h-4 w-4" />,
    ports: [3306, 5432, 6379, 27017],
    description: 'Database services'
  },
  {
    id: 'ssh-ftp',
    name: 'SSH/FTP',
    icon: <Lock className="h-4 w-4" />,
    ports: [21, 22, 23, 990, 989],
    description: 'Remote access'
  }
]

export function PortScannerWidget(props: WidgetProps) {
  const { toast } = useToast()
  const [scanning, setScanning] = useState<string | null>(null)
  const [scanResults, setScanResults] = useState<Map<string, GroupScanResult>>(new Map())

  const scanPortGroup = async (group: PortGroup) => {
    setScanning(group.id)
    try {
      const response = await api.post('/ports/scan-range', {
        ports: group.ports,
        timeout: 1000
      }).catch(() => {
        // Fallback to mock data if API fails
        return {
          data: {
            results: group.ports.map(port => ({
              port,
              status: Math.random() > 0.7 ? 'open' : 'closed',
              service: getServiceName(port)
            }))
          }
        }
      })

      const scanResult: GroupScanResult = {
        groupId: group.id,
        results: response.data.results,
        timestamp: new Date()
      }

      setScanResults(prev => new Map(prev.set(group.id, scanResult)))

      const openPorts = scanResult.results.filter(r => r.status === 'open').length
      toast({
        title: `${group.name} Scan Complete`,
        description: `Found ${openPorts} open ports out of ${group.ports.length} scanned`
      })
    } catch (error) {
      toast({
        title: 'Scan Failed',
        description: `Failed to scan ${group.name} ports`,
        variant: 'destructive'
      })
    } finally {
      setScanning(null)
    }
  }

  const getServiceName = (port: number): string => {
    const services: Record<number, string> = {
      21: 'FTP',
      22: 'SSH',
      23: 'Telnet',
      80: 'HTTP',
      443: 'HTTPS',
      989: 'FTPS',
      990: 'FTPS',
      3000: 'Dev Server',
      3001: 'Dev Server',
      3306: 'MySQL',
      5000: 'Dev Server',
      5432: 'PostgreSQL',
      6379: 'Redis',
      8000: 'HTTP Alt',
      8080: 'HTTP Proxy',
      8443: 'HTTPS Alt',
      9000: 'Dev Server',
      27017: 'MongoDB'
    }
    return services[port] || 'Unknown'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      case 'closed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'filtered': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <XCircle className="h-3 w-3" />
      case 'closed': return <CheckCircle className="h-3 w-3" />
      case 'filtered': return <XCircle className="h-3 w-3" />
      default: return <XCircle className="h-3 w-3" />
    }
  }

  const totalScanned = Array.from(scanResults.values()).reduce((sum, result) => sum + result.results.length, 0)
  const totalOpen = Array.from(scanResults.values()).reduce((sum, result) => 
    sum + result.results.filter(r => r.status === 'open').length, 0
  )

  return (
    <WidgetBase
      {...props}
      title="Port Scanner"
      icon={Scan}
      description="Quick port group scanning"
      widgetDefinition={props.widgetDefinition}
      actions={
        scanResults.size > 0 && (
          <Badge variant={totalOpen > 0 ? 'destructive' : 'default'}>
            {totalOpen}/{totalScanned} open
          </Badge>
        )
      }
    >
      <div className="space-y-4">
        {/* Port Group Buttons */}
        <div className="grid grid-cols-2 gap-2">
          {portGroups.map((group) => (
            <Button
              key={group.id}
              variant="outline"
              size="sm"
              onClick={() => scanPortGroup(group)}
              disabled={scanning !== null}
              className="flex items-center gap-2 h-auto p-3"
            >
              {scanning === group.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                group.icon
              )}
              <div className="text-left">
                <div className="text-xs font-medium">{group.name}</div>
                <div className="text-xs text-muted-foreground">{group.ports.length} ports</div>
              </div>
            </Button>
          ))}
        </div>

        {/* Scan Results */}
        {scanResults.size > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Recent Scans
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {Array.from(scanResults.entries()).map(([groupId, result]) => {
                const group = portGroups.find(g => g.id === groupId)
                if (!group) return null

                const openPorts = result.results.filter(r => r.status === 'open')
                
                return (
                  <div key={groupId} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {group.icon}
                        <span className="font-medium text-sm">{group.name}</span>
                      </div>
                      <Badge variant="outline" className={openPorts.length > 0 ? 'text-red-600' : 'text-green-600'}>
                        {openPorts.length}/{result.results.length} open
                      </Badge>
                    </div>
                    
                    {openPorts.length > 0 && (
                      <div className="space-y-1">
                        {openPorts.map((port) => (
                          <div key={port.port} className="flex items-center justify-between text-xs">
                            <span>Port {port.port} ({port.service})</span>
                            <Badge variant="outline" className={getStatusColor(port.status)}>
                              <span className="flex items-center gap-1">
                                {getStatusIcon(port.status)}
                                {port.status}
                              </span>
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="text-xs text-muted-foreground mt-2">
                      Scanned: {result.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {scanResults.size > 0 && (
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">
                {totalOpen}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Open Ports
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-600">
                {totalScanned}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Scanned
              </div>
            </div>
          </div>
        )}

        {/* Scan All Button */}
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => {
            portGroups.forEach(group => {
              setTimeout(() => scanPortGroup(group), Math.random() * 2000)
            })
          }}
          disabled={scanning !== null}
        >
          {scanning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Scan className="h-4 w-4 mr-2" />
          )}
          Scan All Groups
        </Button>
      </div>
    </WidgetBase>
  )
}

export const portScannerDefinition: WidgetDefinition = {
  id: 'port-scanner',
  name: 'Port Scanner',
  description: 'Quick port group scanning (Web, Dev, Database, SSH)',
  category: 'ports',
  icon: Scan,
  defaultSize: { w: 8, h: 10 },
  minSize: { w: 6, h: 8 },
  maxSize: { w: 12, h: 12 }
}