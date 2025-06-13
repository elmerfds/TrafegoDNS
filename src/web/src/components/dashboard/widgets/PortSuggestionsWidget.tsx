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

    // Find alternatives around the requested port
    const searchRanges = [
      // Try ports close to the requested port first
      [requestedPort + 1, requestedPort + 10],
      [Math.max(1, requestedPort - 10), requestedPort - 1],
      // Then try common alternative patterns
      [requestedPort + 100, requestedPort + 110],
      [Math.max(1, requestedPort - 100), requestedPort - 90]
    ]

    let foundAlternatives = 0
    const maxAlternatives = 6

    for (const [start, end] of searchRanges) {
      if (foundAlternatives >= maxAlternatives) break

      for (let port = start; port <= end && port <= 65535 && foundAlternatives < maxAlternatives; port++) {
        if (port === requestedPort) continue // Skip the original port

        try {
          const response = await api.get(`/ports/check/${port}`)
          const available = response.data.data?.available ?? true

          if (available) {
            alternatives.push({
              port,
              reason: `Alternative to ${requestedPort} (available)`,
              available: true,
              isRecommended: true
            })
            foundAlternatives++
          }
        } catch {
          // If check fails, assume available and add it
          alternatives.push({
            port,
            reason: `Alternative to ${requestedPort} (likely available)`,
            available: true,
            isRecommended: true
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
      <div className="flex flex-col h-full">
        {/* Service Type Selection */}
        <div className="space-y-2 mb-3">
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

        {/* Custom Port Check */}
        <div className="space-y-2 mb-3">
          <label className="text-sm font-medium">Check Specific Port (Optional)</label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Enter port number"
              value={customPort}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomPort(e.target.value)}
              onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && checkCustomPort()}
              min="1"
              max="65535"
              className="[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
            />
            <Button 
              onClick={checkCustomPort} 
              disabled={checkingCustom || !customPort}
              size="sm"
              variant="outline"
            >
              {checkingCustom ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Check if a specific port is available or get alternatives
          </p>
        </div>

        {/* Separator */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700"></div>
          <span className="text-xs text-muted-foreground">OR</span>
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700"></div>
        </div>

        {/* Generate Button */}
        <div className="flex gap-2 mb-3">
          <Button 
            onClick={generateSuggestions} 
            disabled={loading}
            className="flex-1"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Eye className="h-4 w-4 mr-2" />
            )}
            Generate Service Suggestions
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
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Suggestions List */}
        {suggestions.length > 0 ? (
          <div className="flex-1 space-y-2 overflow-y-auto min-h-0 mb-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Suggested Ports
              </h4>
              <div className="flex items-center gap-2">
                {isLoadedFromCache && (
                  <div className="text-xs text-amber-600 dark:text-amber-400" title="Data loaded from cache">
                    📋 Cached
                  </div>
                )}
                <div className="text-xs text-muted-foreground" title="Real-time port availability check">
                  ℹ️ Live Status
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {suggestions.slice(0, getMaxItems()).map((suggestion) => (
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
                        className={getStatusColor(suggestion)}
                      >
                        {getStatusText(suggestion)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {suggestion.reason}
                    </p>
                    {!suggestion.available && (suggestion.service || suggestion.container) && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        Used by: {suggestion.service || 'Unknown'} 
                        {suggestion.container && ` (${suggestion.container})`}
                      </p>
                    )}
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
            
            {/* Status Legend */}
            <div className="mt-3 p-2 bg-muted/30 rounded-lg">
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="font-medium mb-1">Port Status:</div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded bg-green-500"></div>
                  <span>Recommended: Best choice for this service</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded bg-blue-500"></div>
                  <span>Available: Free to use</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded bg-red-500"></div>
                  <span>In Use: Currently occupied</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <Eye className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No suggestions yet</p>
          </div>
        )}

        {/* Quick Generate for Common Services */}
        <div className="space-y-2 mt-auto">
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
  defaultSize: createResponsiveSizes({ w: 6, h: 6 }), // Medium preset: min + 4 width, min + 2 height
  minSize: createResponsiveSizes({ w: 4, h: 4 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 0.7 }),
  maxSize: createResponsiveSizes({ w: 12, h: 12 }),
  responsiveDisplay: {
    lg: 'detailed',
    md: 'normal',
    sm: 'compact',
    xs: 'compact'
  }
}