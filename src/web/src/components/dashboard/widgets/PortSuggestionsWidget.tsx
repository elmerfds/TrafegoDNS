/**
 * Port Suggestions Widget
 * Generates available port suggestions for different service types
 */

import React, { useState, useEffect } from 'react'
import { Eye, RefreshCw, Copy, CheckCircle, Search } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { api } from '@/lib/api'
import { createResponsiveSizes } from '@/lib/responsiveUtils'
import { cn } from '@/lib/utils'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface PortSuggestion {
  port: number
  reason: string
  available: boolean
  service?: string
  container?: string
  isRecommended?: boolean
}

const serviceTypes = [
  { value: 'web', label: 'Web Server', range: [3000, 8999] },
  { value: 'api', label: 'API Service', range: [4000, 5999] },
  { value: 'database', label: 'Database', range: [5432, 5499] },
  { value: 'cache', label: 'Cache/Redis', range: [6379, 6399] },
  { value: 'monitoring', label: 'Monitoring', range: [9000, 9999] },
  { value: 'custom', label: 'Custom Range', range: [10000, 65535] }
]

// Storage keys for persistence
const STORAGE_KEYS = {
  SERVICE_TYPE: 'port-generator-service-type',
  SUGGESTIONS: 'port-generator-suggestions',
  CUSTOM_PORT: 'port-generator-custom-port',
  TIMESTAMP: 'port-generator-timestamp'
}

// Cache duration: 5 minutes
const CACHE_DURATION = 5 * 60 * 1000

