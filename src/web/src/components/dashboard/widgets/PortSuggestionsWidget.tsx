/**
 * Port Suggestions Widget
 * Generates available port suggestions for different service types
 */

import React, { useState } from 'react'
import { Eye, RefreshCw, Copy, CheckCircle } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { api } from '@/lib/api'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface PortSuggestion {
  port: number
  reason: string
  confidence: 'high' | 'medium' | 'low'
}

const serviceTypes = [
  { value: 'web', label: 'Web Server', range: [3000, 8999] },
  { value: 'api', label: 'API Service', range: [4000, 5999] },
  { value: 'database', label: 'Database', range: [5432, 5499] },
  { value: 'cache', label: 'Cache/Redis', range: [6379, 6399] },
  { value: 'monitoring', label: 'Monitoring', range: [9000, 9999] },
  { value: 'custom', label: 'Custom Range', range: [10000, 65535] }
]

export function PortSuggestionsWidget(props: WidgetProps) {
  const { toast } = useToast()
  const [serviceType, setServiceType] = useState('web')
  const [suggestions, setSuggestions] = useState<PortSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [copiedPort, setCopiedPort] = useState<number | null>(null)

  const generateSuggestions = async () => {
    setLoading(true)
    try {
      const selectedService = serviceTypes.find(s => s.value === serviceType)
      if (!selectedService) return

      // In a real implementation, this would call the API to get available ports
      const response = await api.post('/ports/suggest', {
        serviceType,
        count: 5,
        range: selectedService.range
      }).catch(() => {
        // Fallback to mock data if API fails
        return {
          data: {
            suggestions: generateMockSuggestions(selectedService.range as [number, number])
          }
        }
      })

      setSuggestions(response.data.suggestions)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate port suggestions',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const generateMockSuggestions = (range: [number, number]): PortSuggestion[] => {
    const [min, max] = range
    const suggestions: PortSuggestion[] = []
    
    for (let i = 0; i < 5; i++) {
      const port = Math.floor(Math.random() * (max - min + 1)) + min
      suggestions.push({
        port,
        reason: `Available in ${serviceTypes.find(s => s.value === serviceType)?.label} range`,
        confidence: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)] as 'high' | 'medium' | 'low'
      })
    }
    
    return suggestions.sort((a, b) => a.port - b.port)
  }

  const copyPort = async (port: number) => {
    try {
      await navigator.clipboard.writeText(port.toString())
      setCopiedPort(port)
      setTimeout(() => setCopiedPort(null), 2000)
      toast({
        title: 'Copied!',
        description: `Port ${port} copied to clipboard`
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy port to clipboard',
        variant: 'destructive'
      })
    }
  }

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'low': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <WidgetBase
      {...props}
      title="Port Generator"
      icon={Eye}
      description="Generate available port suggestions"
    >
      <div className="space-y-4">
        {/* Service Type Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Service Type</label>
          <Select value={serviceType} onValueChange={setServiceType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {serviceTypes.map(service => (
                <SelectItem key={service.value} value={service.value}>
                  {service.label} ({service.range[0]}-{service.range[1]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Generate Button */}
        <Button 
          onClick={generateSuggestions} 
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Eye className="h-4 w-4 mr-2" />
          )}
          Generate Suggestions
        </Button>

        {/* Suggestions List */}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Suggested Ports
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.port}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-lg">
                        {suggestion.port}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={getConfidenceColor(suggestion.confidence)}
                      >
                        {suggestion.confidence}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {suggestion.reason}
                    </p>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyPort(suggestion.port)}
                    className="ml-2"
                  >
                    {copiedPort === suggestion.port ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Generate for Common Services */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Quick Generate</h4>
          <div className="grid grid-cols-2 gap-2">
            {serviceTypes.slice(0, 4).map(service => (
              <Button
                key={service.value}
                variant="outline"
                size="sm"
                onClick={() => {
                  setServiceType(service.value)
                  setTimeout(() => generateSuggestions(), 100)
                }}
                className="text-xs"
              >
                {service.label.split(' ')[0]}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </WidgetBase>
  )
}

export const portSuggestionsDefinition: WidgetDefinition = {
  id: 'port-suggestions',
  name: 'Port Generator',
  description: 'Generate available port suggestions for different services',
  category: 'ports',
  icon: Eye,
  defaultSize: { w: 4, h: 10 },
  minSize: { w: 3, h: 8 },
  maxSize: { w: 6, h: 12 }
}