export function PortSuggestionsWidget(props: WidgetProps) {
  const { toast } = useToast()
  const [serviceType, setServiceType] = useState('web')
  const [suggestions, setSuggestions] = useState<PortSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [copiedPort, setCopiedPort] = useState<number | null>(null)
  const [customPort, setCustomPort] = useState('')
  const [checkingCustom, setCheckingCustom] = useState(false)
  const [isLoadedFromCache, setIsLoadedFromCache] = useState(false)
  const { displayMode = 'normal', currentBreakpoint = 'lg', layout } = props
  const isMobile = currentBreakpoint === 'xs'
  
  // Get current widget height from layout for dynamic sizing
  const currentHeight = layout?.h || 4

  // Load persisted state on component mount
  useEffect(() => {
    try {
      // Load service type
      const savedServiceType = localStorage.getItem(STORAGE_KEYS.SERVICE_TYPE)
      if (savedServiceType) {
        setServiceType(savedServiceType)
      }

      // Load custom port
      const savedCustomPort = localStorage.getItem(STORAGE_KEYS.CUSTOM_PORT)
      if (savedCustomPort) {
        setCustomPort(savedCustomPort)
      }

      // Load suggestions if they're not too old
      const savedTimestamp = localStorage.getItem(STORAGE_KEYS.TIMESTAMP)
      const savedSuggestions = localStorage.getItem(STORAGE_KEYS.SUGGESTIONS)
      
      if (savedTimestamp && savedSuggestions) {
        const timestamp = parseInt(savedTimestamp)
        const now = Date.now()
        
        if (now - timestamp < CACHE_DURATION) {
          try {
            const parsedSuggestions = JSON.parse(savedSuggestions)
            if (Array.isArray(parsedSuggestions)) {
              setSuggestions(parsedSuggestions)
              setIsLoadedFromCache(true)
            }
          } catch (parseError) {
            console.warn('Failed to parse saved suggestions:', parseError)
            // Clear invalid data
            localStorage.removeItem(STORAGE_KEYS.SUGGESTIONS)
            localStorage.removeItem(STORAGE_KEYS.TIMESTAMP)
          }
        } else {
          // Cache expired, clear it
          localStorage.removeItem(STORAGE_KEYS.SUGGESTIONS)
          localStorage.removeItem(STORAGE_KEYS.TIMESTAMP)
        }
      }
    } catch (error) {
      console.warn('Failed to load persisted state:', error)
    }
  }, [])

  // Persist service type changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SERVICE_TYPE, serviceType)
    } catch (error) {
      console.warn('Failed to persist service type:', error)
    }
  }, [serviceType])

  // Persist custom port changes
  useEffect(() => {
    try {
      if (customPort) {
        localStorage.setItem(STORAGE_KEYS.CUSTOM_PORT, customPort)
      } else {
        localStorage.removeItem(STORAGE_KEYS.CUSTOM_PORT)
      }
    } catch (error) {
      console.warn('Failed to persist custom port:', error)
    }
  }, [customPort])

  // Persist suggestions changes
  useEffect(() => {
    try {
      if (suggestions.length > 0) {
        localStorage.setItem(STORAGE_KEYS.SUGGESTIONS, JSON.stringify(suggestions))
        localStorage.setItem(STORAGE_KEYS.TIMESTAMP, Date.now().toString())
      }
    } catch (error) {
      console.warn('Failed to persist suggestions:', error)
    }
  }, [suggestions])
  
  // Calculate how many items to show based on widget size
  const getMaxItems = () => {
    if (displayMode === 'compact') return 3
    if (currentBreakpoint === 'lg') return 10  // More items on larger screens
    if (currentBreakpoint === 'md') return 6
    return 4
  }

  // Clear cached data
  const clearCache = () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.SUGGESTIONS)
      localStorage.removeItem(STORAGE_KEYS.TIMESTAMP)
      setIsLoadedFromCache(false)
    } catch (error) {
      console.warn('Failed to clear cache:', error)
    }
  }

  const generateSuggestions = async () => {
    setLoading(true)
    setIsLoadedFromCache(false) // Clear cache flag when generating new suggestions
    try {
      const selectedService = serviceTypes.find(s => s.value === serviceType)
      if (!selectedService) return

      // First try to get real suggestions from the API
      try {
        const response = await api.post('/ports/suggest', {
          serviceType,
          count: 10, // Request more to filter available ones
          range: selectedService.range
        })

        const apiSuggestions = response.data.suggestions || response.data.data?.suggestions || []
        
        if (Array.isArray(apiSuggestions) && apiSuggestions.length > 0) {
          setSuggestions(apiSuggestions.slice(0, 5)) // Take first 5 suggestions
          return
        }
      } catch (apiError) {
        console.warn('Port suggestion API failed, checking availability manually:', apiError)
      }

      // Fallback: Generate smart suggestions and check their availability
      const smartSuggestions = await generateSmartSuggestions(selectedService.range as [number, number])
      setSuggestions(smartSuggestions)
      
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

  const generateSmartSuggestions = async (range: [number, number]): Promise<PortSuggestion[]> => {
    const [min, max] = range
    const suggestions: PortSuggestion[] = []
    
    // Service-specific recommended ports
    const serviceRecommendations = {
      web: [3000, 3001, 8000, 8080, 8081, 8082, 8083, 8084],
      api: [4000, 4001, 4002, 5000, 5001, 5002, 5003, 5004],
      database: [5432, 5433, 3306, 3307, 27017, 27018],
      cache: [6379, 6380, 11211, 11212],
      monitoring: [9000, 9001, 9090, 9091, 9100, 9200],
      custom: [10000, 10001, 10002, 10003, 10004, 10005]
    }
    
    const recommendedPorts = serviceRecommendations[serviceType as keyof typeof serviceRecommendations] || []
    
    // Check recommended ports first
    for (const port of recommendedPorts.slice(0, 3)) {
      if (port >= min && port <= max) {
        try {
          const response = await api.get(`/ports/check/${port}`)
          const available = response.data.data?.available ?? true
          
          suggestions.push({
            port,
            reason: available ? `Recommended for ${serviceTypes.find(s => s.value === serviceType)?.label}` : 'Recommended port (currently in use)',
            available,
            service: available ? undefined : response.data.data?.service,
            container: available ? undefined : response.data.data?.container,
            isRecommended: true
          })
        } catch {
          // If check fails, assume available
          suggestions.push({
            port,
            reason: `Recommended for ${serviceTypes.find(s => s.value === serviceType)?.label}`,
            available: true,
            isRecommended: true
          })
        }
      }
    }
    
    // Generate additional suggestions from the range
    const additionalPorts: number[] = []
    let attempts = 0
    
    while (additionalPorts.length < 5 && attempts < 20) {
      const port = Math.floor(Math.random() * (max - min + 1)) + min
      
      // Skip if already in recommendations or already added
      if (!recommendedPorts.includes(port) && !additionalPorts.includes(port)) {
        additionalPorts.push(port)
      }
      attempts++
    }
    
    // Check availability of additional ports
    for (const port of additionalPorts) {
      try {
        const response = await api.get(`/ports/check/${port}`)
        const available = response.data.data?.available ?? true
        
        suggestions.push({
          port,
          reason: available ? `Available in ${serviceTypes.find(s => s.value === serviceType)?.label} range` : 'Port currently in use',
          available,
          service: available ? undefined : response.data.data?.service,
          container: available ? undefined : response.data.data?.container,
          isRecommended: false
        })
      } catch {
        // If check fails, assume available
        suggestions.push({
          port,
          reason: `Available in ${serviceTypes.find(s => s.value === serviceType)?.label} range`,
          available: true,
          isRecommended: false
        })
      }
    }
    
    // Sort: available recommended first, then available others, then unavailable
    return suggestions.sort((a, b) => {
      if (a.available && !b.available) return -1
      if (!a.available && b.available) return 1
      if (a.isRecommended && !b.isRecommended) return -1
      if (!a.isRecommended && b.isRecommended) return 1
      return a.port - b.port
    }).slice(0, 8) // Return top 8 suggestions
  }

  const checkCustomPort = async () => {
    setIsLoadedFromCache(false) // Clear cache flag when checking custom port
    if (!customPort || isNaN(Number(customPort))) {
      toast({
        title: 'Invalid Port',
        description: 'Please enter a valid port number',
        variant: 'destructive'
      })
      return
    }

    const portNum = Number(customPort)
    if (portNum < 1 || portNum > 65535) {
      toast({
        title: 'Invalid Port Range',
        description: 'Port must be between 1 and 65535',
        variant: 'destructive'
      })
      return
    }

    setCheckingCustom(true)
    try {
      // Check the requested port
      const response = await api.get(`/ports/check/${portNum}`)
      const available = response.data.data?.available ?? true
      const service = response.data.data?.service
      const container = response.data.data?.container

      if (available) {
        // Port is available - show it as the main suggestion
        setSuggestions([{
          port: portNum,
          reason: 'Your requested port is available!',
          available: true,
          isRecommended: true
        }])
        
        toast({
          title: 'Port Available!',
          description: `Port ${portNum} is free to use`,
        })
      } else {
        // Port is not available - find alternatives
        toast({
          title: 'Port Not Available',
          description: `Port ${portNum} is in use${service ? ` by ${service}` : ''}. Finding alternatives...`,
          variant: 'destructive'
        })

        // Find the best alternatives
        const alternatives = await findPortAlternatives(portNum, service, container)
        setSuggestions(alternatives)
        
        // Show success message with found alternatives
        const availableAlternatives = alternatives.filter(alt => alt.available)
        if (availableAlternatives.length > 0) {
          const nextPort = availableAlternatives[0]?.port
          toast({
            title: 'Alternatives Found',
            description: `Found ${availableAlternatives.length} available ports. Next available: ${nextPort}`,
          })
        }
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to check port availability',
        variant: 'destructive'
      })
    } finally {
      setCheckingCustom(false)
    }
  }

  const findPortAlternatives = async (requestedPort: number, occupyingService?: string, occupyingContainer?: string): Promise<PortSuggestion[]> => {
    const alternatives: PortSuggestion[] = []
    
    // Add the requested port (unavailable) for reference
    alternatives.push({
      port: requestedPort,
      reason: 'Your requested port (currently in use)',
      available: false,
      service: occupyingService,
      container: occupyingContainer,
      isRecommended: false
    })

    // First, find the immediate next available port
    let nextAvailablePort: number | null = null
    for (let port = requestedPort + 1; port <= Math.min(requestedPort + 50, 65535); port++) {
      try {
        const response = await api.get(`/ports/check/${port}`)
        const available = response.data.data?.available ?? true
        if (available) {
          nextAvailablePort = port
          break
        }
      } catch {
        // If check fails, assume available
        nextAvailablePort = port
        break
      }
    }

    // Add the immediate next available port as top recommendation
    if (nextAvailablePort) {
      alternatives.push({
        port: nextAvailablePort,
        reason: `Next available port after ${requestedPort}`,
        available: true,
        isRecommended: true
      })
    }

    // Find additional alternatives around the requested port
    const searchRanges = [
      // Try ports close to the requested port first (but skip the next immediate one we already found)
      [requestedPort + (nextAvailablePort ? nextAvailablePort + 1 : 2), requestedPort + 20],
      [Math.max(1, requestedPort - 20), requestedPort - 1],
      // Then try increments of 10
      [requestedPort + 10, requestedPort + 30],
      [Math.max(1, requestedPort - 30), requestedPort - 10]
    ]

    let foundAlternatives = nextAvailablePort ? 1 : 0 // Count the next available port we already found
    const maxAlternatives = 7

    for (const [start, end] of searchRanges) {
      if (foundAlternatives >= maxAlternatives) break

      for (let port = start; port <= end && port <= 65535 && foundAlternatives < maxAlternatives; port++) {
        if (port === requestedPort || port === nextAvailablePort) continue // Skip the original port and already found next port

        try {
          const response = await api.get(`/ports/check/${port}`)
          const available = response.data.data?.available ?? true

          if (available) {
            alternatives.push({
              port,
              reason: `Alternative to ${requestedPort} (+${port - requestedPort})`,
              available: true,
              isRecommended: port <= requestedPort + 10 || port >= requestedPort - 10 // Mark close ports as recommended
            })
            foundAlternatives++
          }
        } catch {
          // If check fails, assume available and add it
          alternatives.push({
            port,
            reason: `Alternative to ${requestedPort} (+${port - requestedPort}, likely available)`,
            available: true,
            isRecommended: port <= requestedPort + 10 || port >= requestedPort - 10
          })
          foundAlternatives++
        }
      }
    }

    // If we couldn't find enough alternatives in nearby ranges, 
    // add some from the service type range
    if (foundAlternatives < 3) {
      const selectedService = serviceTypes.find(s => s.value === serviceType)
      if (selectedService) {
        const [min, max] = selectedService.range
        const additionalSuggestions = await generateSmartSuggestions([min, max])
        
        // Add available suggestions that we haven't already included
        for (const suggestion of additionalSuggestions) {
          if (foundAlternatives >= maxAlternatives) break
          if (!alternatives.some(alt => alt.port === suggestion.port) && suggestion.available) {
            alternatives.push({
              ...suggestion,
              reason: `Alternative in ${selectedService.label} range`
            })
            foundAlternatives++
          }
        }
      }
    }

    return alternatives
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

  const getStatusColor = (suggestion: PortSuggestion) => {
    if (suggestion.available) {
      return suggestion.isRecommended 
        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
    } else {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    }
  }

  const getStatusText = (suggestion: PortSuggestion) => {
    if (suggestion.available) {
      return suggestion.isRecommended ? 'Recommended' : 'Available'
    } else {
      return 'In Use'
    }
  }

  return (
    <WidgetBase
      {...props}
      title="Port Generator"
      icon={Eye}
      description="Generate available port suggestions"
      widgetDefinition={props.widgetDefinition}
      enableDynamicSizing={true}
      currentHeight={currentHeight}
      onSizeChange={props.onSizeChange}
    >
      <div className="flex flex-col h-full space-y-3">
        {/* Service Type and Custom Port in a compact layout */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Service Type</label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger className="h-8">
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
            <div>
              <label className="text-xs font-medium text-muted-foreground">Check Port</label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  placeholder="Port"
                  value={customPort}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomPort(e.target.value)}
                  onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && checkCustomPort()}
                  min="1"
                  max="65535"
                  className="h-8 text-xs [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                />
                <Button 
                  onClick={checkCustomPort} 
                  disabled={checkingCustom || !customPort}
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                >
                  {checkingCustom ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Search className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Generate Button - more compact */}
        <div className="flex gap-2">
          <Button 
            onClick={generateSuggestions} 
            disabled={loading}
            className="flex-1 h-8"
            size="sm"
          >
            {loading ? (
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Eye className="h-3 w-3 mr-1" />
            )}
            Generate Suggestions
          </Button>
          {isLoadedFromCache && (
            <Button 
              onClick={() => {
                clearCache()
                generateSuggestions()
              }}
              disabled={loading}
              variant="outline"
              size="sm"
              title="Refresh cached data"
              className="h-8 w-8 p-0"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Suggestions List - more compact */}
        {suggestions.length > 0 ? (
          <div className="flex-1 space-y-2 overflow-y-auto min-h-0">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-muted-foreground">
                Suggested Ports
              </h4>
              <div className="flex items-center gap-1">
                {isLoadedFromCache && (
                  <Badge variant="outline" className="text-xs h-5 px-1">
                    Cached
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs h-5 px-1">
                  Live
                </Badge>
              </div>
            </div>
            <div className="space-y-1">
              {suggestions.slice(0, getMaxItems()).map((suggestion) => (
                <div
                  key={suggestion.port}
                  className="flex items-center justify-between p-2 bg-muted/30 rounded border border-muted/50 hover:border-muted"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <span className="font-mono font-bold text-sm">
                      {suggestion.port}
                    </span>
                    <Badge 
                      variant="outline" 
                      className={cn(getStatusColor(suggestion), "text-xs h-4 px-1")}
                    >
                      {suggestion.available ? (suggestion.isRecommended ? 'Rec' : 'Avail') : 'Used'}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate">
                      {suggestion.reason.length > 30 ? `${suggestion.reason.substring(0, 30)}...` : suggestion.reason}
                    </span>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyPort(suggestion.port)}
                    className="h-6 w-6 p-0 ml-1"
                  >
                    {copiedPort === suggestion.port ? (
                      <CheckCircle className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground py-4">
            <Eye className="h-6 w-6 mb-1 opacity-50" />
            <p className="text-xs">No suggestions yet</p>
          </div>
        )}

        {/* Quick Generate for Common Services - dynamic spacing */}
        <div className={cn(
          "border-t border-muted/50 pt-2",
          suggestions.length === 0 ? "mt-4" : "mt-2"
        )}>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">Quick Generate</h4>
          <div className="flex gap-1">
            {serviceTypes.slice(0, 4).map(service => (
              <Button
                key={service.value}
                variant="outline"
                size="sm"
                onClick={() => {
                  setServiceType(service.value)
                  setTimeout(() => generateSuggestions(), 100)
                }}
                className="text-xs h-6 px-2 flex-1"
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
  defaultSize: createResponsiveSizes({ w: 6, h: 6 }), // Medium preset: min + 4 width, min + 2 height
  minSize: createResponsiveSizes({ w: 4, h: 4 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 1.0 }),
  maxSize: createResponsiveSizes({ w: 12, h: 12 }),
  responsiveDisplay: {
    lg: 'detailed',
    md: 'normal',
    sm: 'compact',
    xs: 'compact'
  }
}